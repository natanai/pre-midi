import test from "node:test";
import assert from "node:assert/strict";
import {makePatch} from "../synth.js";
import {scopeAmplitudeAt,scopeWindowSeconds,scopeAudioBins} from "../soundScope.js";

test("sound scope windows include release and live delay repeats",()=>{
 const p=makePatch("init");
 assert.ok(scopeWindowSeconds(p)>=2.2);
 p.envelope.release=3;
 const long=scopeWindowSeconds(p);
 assert.ok(long>4.2,"release is not cropped to the old fixed window");
 p.effects.delayMix=.7;p.effects.delayTime=.9;p.effects.delayFeedback=.65;
 assert.ok(scopeWindowSeconds(p)>long,"delay tail extends the audible window");
 assert.equal(scopeWindowSeconds(p),12,"very long tails use the explicitly bounded first window");
});

test("stereo PCM bins preserve actual levels and distinct channel peaks",()=>{
 const channels=[Float32Array.from([0,.1,-.4,.2,0,.3,-.2,0]),
  Float32Array.from([0,-.8,.1,0,.6,-.3,0,0])];
 const buffer={numberOfChannels:2,length:8,sampleRate:8,getChannelData:index=>channels[index]};
 const [left,right]=scopeAudioBins(buffer,2);
 assert.deepEqual(left.map(x=>[x.low,x.high]),[[-.4,.2],[-.2,.3]]);
 assert.deepEqual(right.map(x=>[x.low,x.high]),[[-.8,.1],[-.3,.6]]);
 const half={...buffer,getChannelData:index=>Float32Array.from(channels[index],v=>v*.5)};
 const [quieter]=scopeAudioBins(half,2);
 assert.ok(quieter[0].rms<left[0].rms);
 assert.ok(quieter[1].high<left[1].high);
});

test("envelope helper uses the canonical ADSR shape without inventing ongoing sound",()=>{
 const p=makePatch("init");
 p.envelope={attack:.2,decay:.4,sustain:.35,release:.6};
 assert.equal(scopeAmplitudeAt(p,0),0);
 assert.ok(Math.abs(scopeAmplitudeAt(p,.2)-1)<1e-9);
 assert.ok(Math.abs(scopeAmplitudeAt(p,1)-.35)<1e-9);
 assert.ok(scopeAmplitudeAt(p,1.7)>0);
 assert.equal(scopeAmplitudeAt(p,2),0);
});

test("sample windows follow the real sample life and show long one-shots as a first window",()=>{
 const p={type:"sample"};
 assert.equal(scopeWindowSeconds(p,1.1),2.2);
 assert.ok(scopeWindowSeconds(p,4.5)>4.5);
 assert.equal(scopeWindowSeconds(p,25),12);
});
