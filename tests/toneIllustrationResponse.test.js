import test from "node:test";
import assert from "node:assert/strict";
import {modeledDrive,modeledToneWaveform} from "../toneIllustrationResponse.js";
import {modeledFilterResponse} from "../filterIllustrationResponse.js";
import {makePatch} from "../synth.js";
import {diagram} from "../soundIllustrations.js";

test("distortion model preserves zero-drive bypass and the host's compensated tanh characteristic",()=>{
 for(const x of [-1,-.63,0,.27,1]){
  assert.equal(modeledDrive(x,0),x);
  for(const drive of [.1,.35,1]){
   const k=1+Math.round(drive*100)*.65;
   const expected=Math.tanh(k*x)/Math.tanh(k)/(1+drive*1.1);
   assert.ok(Math.abs(modeledDrive(x,drive)-expected)<.0003);
  }
 }
});

test("reference waveform shows the filter and drive in playback order at one shared scale",()=>{
 const p=makePatch("init");p.filter.cutoff=800;p.effects.drive=.5;
 const wave=modeledToneWaveform(p);
 assert.equal(wave.input.length,320);
 assert.notDeepEqual(wave.input,wave.filtered);
 assert.deepEqual(wave.output,wave.filtered.map(value=>modeledDrive(value,.5)));
 const noDrive=modeledToneWaveform({...p,effects:{...p.effects,drive:0}});
 assert.deepEqual(noDrive.filtered,noDrive.output);
 const brighter=modeledToneWaveform({...p,filter:{...p.filter,cutoff:10000}});
 assert.deepEqual(wave.input,brighter.input);
 assert.notDeepEqual(wave.output,brighter.output);
 const graph=diagram(p,"filter",2);
 assert.equal(graph.handles[0].axes.length,2);
 assert.ok(graph.labels.some(label=>label.value.includes("reference tone")));
});

test("phase response and recorded-audio bypass are represented honestly",()=>{
 const filter={type:"lowpass",cutoff:1000,resonance:1};
 const response=modeledFilterResponse(filter,1000);
 assert.ok(Math.abs(response.phase+Math.PI/2)<1e-12);
 const p={type:"vocal",filter,drive:0,audioFilterBypassed:true};
 const wave=modeledToneWaveform(p);
 assert.deepEqual(wave.input,wave.output);
 const graph=diagram(p,"filter",1);
 assert.ok(graph.labels.some(label=>label.value==="filter off"));
 assert.deepEqual(graph.handles[0].axes.map(axis=>axis.path),[["drive"]]);
});
