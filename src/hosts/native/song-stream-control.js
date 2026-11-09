import {songUsesProcessingGraph} from '../../dsp/processing-graph.js';
// Source-linked native Song transport. Revisions are prepared on the control
// thread, including voice/filter/echo history, before an audio-clock handoff.
import {
 nativeRequest,ensureNativeOutput,claimNativeTransportEpoch,nativeTransportEpochCurrent
} from './session.js';
import {createNativeSongPagePublisher,nativeSongDelayRecipes} from './song-stream-page.js';
import {songDurationSteps} from '../../../songModel.js';
import {createNativePauseControl} from './transport-intent.js';

const cancelled=()=>Error('Native Song stream preparation was cancelled by a newer transport.');
const isLooping=value=>!!(typeof value==='function'?value():value);
const frameAt=(seconds,rate)=>Math.max(0,Math.ceil(seconds*rate-1e-9));
function announce(error){
 if(typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent?.(new CustomEvent('premidi-native-error',{detail:String(error?.message??error)}));
}
export async function playNativeSongStreamExperimental(song,{
 renderWindow,getRevision=null,getDocument=null,loop=false,countIn=0,recording=null,startStep=0,
 onStart=()=>{},onStop=()=>{},onPosition=()=>{},onProgress=()=>{},onCountIn=()=>{},pollIntervalMs=40
}={}){
 if(song?.kind!=='song'||typeof renderWindow!=='function'||songDurationSteps(song)<=0)
  throw Error('Native Song streaming requires a nonempty Song and source renderer.');
 if(!Number.isInteger(countIn)||countIn<0||countIn>2||!Number.isFinite(startStep)||startStep<0||
    !Number.isInteger(pollIntervalMs)||pollIntervalMs<0||pollIntervalMs>1000)
  throw Error('Invalid native Song transport timing.');
 const token=claimNativeTransportEpoch();
 let stopped=false,paused=false,timer=null,polling=false,revision=0,active=null,staging=null;
 let pending=Promise.resolve(),marker=getRevision?.(),operationGeneration=0,replacing=0,pauseRevision=0;
 const check=()=>{if(stopped||!nativeTransportEpochCurrent(token))throw cancelled();};
 const info=await ensureNativeOutput();check();
 const {owner}=await nativeRequest({action:'begin'});check();
 if(!Number.isSafeInteger(owner)||owner<=0)throw Error('Native Song transport did not issue an owner.');
 const pauseControl=createNativePauseControl({request:nativeRequest,owner,isStopped:()=>stopped,
  onChange:value=>{check();paused=value;pauseRevision++;}});
 const stop=async()=>{
  if(stopped)return;stopped=true;operationGeneration++;clearInterval(timer);
  // Global Stop cancels the active revision AND any prepared replacement.
  // Explicit owner keeps an old handle from cancelling a newer transport.
  try{await nativeRequest({action:'control',command:1,looping:false,owner});}
  catch(error){if(nativeTransportEpochCurrent(token))throw error;}
  finally{onStop();}
 };
 const status=()=>nativeRequest({action:'stream_status',owner,revision:active?.revision??revision});
 const fill=async(current,ack)=>{
  if(current.filling)return;current.filling=true;
  try{
   while(!current.publisher.finished&&current.publisher.acceptedSequence<ack+3){
    if(current.retryAfterAck!==null&&ack<=current.retryAfterAck)break;
    const result=await current.publisher.publishNext();check();
    if(!result.accepted){current.retryAfterAck=ack;break;}
    current.retryAfterAck=null;
   }
  }finally{current.filling=false;}
 };
 // Source data is immutable within a revision. An edit never reuses a packet
 // prepared from another document, and backpressure retries remain identical.
 const prepare=async(nextSong,step,{follow=false,lead=0,take=null,generation=operationGeneration,retries=0}={})=>{
  check();
  const document=structuredClone(nextSong),unit=60/document.bpm/4,length=songDurationSteps(document);
  if(!Number.isFinite(unit)||length<=0)throw Error('Add a Beat clip before playing this Song.');
  const looping=isLooping(loop),repeatCycles=looping?Infinity:follow&&active?.loop?Math.floor(step/length)+1:1;
  const current={document,unit,length,marker:getRevision?.(),loop:looping,revision:++revision,retryAfterAck:null,filling:false};
  const valid=()=>{check();if(current!==active&&generation!==operationGeneration)throw cancelled();return current.revision;};
  staging=current;
  await nativeRequest({action:'stream_begin',owner,revision:current.revision,processing:songUsesProcessingGraph(document)});valid();
  try{
   for(const recipe of nativeSongDelayRecipes(document)){
    await nativeRequest({action:'stream_delay',owner,revision:current.revision,...recipe});valid();
   }
   current.publisher=createNativeSongPagePublisher(document,{
    owner,revision:current.revision,sampleRate:info.sampleRate,info,renderWindow,
    loop:current.loop,repeatCycles,getRevision:valid
   });
   let target=frameAt(Math.min(Math.max(0,step),Math.max(0,(repeatCycles===Infinity?step+1:repeatCycles*length)-1e-6))*unit,info.sampleRate);
   let prepared=0,ack=0;
   const advance=async frame=>{
    while(prepared<frame){
     if(current.publisher.acceptedEndFrame<=prepared){
      const result=await current.publisher.publishNext();valid();
      if(!result.accepted)throw Error('Native Song reconstruction could not publish its next page.');
     }
     const end=Math.min(frame,current.publisher.acceptedEndFrame);
     await nativeRequest({action:'stream_advance',owner,revision:current.revision,frame:end});valid();
     prepared=end;ack=current.publisher.acceptedSequence;
    }
   };
   await advance(target);await fill(current,ack);valid();
   let due=null,preparedPauseRevision=pauseRevision;
   if(follow&&active){
    // Prepare ahead of the old audio clock, then atomically switch at that
    // exact frame. No callback parsing, allocation or mutation of live DSP.
    for(let attempt=0;attempt<12;attempt++){
     preparedPauseRevision=pauseRevision;
     const old=await status();valid();
     due=old.stream.positionFrame??frameAt(old.stream.positionSeconds,info.sampleRate);
     if(!paused)due+=1024;
     target=Math.round(due*unit/active.unit);
     if(!current.loop&&target>=frameAt(repeatCycles*length*unit,info.sampleRate)){
      throw Object.assign(Error("Reconstruct the edited arrangement phase."),{reconstructStep:(target/info.sampleRate/unit)%length});
     }
     if(target<prepared)throw Object.assign(Error("Reconstruct the edited arrangement phase."),{reconstructStep:target/info.sampleRate/unit});
     await advance(target);await fill(current,ack);valid();
     const latest=await status();valid();
     const now=latest.stream.positionFrame??frameAt(latest.stream.positionSeconds,info.sampleRate);
     if(paused||!follow||now+256<due)break;
     if(attempt===11)throw Error('Native Song edit preparation could not catch the output clock.');
    }
   }
   if(follow&&preparedPauseRevision!==pauseRevision)throw Error('Native Song pause changed during handoff');
   await nativeRequest({action:'stream_start',owner,revision:current.revision,bpm:document.bpm,
    count_in:lead,recording:take,seconds:Math.min(300,(length*unit-target/info.sampleRate)||300),due,hold:paused});
   check();active=current;marker=current.marker;staging=null;return current;
  }catch(error){
   try{await nativeRequest({action:'stream_stop',owner,revision:current.revision});}catch{}
   if(staging===current)staging=null;
   if(follow&&retries<2&&generation===operationGeneration&&
      /pause changed during handoff|handoff missed its prepared clock/.test(String(error?.message??error))){
    // Pause can freeze the old clock before a prepared future boundary. Retry
    // from the actual held phase; never wait for a clock which cannot advance.
    const old=await status();check();
    return prepare(document,old.stream.positionSeconds/active.unit,{follow,generation,retries:retries+1});
   }
   if(Number.isFinite(error.reconstructStep)&&generation===operationGeneration)return prepare(document,error.reconstructStep,{generation});
   throw error;
  }
 };
 const serialize=fn=>{const result=pending.then(fn);pending=result.catch(()=>{});return result;};
 const replace=(next,{step=null,follow=false}={})=>{
  const generation=++operationGeneration;replacing++;
  return serialize(async()=>{
   if(stopped||generation!==operationGeneration)return;
   const before=active;
   const state=await status();check();
   const currentStep=state.stream.positionSeconds/(before?.unit??60/next.bpm/4);
   return prepare(next,step??currentStep,{follow,generation});
  }).finally(()=>{replacing--;});
 };
 try{await prepare(song,startStep,{lead:countIn,take:recording});}
 catch(error){try{await stop();}catch{}throw error;}
 const poll=async()=>{
  if(stopped||polling)return;polling=true;
  const current=active;
  try{
   check();const value=await status();check();
   if(active!==current)return;
   if(value.owner!==owner){await stop();return;}
   if(value.deviceLost||value.stream?.fault)throw Error(value.deviceLost?'Native output disconnected. Select the output again in Settings.':'Native Song page callback fault '+value.stream.fault);
   if(value.stream?.state===3){await stop();return;}
   if(!value.stream||!Number.isSafeInteger(value.stream.ackSequence))throw Error('Native Song returned no page acknowledgment.');
   const seconds=value.stream.positionSeconds;
   if(!Number.isFinite(seconds)||seconds<0)throw Error('Native Song returned an invalid audio clock.');
   if(countIn){
    const frames=value.countInFrames??0,beatFrames=info.sampleRate*60/current.document.bpm;
    const index=Math.min(countIn*4-1,Math.floor((countIn*4*beatFrames-frames)/beatFrames));
    onCountIn({remaining:frames?countIn*4-index:0,beat:index%4+1,bar:Math.floor(index/4)+1});
   }
   const step=(seconds/current.unit)%current.length,bar=Math.floor(step/16);
   onPosition(bar,Math.floor(step%16));onProgress(bar,step%16);
   await fill(current,value.stream.ackSequence);
   if(!replacing&&!staging&&isLooping(loop)!==current.loop)await replace(getDocument?.()??current.document,{follow:true});
   // refresh() is the primary editor path; this catches a host revision which
   // changed before its refresh callback ran, without poisoning old pages.
   const nextMarker=getRevision?.();
   if(!replacing&&!staging&&active===current&&nextMarker!==marker&&getDocument)await replace(getDocument(),{follow:true});
  }catch(error){
   if(current!==active)return;
   if(!nativeTransportEpochCurrent(token)){try{await stop();}catch{}}
   else{announce(error);try{await stop();}catch{}}
  }finally{polling=false;}
 };
 onStart({backend:'native-cpp',streaming:true,sampleRate:info.sampleRate,captureOwner:recording});
 if(pollIntervalMs>0)timer=setInterval(()=>void poll(),pollIntervalMs);
 return {
  backend:'native-cpp',get paused(){return paused;},get diagnostics(){return {backend:'native-cpp',streaming:true,liveEdits:true};},
  poll,
  pause:pauseControl.pause,
  resume:pauseControl.resume,
  update:next=>replace(next,{follow:true}),
  seek:step=>{if(!Number.isFinite(step)||step<0)return Promise.reject(Error('Invalid Song seek position.'));return replace(getDocument?.()??active.document,{step});},
  stop
 };
}
