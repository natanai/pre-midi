import test from "node:test";
import assert from "node:assert/strict";
import {planPitch} from "../src/dsp/expression.js";
import {recordedSourceTravel} from "../src/dsp/recorded-source-clock.js";
import {alignedTimelineStart} from "../src/hosts/web/timeline-clock.js";
import {vocalSourceRange} from "../vocalEffects.js";
import {scheduleVocal} from "../songAudio.js";
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
// Independent render-quantum walk: interpolate the authored detune curve,
// sample vibrato at the control boundary, and consume buffer seconds.
function referenceTravel(plan,rate,age,sampleRate,controlStart){
 const total=plan.totalDuration,m=plan.movement,quantum=128/sampleRate;
 let at=0,source=0;
 while(at<age-1e-12){
  const absolute=controlStart+at,q=Math.floor((absolute+1e-10)*sampleRate/128)*quantum;
  const t=q-controlStart,position=Math.max(0,Math.min(1,t/total))*((plan.values?.length??1)-1);
  const i=Math.floor(position),j=Math.min(i+1,(plan.values?.length??1)-1);
  const bend=plan.values?plan.values[i]+(plan.values[j]-plan.values[i])*(position-i):plan.base;
  const enter=Math.min(m.delay,Math.max(0,total-.005)),end=Math.min(total,enter+.13);
  const gain=Math.max(0,Math.min(1,(t-enter)/Math.max(1e-9,end-enter)));
  const vibrato=t<0?0:m.depth*gain*Math.sin(2*Math.PI*m.rate*t);
  const next=Math.min(age,q+quantum-controlStart),duration=next-at;
  if(duration<=1e-12)throw Error("Reference quantum did not advance");
  source+=duration*Math.fround(rate)*2**(Math.fround(bend+vibrato)/1200);at=next;
 }
 return source;
}
test("source clocks include constant transposition, glide, bend and delayed vibrato",()=>{
 for(const sampleRate of [8000,48000])for(const fx of [
  {motion:{},bend:{shape:"straight",amount:2,rate:4}},
  {motion:{glide:-12,glideTime:1},bend:{shape:"straight",amount:2,rate:4}},
  {motion:{depth:90,rate:7.3,delay:.4},bend:{shape:"wave",amount:4,rate:2}},
  {motion:{depth:70,rate:3,glide:7,glideTime:.8},bend:{shape:"rise",amount:5,rate:4}}
 ]){
  const plan=planPitch({bend:fx.bend},fx.motion,0,3),rate=2**(5/12),controlStart=.137;
  // Deliberately seek backwards after extending cached checkpoints.
  for(const age of [2.3,.2,1.1,2.9])near(recordedSourceTravel(plan,rate,age,{sampleRate,controlStart}),referenceTravel(plan,rate,age,sampleRate,controlStart),2e-9);
 }
});
test("a held downward glide consumes less source and retains original phrase timing on seek",()=>{
 const recording={durationSeconds:4,trimSeconds:.1},clip={trimStartSeconds:.2,lengthSteps:30,effects:{movement:{glide:-12,glideTime:2}}};
 const before=structuredClone({recording,clip}),full=vocalSourceRange(recording,clip,.125);
 const resumed=vocalSourceRange(recording,clip,.125,8,{sampleRate:48000,controlStart:.2});
 assert.ok(resumed.offset<1.3-.15,"elapsed seconds must not skip the audio a downward glide has not played");
 assert.ok(resumed.offset>.3);near(resumed.duration+resumed.elapsed,full.totalDuration);
 near(resumed.sourceRemaining+resumed.offset,4);
 assert.deepEqual(resumed.pitch.values,full.pitch.values);
 assert.deepEqual({recording,clip},before);
});
test("transport seeks preserve each Clip's render-quantum phase",()=>{
 const sampleRate=48000,unit=60/137/4,clipStep=13;
 const start=alignedTimelineStart({sampleRate,currentTime:10.123},0,unit);
 const sought=alignedTimelineStart({sampleRate,currentTime:38.987},31,unit);
 const modulo=value=>((value%128)+128)%128;
 near(modulo((start+clipStep*unit)*sampleRate),modulo((sought-(31-clipStep)*unit)*sampleRate),1e-7);
 assert.ok(sought>=38.987+.07-1e-9);
});
test("browser resumed sources use the integrated offset and all remaining buffer content",()=>{
 const parameters=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
 const nodes=[],context={currentTime:0,sampleRate:48000,createBuffer:()=>({}),
  createGain:()=>({gain:parameters(),connect(){},disconnect(){}}),
  createStereoPanner:()=>({pan:parameters(),connect(){},disconnect(){}}),
  createBufferSource:()=>{const node={playbackRate:parameters(),detune:parameters(),connect(){},disconnect(){},start(...args){this.started=args;},stop(){}};nodes.push(node);return node;}};
 const event={recording:{id:"take",durationSeconds:4,trimSeconds:0},clip:{lengthSteps:32,gain:.8,effects:{movement:{glide:-12,glideTime:2}}}};
 scheduleVocal(context,{},event,10,.125,new Map([["take",{duration:4}]]),{elapsedSteps:8});
 const source=nodes[0],range=vocalSourceRange(event.recording,event.clip,.125,8,{sampleRate:48000,controlStart:9});
 near(source.started[1],range.offset);near(source.started[2],range.sourceRemaining);
 assert.ok(source.started[2]>range.duration,"source content seconds and audible wall seconds are distinct");
});
