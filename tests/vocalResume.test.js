import test from "node:test";
import assert from "node:assert/strict";
import {recordingEnvelope} from "../recordedAudio.js";
import {envelopeValueAt} from "../src/dsp/envelope-window.js";
import {planPitch,pitchCents} from "../src/dsp/expression.js";
import {prepareControlLfo} from "../src/hosts/web/oscillator.js";
import {modulationStateBefore,routeValueAt,smoothingAlpha} from "../src/dsp/modulation.js";

const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test("seeking into an attack, sustain or fade preserves the original clip envelope",()=>{
 const full=recordingEnvelope(0,2,.8,.4,.3);
 for(const elapsed of [.1,.8,1.8]){
  const resumed=recordingEnvelope(10,2-elapsed,.8,.4,.3,{elapsed,totalDuration:2});
  near(resumed[0].value,envelopeValueAt(full,elapsed));
  near(resumed.at(-1).time,12-elapsed);
  for(const after of [0,.02,.08])near(envelopeValueAt(resumed,10+after),envelopeValueAt(full,elapsed+after));
 }
 const short=recordingEnvelope(0,.2,1,2,3);
 const late=recordingEnvelope(1,.05,1,2,3,{elapsed:.15,totalDuration:.2});
 near(late[0].value,envelopeValueAt(short,.15));
});
test("resumed glide, bend and LFO phases follow clip age rather than a new onset",()=>{
 const note={bend:{shape:"wave",amount:3,rate:2}},motion={glide:-4,glideTime:1},elapsed=.35;
 const plan=planPitch(note,motion,10,1.65,0,{elapsed,totalDuration:2});
 near(plan.values[0],pitchCents(note,motion,elapsed,2),1e-4);
 near(plan.values.at(-1),pitchCents(note,motion,2,2),1e-4);
 let wave;
 const context={sampleRate:48000,createOscillator:()=>({frequency:{value:0},setPeriodicWave:next=>{wave=next;}}),
  createPeriodicWave:(real,imag)=>({real,imag})};
 prepareControlLfo(context,2,10,{elapsed});
 near(wave.real[1],Math.sin(2*Math.PI*2*elapsed));
 near(wave.imag[1],Math.cos(2*Math.PI*2*elapsed));
});
test("resumed modulation restores smoothed state with bounded history error",()=>{
 const sampleRate=4000,elapsed=2,gate=3,velocity=.7,pitch=64;
 for(const source of [{kind:"lfo",shape:"sine",rate:1.7},{kind:"envelope",envelope:{attack:1,decay:.8,sustain:.4,release:.2}},{kind:"velocity"}]){
  const route={source,smoothing:.08,depth:1,polarity:"bipolar"};
  const alpha=smoothingAlpha(route.smoothing,sampleRate);let reference=0;
  for(let i=0;i<elapsed*sampleRate;i++)reference=alpha*routeValueAt(route,{elapsed:i/sampleRate,gate,velocity,pitch})+(1-alpha)*reference;
  near(modulationStateBefore(route,{elapsed,gate,velocity,pitch},sampleRate),reference,2e-6);
 }
});
