// Control-thread-only preparation of one bounded Song onset page.
// This module never publishes a page to the real-time C++ callback. Native
// playback still refuses >4096 total onsets and cycles longer than 10 minutes
// until the host supports persistent voices, effects, acknowledgment and seek.
import {songDurationSteps} from "../../../songModel.js";
import {scheduledSongOnsetsInWindow} from "../../../songSchedule.js";

export function nextNativeOnsetPage(song,startStep,{maxSteps=256,maxOnsets=1024}={}){
 if(song?.kind!=="song")throw Error("Native onset pages require a Song.");
 if(!Number.isSafeInteger(startStep)||startStep<0)
  throw Error("Native onset page start must be a nonnegative Song step.");
 if(!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>4096)
  throw Error("Native onset page width must be 1 to 4096 steps.");
 if(!Number.isSafeInteger(maxOnsets)||maxOnsets<1||maxOnsets>4096)
  throw Error("Native onset page budget must be 1 to 4096 events.");
 const duration=songDurationSteps(song);
 if(startStep>=duration)return null;
 const last=Math.min(duration,startStep+maxSteps);
 let low=startStep+1,high=last,best=null;
 const overflow="Song exceeds "+maxOnsets+" scheduled note/voice onsets.";
 // Event count in [start,end) never decreases as end grows, so a binary
 // search finds the longest safe page. An onset is never split within a step.
 // This bounding work happens on the control thread, never inside audio().
 while(low<=high){
  const end=Math.floor((low+high)/2);
  try{
   const onsets=scheduledSongOnsetsInWindow(song,startStep,end,{maxEvents:maxOnsets});
   best={end,onsets};
   low=end+1;
  }catch(error){
   if(!(error instanceof Error)||!error.message.startsWith(overflow))throw error;
   high=end-1;
  }
 }
 if(!best)throw Error(
  "Song step "+startStep+" exceeds the native page onset budget of "+maxOnsets+
  ". Reduce simultaneous note/voice density.");
 let onsetCount=0;
 for(const entry of best.onsets.values())onsetCount+=entry.notes.length+entry.vocals.length;
 return {startStep,endStep:best.end,onsets:best.onsets,onsetCount,
  hasMore:best.end<duration};
}

// Metadata bridge from Song steps to the C++ PageDescriptor clock.
// This does not encode or publish playable packets: prepared=false prevents
// the callback mailbox from accepting an unverified resource manifest.
// The eventual native control worker must attach/bind real immutable assets,
// oscillator banks, drive recipes and delay resources before publication.
export function nativePageDescriptorCursor(song,{
 owner,revision,sampleRate,startStep=0,maxSteps=256,maxOnsets=1024,
 getRevision=null
}={}){
 if(song?.kind!=="song"||!Number.isSafeInteger(song.bpm)||song.bpm<40||song.bpm>240)
  throw Error("Native Song page clock needs a supported Song tempo.");
 if(!Number.isSafeInteger(owner)||owner<=0||
    !Number.isSafeInteger(revision)||revision<=0)
  throw Error("Native Song page clock needs positive transport owner and revision.");
 if(!Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000)
  throw Error("Native Song page clock needs an 8000–192000 Hz sample rate.");
 if(!Number.isSafeInteger(startStep)||startStep<0)
  throw Error("Native Song page clock start must be a nonnegative step.");
 if(getRevision!==null&&typeof getRevision!=="function")
  throw Error("Native Song page revision reader must be a function.");
 const sourceBpm=song.bpm,unit=60/sourceBpm/4,frameAt=step=>{
  const frames=Math.ceil(step*unit*sampleRate-1e-9);
  if(!Number.isSafeInteger(frames)||frames<0)
   throw Error("Native Song page frame is outside the safe transport range.");
  return frames;
 };
 let step=startStep,sequence=0;
 return {
  next(){
   if(song.bpm!==sourceBpm||(getRevision&&getRevision()!==revision))
    throw Error("Song changed during native page preparation; invalidate the transport revision.");
   const page=nextNativeOnsetPage(song,step,{maxSteps,maxOnsets});
   if(!page)return null;
   const startFrame=frameAt(page.startStep),endFrame=frameAt(page.endStep);
   if(endFrame<=startFrame)throw Error("Native Song page must advance the audio frame clock.");
   step=page.endStep;
   const descriptor={
    owner,revision,sequence:++sequence,startFrame,endFrame,
    onsets:page.onsetCount,resources:0,prepared:false,last:!page.hasMore
   };
   return {...page,descriptor};
  },
  get positionStep(){return step;},
  get sequence(){return sequence;}
 };
}
