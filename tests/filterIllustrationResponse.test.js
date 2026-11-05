import test from "node:test";
import assert from "node:assert/strict";
import {modeledFilterMagnitude,modeledFilterY,FILTER_ILLUSTRATION_SAMPLE_RATE}
 from "../filterIllustrationResponse.js";
import {diagram} from "../soundIllustrations.js";
import {makePatch} from "../synth.js";

const filter=(type,cutoff=2300,resonance=4)=>({type,cutoff,resonance});
const magnitude=(type,f,q=4)=>modeledFilterMagnitude(filter(type,2300,q),f);

test("modelled Web Audio biquad filters teach correct frequency bands",()=>{
 assert.ok(magnitude("lowpass",100)>.98);
 assert.ok(magnitude("lowpass",13000)<.05);
 assert.ok(magnitude("highpass",100)<.05);
 assert.ok(magnitude("highpass",13000)>.98);
 assert.ok(magnitude("bandpass",2300)>.95);
 assert.ok(magnitude("bandpass",100)<.1);
 assert.ok(magnitude("notch",2300)<.001);
 assert.ok(magnitude("notch",100)>.9);
 assert.ok(magnitude("lowpass",2300,16)>magnitude("lowpass",2300,.1),
  "increasing the native/Web Audio lowpass Q enhances the cutoff-region peak");
 assert.ok(magnitude("highpass",2300,16)>magnitude("highpass",2300,.1));
});

test("modeled response is finite, bounded on screen, and labeled as modeled",()=>{
 assert.equal(FILTER_ILLUSTRATION_SAMPLE_RATE,48000);
 for(const type of ["lowpass","highpass","bandpass","notch"])
  for(const q of [.1,.7,2,7,16])
   for(const hz of [50,72,140,500,1300,2300,4000,9000,14000]){
    const mag=magnitude(type,hz,q),y=modeledFilterY(mag);
    assert.ok(Number.isFinite(mag)&&mag>=0);
    assert.ok(Number.isFinite(y)&&y>=23&&y<=95);
   }
 const patch=makePatch("init");
 const original=diagram(patch,"filter");
 assert.ok(original.labels.some(label=>label.value==="48k model"));
 const low=original.paths[1].d;
 for(const type of ["highpass","bandpass","notch"]){
  patch.filter.type=type;
  assert.notEqual(diagram(patch,"filter").paths[1].d,low,
   "changing filter type changes the actual modeled transfer curve");
 }
 patch.filter.type="lowpass";patch.filter.resonance=16;
 assert.notEqual(diagram(patch,"filter").paths[1].d,low,
  "resonance edits update the same physical transfer model");
});
