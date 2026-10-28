import test from "node:test";
import assert from "node:assert/strict";
import {SCALE_ROOTS,SCALE_MODES,normalizeScaleGuide,isPitchInScale} from "../scaleGuide.js";

test("all twelve tonics and named modes have valid, distinct pitch-class sets",()=>{
 assert.equal(SCALE_ROOTS.length,12);
 assert.equal(SCALE_MODES.length,17);
 assert.equal(new Set(SCALE_MODES.map(mode=>mode.id)).size,SCALE_MODES.length);
 for(const mode of SCALE_MODES){
  assert.equal(mode.steps[0],0,mode.id+" must include its tonic");
  assert.deepEqual([...new Set(mode.steps)].sort((a,b)=>a-b),mode.steps);
  assert.ok(mode.steps.every(step=>Number.isInteger(step)&&step>=0&&step<12));
 }
});
test("major, minor, modal, pentatonic and blues intervals are applied at any octave",()=>{
 for(const root of [0,2,6,11]){
  for(const shift of [-24,-12,0,12,24]){
   assert.equal(isPitchInScale(root+shift,{root,mode:"major"}),true);
   assert.equal(isPitchInScale(root+shift+4,{root,mode:"major"}),true);
   assert.equal(isPitchInScale(root+shift+3,{root,mode:"major"}),false);
   assert.equal(isPitchInScale(root+shift+3,{root,mode:"natural-minor"}),true);
   assert.equal(isPitchInScale(root+shift+6,{root,mode:"blues"}),true);
   assert.equal(isPitchInScale(root+shift+6,{root,mode:"lydian"}),true);
   assert.equal(isPitchInScale(root+shift+6,{root,mode:"major-pentatonic"}),false);
  }
 }
});
test("harmonic and melodic minor are distinct from natural minor",()=>{
 assert.equal(isPitchInScale(71,{root:0,mode:"natural-minor"}),false);
 assert.equal(isPitchInScale(71,{root:0,mode:"harmonic-minor"}),true);
 assert.equal(isPitchInScale(69,{root:0,mode:"melodic-minor"}),true);
 assert.equal(isPitchInScale(68,{root:0,mode:"melodic-minor"}),false);
});
test("chromatic is nonrestrictive and invalid stored preferences fail safely",()=>{
 assert.deepEqual(normalizeScaleGuide(null),{root:0,mode:"chromatic",lock:false});
 assert.deepEqual(normalizeScaleGuide({root:99,mode:"unknown",lock:true}),{root:0,mode:"chromatic",lock:false});
 assert.deepEqual(normalizeScaleGuide({root:2,mode:"major",lock:true}),{root:2,mode:"major",lock:true});
 assert.equal(isPitchInScale(61,{root:0,mode:"chromatic"}),true);
 assert.equal(isPitchInScale(61,{root:0,mode:"unknown"}),true);
 assert.equal(isPitchInScale(NaN,{root:0,mode:"major"}),false);
 assert.equal(isPitchInScale(60.5,{root:0,mode:"major"}),false);
});
test("piano-roll scales are editor guidance; they never mutate note events",()=>{
 const notes=[{id:"1",pitch:60,start:0,duration:4},{id:"2",pitch:61,start:4,duration:4}];
 const original=structuredClone(notes);
 const guide=normalizeScaleGuide({root:0,mode:"major",lock:true});
 assert.equal(isPitchInScale(notes[0].pitch,guide),true);
 assert.equal(isPitchInScale(notes[1].pitch,guide),false);
 assert.deepEqual(notes,original);
});
