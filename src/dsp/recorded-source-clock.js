import {pitchPlanValueAt,vibratoCentsAt} from "./expression.js";
// AudioBufferSource playbackRate and detune are sampled once per 128-frame
// quantum. Source seconds are the sum of those rates, not wall seconds times
// transpose. See https://www.w3.org/TR/webaudio/#playback-AudioBufferSourceNode
const QUANTUM=128,CHECKPOINT_QUANTA=256,clocks=new Map(),MAX_CLOCKS=8;
const modulo=(value,size)=>((value%size)+size)%size;
export function recordedSourceTravel(pitch,rate,age,{sampleRate=48000,controlStart=0}={}){
 if(!Number.isFinite(age)||age<0||!Number.isFinite(rate)||rate<=0||!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(controlStart))
  throw Error("Invalid recorded source clock");
 const elapsed=Math.min(age,pitch.totalDuration??pitch.duration),base=Math.fround(rate);
 if(elapsed===0)return 0;
 if(!pitch.values&&!pitch.movement.depth)return base*elapsed;
 let phase=modulo(controlStart*sampleRate,QUANTUM);
 if(phase<1e-7||QUANTUM-phase<1e-7)phase=0;
 const key=JSON.stringify([sampleRate,phase,base,pitch.totalDuration??pitch.duration,
  pitch.values,pitch.base,pitch.movement.rate,pitch.movement.depth,pitch.movement.delay]);
 let clock=clocks.get(key);
 if(!clock){
  const quantum=QUANTUM/sampleRate,first=(QUANTUM-phase)/sampleRate;
  const at=time=>base*2**(Math.fround(pitchPlanValueAt(pitch,time)+vibratoCentsAt(pitch,time))/1200);
  const initial=at(-phase/sampleRate),prefix=[initial*first];
  clock={travel(time){
   if(time<=first)return initial*time;
   const after=time-first,quanta=Math.floor(after/quantum),block=Math.floor(quanta/CHECKPOINT_QUANTA);
   while(prefix.length<=block){
    const from=(prefix.length-1)*CHECKPOINT_QUANTA;let value=prefix.at(-1);
    for(let i=from;i<from+CHECKPOINT_QUANTA;i++)value+=at(first+i*quantum)*quantum;
    prefix.push(value);
   }
   let value=prefix[block];
   for(let i=block*CHECKPOINT_QUANTA;i<quanta;i++)value+=at(first+i*quantum)*quantum;
   return value+at(first+quanta*quantum)*Math.max(0,after-quanta*quantum);
  }};
  if(clocks.size>=MAX_CLOCKS)clocks.delete(clocks.keys().next().value);
  clocks.set(key,clock);
 }
 return clock.travel(elapsed);
}
