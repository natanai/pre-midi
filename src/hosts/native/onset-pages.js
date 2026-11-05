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
