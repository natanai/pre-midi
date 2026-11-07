import test from "node:test";
import assert from "node:assert/strict";
import {modeledModulationTrace} from "../modulationIllustrationResponse.js";
import {defaultSource} from "../src/dsp/modulation.js";
import {diagram,diagramPageCount} from "../soundIllustrations.js";
import {makePatch} from "../synth.js";

const route=(kind,smoothing=.08)=>({id:"test",source:defaultSource(kind),
 target:"filter.cutoff",unit:"octaves",depth:2,polarity:"unipolar",smoothing});

test("smoothing matches the analytic step response from note onset, rather than changing only a handle",()=>{
 const r=route("velocity"),trace=modeledModulationTrace(r,{duration:.5,points:21});
 for(let i=0;i<trace.times.length;i++){
  const expected=1.4*(1-Math.exp(-(trace.times[i]+1/48000)/r.smoothing));
  assert.ok(Math.abs(trace.smoothed[i]-expected)<2e-12);
 }
 assert.ok(trace.smoothed[1]<trace.raw[1]*.5);
 assert.ok(trace.smoothed.at(-1)>trace.raw.at(-1)*.99);
});

test("all movement sources show their smoothed result on both overview and detail pages",()=>{
 for(const kind of ["lfo","velocity","keytrack","envelope"]){
  const p=makePatch("init");p.modulation={version:1,routes:[route(kind,0)]};
  const before=Array.from({length:diagramPageCount(p,"modulation")},(_,i)=>diagram(p,"modulation",i));
  p.modulation.routes[0].smoothing=.1;
  for(let i=0;i<before.length;i++){
   const after=diagram(p,"modulation",i);
   const result=graph=>graph.paths.find(path=>!path.secondary&&path.links.includes("modulation.routes.0"));
   assert.notEqual(result(before[i]).d,result(after).d,kind+" page "+i);
  }
  const flat=modeledModulationTrace({...route(kind),smoothing:0});
  assert.deepEqual(flat.raw,flat.smoothed,"zero smoothing must bypass the filter");
 }
});

test("smoothing reduces a fast LFO and preserves negative movement depth",()=>{
 const r={...route("lfo",.1),source:{kind:"lfo",shape:"sine",rate:12},polarity:"bipolar"};
 const trace=modeledModulationTrace(r);
 const tail=trace.smoothed.filter((_,i)=>trace.times[i]>.7);
 const expected=2/Math.sqrt(1+(2*Math.PI*12*.1)**2);
 assert.ok(Math.abs(Math.max(...tail)-expected)<.01);
 const opposite=modeledModulationTrace({...r,depth:-2});
 for(let i=0;i<trace.smoothed.length;i++)
  assert.ok(Math.abs(trace.smoothed[i]+opposite.smoothed[i])<1e-12);
});
