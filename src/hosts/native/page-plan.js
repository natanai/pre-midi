// Control-thread preparation for the future stateful C++ Song page host.
// Native voice packets currently encode session-local seconds (readPlan bounds
// start <=601); these transforms preserve the absolute sample frame while
// keeping every encoder-visible time relative to the page's absolute first
// frame. They are NOT called by current playNative(), and do not relax limits.
export const nativeFrameAt=(seconds,sampleRate)=>{
 if(!Number.isFinite(seconds)||seconds<0||
    !Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)
  throw Error("Invalid native absolute-frame time or sample rate");
 const at=Math.max(0,Math.ceil(seconds*sampleRate-1e-9));
 if(!Number.isSafeInteger(at)||at<0)
  throw Error("Native absolute-frame counter exceeds the safe range");
 return at;
};

export function rebaseNativePlanToPage(plan,pageStartFrame,sampleRate){
 if(!Number.isSafeInteger(pageStartFrame)||pageStartFrame<0)
  throw Error("Native page frame origin must be a nonnegative safe integer");
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)
  throw Error("Native page sample rate is out of range");
 if(!["pre-midi-synth-voice","pre-midi-sample-voice"].includes(plan?.contract))
  throw Error("Unsupported native voice contract for Song paging");
 // Compute the difference in *frames* before converting back to seconds.
 // Subtracting large whole-second Song times can create an avoidable one-frame
 // error on odd sample rates, particularly at non-bar page boundaries.
 const localTime=seconds=>{
  const originalFrame=nativeFrameAt(seconds,sampleRate);
  if(originalFrame<pageStartFrame)
   throw Error("Native page includes an event preceding its source frame");
  const relativeFrames=seconds*sampleRate-pageStartFrame;
  const value=Math.max(0,relativeFrames/sampleRate);
  if(nativeFrameAt(value,sampleRate)!==originalFrame-pageStartFrame)
   throw Error("Native Song page conversion would shift an audio frame");
  return value;
 };
 const rebased={...plan,
  start:localTime(plan.start),
  off:localTime(plan.off),
  end:localTime(plan.end),
  graphEnd:localTime(plan.graphEnd)};
 if(plan.audibleEnd!==undefined)
  rebased.audibleEnd=localTime(plan.audibleEnd);
 if(plan.contract==="pre-midi-synth-voice"){
  rebased.amplitude={...plan.amplitude,
   end:localTime(plan.amplitude.end),
   events:plan.amplitude.events.map(event=>({...event,time:localTime(event.time)}))};
  rebased.filter={...plan.filter,sweepEnd:localTime(plan.filter.sweepEnd)};
  rebased.oscillators=plan.oscillators.map(oscillator=>({
   ...oscillator,pitch:{...oscillator.pitch,
    start:localTime(oscillator.pitch.start)}
  }));
 }else{
  rebased.events=plan.events.map(event=>({...event,time:localTime(event.time)}));
  rebased.pitch={...plan.pitch,start:localTime(plan.pitch.start)};
  if(plan.sweep)rebased.sweep={...plan.sweep,sweepEnd:localTime(plan.sweep.sweepEnd)};
 }
 if(plan.automation)rebased.automation={...plan.automation,
  points:plan.automation.points.map(point=>({...point,time:localTime(point.time)}))};
 if(rebased.start>601)
  throw Error("Native page voice starts beyond the bounded session-local clock");
 return rebased;
}
export function rebaseNativePlansToPage(plans,pageStartFrame,sampleRate){
 if(!Array.isArray(plans)||plans.length>4096)
  throw Error("Native Song page exceeds 4096 prepared voices");
 return plans.map(plan=>rebaseNativePlanToPage(plan,pageStartFrame,sampleRate));
}
