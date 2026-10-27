import test from "node:test";
import assert from "node:assert/strict";
import {signalStats,difference,crossingFrequency,harmonicMetrics} from "./audio-quality/metrics.js";
const rate=48000,n=16384,hz=997*rate/n;
const tone=(f,level=1)=>Float64Array.from({length:n},(_,i)=>level*Math.sin(2*Math.PI*f*i/rate));
test("PCM measurements recover known sine tuning, RMS, DC and discontinuities",()=>{
 const samples=tone(hz,.5),stats=signalStats(samples);
 assert.ok(Math.abs(stats.rms-.5/Math.sqrt(2))<1e-12);
 assert.ok(Math.abs(stats.dc)<1e-12);
 assert.ok(Math.abs(1200*Math.log2(crossingFrequency(samples,rate)/hz))<.01);
 const offset=Float64Array.from(samples,x=>x+.1);
 assert.ok(Math.abs(signalStats(offset).dc-.1)<1e-12);
 assert.equal(signalStats([0,0,.4,.4]).maxStep,.4);
 assert.equal(signalStats([0,NaN,Infinity]).nonFinite,2);
 assert.equal(signalStats([0,1,-1]).clipped,2);
});
test("spectral estimator separates legitimate harmonics from injected folded alias energy",()=>{
 const clean=tone(hz),distorted=Float64Array.from(clean,(x,i)=>x+.1*Math.sin(4*Math.PI*hz*i/rate));
 const alias=tone(rate-11*hz,.1),bad=Float64Array.from(distorted,(x,i)=>x+alias[i]);
 const good=harmonicMetrics(distorted,rate,hz),dirty=harmonicMetrics(bad,rate,hz);
 assert.ok(Math.abs(good.thdDb+20)<.001);
 assert.ok(good.offHarmonicDb<-100);
 assert.ok(Math.abs(dirty.offHarmonicDb+20)<.1);
 assert.ok(dirty.offHarmonicDb-good.offHarmonicDb>60);
});
test("mutated tuning, clicks, gain and non-repeatable PCM exceed policy gates",()=>{
 const clean=tone(hz,.5),detuned=tone(hz*2**(5/1200),.5);
 assert.ok(Math.abs(1200*Math.log2(crossingFrequency(detuned,rate)/hz))>4.9);
 const click=Float64Array.from(clean);click[100]+=.1;
 assert.ok(signalStats(Float64Array.from(click,(x,i)=>x-clean[i])).maxStep>.09);
 assert.ok(difference(clean,click).max>.09);
 assert.ok(difference(clean,Float64Array.from(clean,x=>x*1.1)).rms>.03);
});

test("reference regression gate rejects altered gain and harmonic structure",async()=>{
 const {compareReference}=await import("./audio-quality/metrics.js");
 const row={id:"synth/sine/69",sampleRate:48000,metrics:{rms:.1,peak:.2,harmonicPowerRatios:[1,0,0]}};
 const reference={tolerance:{level:{absolute:.0001,relative:.05},harmonicPower:{absolute:.0002,relative:.1}},
  cases:[{id:row.id,sampleRate:row.sampleRate,...row.metrics}]};
 assert.equal(compareReference([row],reference).status,"pass");
 const bad=structuredClone(row);bad.metrics.rms*=1.2;bad.metrics.harmonicPowerRatios[1]=.1;
 assert.equal(compareReference([bad],reference).failures.length,2);
 assert.equal(compareReference([],reference).status,"fail");
});
