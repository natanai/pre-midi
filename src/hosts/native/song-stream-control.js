// Opt-in Tauri Song-stream control bridge. Never silently substitutes Web Audio.
// Not the default player: unqualified seek, loop, live edits and microphone
// handoffs must stop visibly until revision/phase reconstruction is completed.
import {
 nativeRequest,ensureNativeOutput,claimNativeTransportEpoch,nativeTransportEpochCurrent
} from "./session.js";
import {createNativeSongPagePublisher,nativeSongDelayRecipes} from "./song-stream-page.js";
import {songDurationSteps} from "../../../songModel.js";

const STOPPED=0,FINISHED=3;
const isLooping=loop=>typeof loop==="function"?!!loop():!!loop;
const cancelled=()=>Error("Native Song stream preparation was cancelled by a newer transport.");
function announce(error){
 if(typeof globalThis.CustomEvent==="function"&&
    typeof globalThis.dispatchEvent==="function"){
  globalThis.dispatchEvent(new CustomEvent("premidi-native-error",{
   detail:String(error?.message??error)
  }));
 }
}
export async function playNativeSongStreamExperimental(song,{
 renderWindow,getRevision=null,loop=false,countIn=0,recording=null,startStep=0,
 onStart=()=>{},onStop=()=>{},onPosition=()=>{},onProgress=()=>{},
 pollIntervalMs=40
}={}){
 if(song?.kind!=="song"||typeof renderWindow!=="function")
  throw Error("Native Song streaming requires a source-linked Song renderer.");
 if(songDurationSteps(song)<=0)throw Error("Add a Beat clip before playing this Song.");
 if(startStep!==0||countIn!==0||recording!==null||isLooping(loop))
  throw Error("Experimental native Song streaming currently supports playback from the start without looping, count-in or microphone recording.");
 if(!Number.isInteger(pollIntervalMs)||pollIntervalMs<0||pollIntervalMs>1000)
  throw Error("Invalid native Song stream poll interval.");
 const recipes=nativeSongDelayRecipes(song);
 const revision=1,initialMarker=typeof getRevision==="function"?getRevision():null;
 const readRevision=()=>typeof getRevision==="function"&&
  getRevision()!==initialMarker?0:revision;
 const token=claimNativeTransportEpoch();
 const assertCurrent=()=>{
  if(!nativeTransportEpochCurrent(token)||readRevision()!==revision)throw cancelled();
 };
 let owner=0,begun=false,publisher,info;
 try{
  assertCurrent();
  info=await ensureNativeOutput();assertCurrent();
  const claim=await nativeRequest({action:"begin"});
  owner=claim.owner;
  if(!Number.isSafeInteger(owner)||owner<=0)
   throw Error("Native Song stream transport did not issue an owner.");
  assertCurrent();
  await nativeRequest({action:"stream_begin",owner,revision});
  begun=true;assertCurrent();
  for(const recipe of recipes){
   await nativeRequest({action:"stream_delay",owner,revision,...recipe});
   assertCurrent();
  }
  publisher=createNativeSongPagePublisher(song,{
   owner,revision,sampleRate:info.sampleRate,info,renderWindow,getRevision:readRevision
  });
  // Queue the initial three contiguous windows before callback activation.
  // Never start a live device with no ready page.
  for(let i=0;i<3;i++){
   const result=await publisher.publishNext();
   if(!result.accepted)
    throw Error("Native Song stream could not preload its first three pages.");
   assertCurrent();
   if(result.finished)break;
  }
  await nativeRequest({action:"stream_start",owner,revision});assertCurrent();
 }catch(error){
  if(begun)try{await nativeRequest({action:"stream_stop",owner,revision});}catch{}
  throw error;
 }
 let stopped=false,paused=false,polling=false,timer=null,retryAfterAck=null;
 const stepSeconds=60/song.bpm/4;
 const stop=async()=>{
  if(stopped)return;
  stopped=true;
  if(timer!==null)clearInterval(timer);
  try{await nativeRequest({action:"stream_stop",owner,revision});}
  catch(error){
   // studio.js Stop first calls cancelNativeTransport() (global owner stop),
   // then invokes this handle's stop. In that documented order the Rust
   // revision is already invalid: this cleanup must not reject unhandled.
   if(nativeTransportEpochCurrent(token))throw error;
  }finally{onStop();}
 };
 const fail=async error=>{
  if(stopped)return;
  announce(error);
  try{await stop();}catch{}
 };
 const poll=async()=>{
  if(stopped||polling)return;
  polling=true;
  try{
   assertCurrent();
   if(isLooping(loop))throw Error("Native Song streaming loop changes require a new transport.");
   const status=await nativeRequest({action:"stream_status",owner,revision});
   if(stopped)return;
   assertCurrent();
   if(status.owner!==owner)
    throw Error("Native Song transport owner changed during playback.");
   if(status.deviceLost)
    throw Error("Native Song output disconnected. Choose an output in Settings.");
   const stream=status.stream;
   if(!stream||!Number.isSafeInteger(stream.ackSequence))
    throw Error("Native Song stream did not report page acknowledgment.");
   if(stream.fault)
    throw Error("Native Song page callback failed ("+stream.fault+"). Playback stopped rather than dropping audio.");
   if(stream.state===FINISHED){await stop();return;}
   if(stream.state===STOPPED)
    throw Error("Native Song transport stopped before the final page.");
   const seconds=stream.positionSeconds;
   if(!Number.isFinite(seconds)||seconds<0)
    throw Error("Native Song stream returned an invalid audio clock.");
   const step=seconds/stepSeconds,bar=Math.floor(step/16);
   onPosition(bar,Math.floor(step%16));
   onProgress(bar,step%16);
   // Keep at most three pages published beyond the callback's last ACK.
   // After backpressure, wait for ACK to advance before retrying exactly
   // the SAME pending page, avoiding high-rate packet retransmission.
   while(!publisher.finished&&publisher.acceptedSequence<stream.ackSequence+3){
    if(retryAfterAck!==null&&stream.ackSequence<=retryAfterAck)break;
    const result=await publisher.publishNext();
    if(stopped)return;
    assertCurrent();
    if(!result.accepted){retryAfterAck=stream.ackSequence;break;}
    retryAfterAck=null;
   }
  }catch(error){await fail(error);}
  finally{polling=false;}
 };
 const unsupported=async operation=>{
  const error=Error("Native streamed Song "+operation+" is not yet qualified. Playback stopped to protect timing and recorded audio.");
  await fail(error);throw error;
 };
 onStart({backend:"native-cpp",streaming:true,sampleRate:info.sampleRate});
 if(pollIntervalMs>0)timer=setInterval(()=>void poll(),pollIntervalMs);
 return {
  backend:"native-cpp",
  get paused(){return paused;},
  get diagnostics(){return {backend:"native-cpp",streaming:true,liveEdits:false};},
  async poll(){return poll();},
  async pause(){
   if(stopped)return;
   await nativeRequest({action:"control",command:2,looping:false,owner});
   paused=true;
  },
  async resume(){
   if(stopped)return;
   await nativeRequest({action:"control",command:3,looping:false,owner});
   paused=false;
  },
  async update(){return unsupported("live editing");},
  async seek(){return unsupported("seeking");},
  async stop(){return stop();}
 };
}
