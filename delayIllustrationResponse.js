// Read-only impulse-response model for the Sound delay illustration.
//
// Web Audio: audio.js sends mix*.55 into the DelayNode and returns it through
// wet gain .8, while retaining 1-mix*.4 of the original dry signal.
// Native: native/delay.hpp follows those gains with a fixed 128-frame
// feedback-cycle lag. This model explains that same signal routing; it does
// not process audio or alter the host effects or portable Sound format.
export const DELAY_MODEL_SAMPLE_RATE=48000;
export const DELAY_FEEDBACK_QUANTUM=128;
export function modeledDelayTaps(effects,{sampleRate=DELAY_MODEL_SAMPLE_RATE,wetCount=3}={}){
 const {delayMix,delayTime,delayFeedback}=effects??{};
 if(!Number.isFinite(delayMix)||delayMix<0||delayMix>1||
  !Number.isFinite(delayTime)||delayTime<.05||delayTime>1||
  !Number.isFinite(delayFeedback)||delayFeedback<0||delayFeedback>.8||
  !Number.isFinite(sampleRate)||sampleRate<=0||
  !Number.isInteger(wetCount)||wetCount<0||wetCount>32)
  throw RangeError("Invalid educational delay parameters");
 const dry=1-delayMix*.4;
 const firstWet=delayMix*.55*.8;
 return [
  {index:0,kind:"dry",time:0,level:dry},
  ...Array.from({length:wetCount},(_,n)=>({
   index:n+1,kind:"echo",
   time:(n+1)*delayTime+n*DELAY_FEEDBACK_QUANTUM/sampleRate,
   level:firstWet*delayFeedback**n
  }))
 ];
}
