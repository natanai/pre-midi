import {effectiveDelayEffects} from "../../dsp/processing-chain.js";
// JavaScript control-thread source for native Song pages.
// This is deliberately NOT the shipping Song transport. Callers must supply
// the existing audio.js renderEventsInWindow function and native owner/revision.
// The C++ DeviceHost, not JavaScript, validates and pins every page resource.
import {nativePageDescriptorCursor} from "./onset-pages.js";
import {rebaseNativePlansToPage} from "./page-plan.js";
import {
 encodeNativeSession,nativePlans,nativeRequiredAssets,prepareNativeAssets,nativeRequest
} from "./session.js";
import {vocalEffects} from "../../../vocalEffects.js";

const MAX_PACKET_BYTES=16*1024*1024;
const STREAM_DELAY_LIMIT=32;
const validRevision=(read,revision)=>{
 if(read()!==revision)throw Error("Native Song changed during page preparation; stop and create a new stream revision.");
};

// A streaming Session must own its entire shared delay-bus catalog BEFORE
// the callback starts. Synth packets round time/feedback to float32, while
// recorded vocal packets preserve their original float64 values.
export function nativeSongDelayRecipes(song){
 if(song?.kind!=="song")throw Error("Native delay catalog requires a Song.");
 const recipes=new Map();
 const add=(mix,time,feedback,round=false)=>{
  if(!(mix>0))return;
  const recipe={mix,time:round?Math.fround(time):time,
   feedback:round?Math.fround(feedback):feedback};
  if(!Object.values(recipe).every(Number.isFinite))
   throw Error("Nonfinite native Song delay parameters.");
  const key=JSON.stringify([recipe.mix,recipe.time,recipe.feedback]);
  if(!recipes.has(key))recipes.set(key,recipe);
  if(recipes.size>STREAM_DELAY_LIMIT)
   throw Error("Native Song exceeds 32 shared delay-bus recipes.");
 };
 const instruments=[
  ...(song.beats??[]).flatMap(beat=>beat.instruments??[]),
  ...(song.tracks??[]).flatMap(track=>track.freeform?.instruments??[])
 ];
 for(const instrument of instruments){
  // Versioned legacy instruments have a patch directly, while modern
  // Instruments own their Sound patches. Both use the same native renderer.
  const patches=instrument.sounds?.length?
   instrument.sounds.map(sound=>sound.patch):instrument.patch?[instrument.patch]:[];
  for(const patch of patches){
   if(patch?.type==="synth"&&patch.effects){const fx=effectiveDelayEffects(patch,patch.effects);add(fx.delayMix,fx.delayTime,fx.delayFeedback,true);}
   else if(patch?.type==="sample"){const fx=effectiveDelayEffects(patch,patch);add(fx.delayMix??0,fx.delayTime??.24,fx.delayFeedback??.26);}
  }
 }
 for(const track of song.tracks??[])if(track.kind==="vocal")
  for(const clip of track.clips??[]){
   const fx=effectiveDelayEffects(clip.effects??{},vocalEffects(clip));
   add(fx.delayMix,fx.delayTime,fx.delayFeedback);
  }
 return [...recipes.values()];
}

export async function prepareNativeSongStreamPage(song,page,{
 sampleRate,info,renderWindow,loadAssets=prepareNativeAssets,
 getRevision=()=>page.descriptor.revision
}={}){
 if(song?.kind!=="song"||!page?.descriptor||typeof renderWindow!=="function")
  throw Error("Native Song page requires a source-linked Song window renderer.");
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)
  throw Error("Native Song page requires a supported sample rate.");
 const {descriptor}=page;
 if(descriptor.prepared||descriptor.resources!==0||
    descriptor.onsets!==page.onsetCount)
  throw Error("JavaScript cannot claim native C++ resource preparation.");
 validRevision(getRevision,descriptor.revision);
 const events=renderWindow(song,page.startStep,page.endStep,{maxEvents:4096});
 if(!Array.isArray(events)||events.length!==page.onsetCount)
  throw Error("Native Song window changed its scheduled onset count.");
 const assets=await loadAssets(nativeRequiredAssets(events),info);
 validRevision(getRevision,descriptor.revision);
 const plans=nativePlans(events,assets,60/song.bpm/4);
 if(plans.length!==events.length)
  throw Error("Native Song page contains an inaudible or invalid recorded Clip. Correct its trim before streaming.");
 const rebased=rebaseNativePlansToPage(plans,descriptor.startFrame,sampleRate);
 const catalog=nativeSongDelayRecipes(song);
 for(const plan of rebased){
  const fx=plan.contract==="pre-midi-synth-voice"?effectiveDelayEffects(plan.patch,plan.patch.effects):plan;
  if(!(fx?.delayMix>0))continue;
  const time=plan.contract==="pre-midi-synth-voice"?Math.fround(fx.delayTime):fx.delayTime;
  const feedback=plan.contract==="pre-midi-synth-voice"?Math.fround(fx.delayFeedback):fx.delayFeedback;
  if(!catalog.some(recipe=>recipe.mix===fx.delayMix&&recipe.time===time&&recipe.feedback===feedback))
   throw Error("Native Song delay recipe was not registered before playback.");
 }
 const packet=encodeNativeSession(rebased,sampleRate);
 if(packet.byteLength>MAX_PACKET_BYTES)
  throw Error("Native Song page exceeds its 16 MiB packet budget.");
 validRevision(getRevision,descriptor.revision);
 // Do not set prepared:true: only native PreparedPageLease can do that.
 return {descriptor,packet,events:events.length};
}

// A retry is exactly the same immutable packet and sequence. The only
// advancement allowed after C++ backpressure is after accepted:true.
// Source edits, owner replacement or asset errors fail closed; no page drops.
export function createNativeSongPagePublisher(song,{
 owner,revision,sampleRate,info,renderWindow,
 getRevision=()=>revision,maxSteps=64,maxOnsets=512,
 request=nativeRequest,loadAssets=prepareNativeAssets
}={}){
 if(!info||typeof request!=="function"||typeof renderWindow!=="function")
  throw Error("Native Song stream needs an output, renderer and request bridge.");
 const cursor=nativePageDescriptorCursor(song,{
  owner,revision,sampleRate,maxSteps,maxOnsets,getRevision
 });
 let pending=null,finished=false,poisoned=null,active=false,acceptedSequence=0;
 return {
  get acceptedSequence(){return acceptedSequence;},
  get finished(){return finished;},
  get pendingSequence(){return pending?.descriptor.sequence??null;},
  async publishNext(){
   if(poisoned)throw poisoned;
   if(active)throw Error("Native Song publisher already has a page in flight.");
   if(finished)return {accepted:false,finished:true};
   active=true;
   try{
    validRevision(getRevision,revision);
    if(!pending){
     const next=cursor.next();
     if(!next){finished=true;return {accepted:false,finished:true};}
     // Keep this page identity through transient native backpressure.
     pending={descriptor:next.descriptor,source:next,prepared:null};
    }
    if(!pending.prepared)pending.prepared=await prepareNativeSongStreamPage(song,pending.source,{
     sampleRate,info,renderWindow,loadAssets,getRevision
    });
    validRevision(getRevision,revision);
    const {descriptor,packet}=pending.prepared;
    const result=await request({
     action:"stream_page",owner,revision,sequence:descriptor.sequence,
     start_frame:descriptor.startFrame,end_frame:descriptor.endFrame,
     onsets:descriptor.onsets,last:descriptor.last,data:Array.from(packet)
    });
    validRevision(getRevision,revision);
    if(typeof result?.accepted!=="boolean")
     throw Error("Native Song page transport gave no publication acknowledgment.");
    if(result.accepted){
     acceptedSequence=descriptor.sequence;
     finished=descriptor.last;
     pending=null;
    }
    return {accepted:result.accepted,finished,sequence:descriptor.sequence,
     last:descriptor.last,backpressure:!result.accepted,
     stream:result.stream};
   }catch(error){
    poisoned=error instanceof Error?error:Error(String(error));
    throw poisoned;
   }finally{active=false;}
  }
 };
}
