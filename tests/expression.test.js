import test from "node:test";
import assert from "node:assert/strict";
import {create,parse,validate} from "../schema.js";
import {makePatch,PRESETS,validatePatch} from "../synth.js";
import {SAMPLE_LIBRARY,makeSamplerPatch} from "../samples.js";
import {BEND_SHAPES,bendSemitones,movement,validateBend,validateMovement,pitchCents,schedulePitch} from "../expression.js";

test("original expressive synths are distinct editable and valid",()=>{
 const options=PRESETS.filter(p=>p.category==="Expressive");
 assert.ok(options.length>=6);
 const hashes=new Set();
 for(const p of options){
  const patch=makePatch(p.id);
  assert.deepEqual(validatePatch(patch),[],p.name);
  hashes.add(JSON.stringify(patch.oscillators)+JSON.stringify(patch.movement));
 }
 assert.equal(hashes.size,options.length);
});
test("recorded guitars expose the same expressive instrument movement contract",()=>{
 for(const id of ["steel-lap-cry","steel-haunt","nylon-sob"]){
  const sample=SAMPLE_LIBRARY.find(p=>p.id===id);
  assert.ok(sample,id);
  const patch=makeSamplerPatch(sample);
  assert.deepEqual(validatePatch(patch),[],id);
  assert.ok(patch.zones.length>=16);
  assert.notEqual(patch.movement.glide,0);
 }
});
test("each bend shape changes pitch on held notes without changing the note's canonical pitch",()=>{
 const doc=create(),note=doc.instruments[0].chunks[0].notes[0];
 const shapes=BEND_SHAPES.map(([key])=>key);
 for(const shape of shapes) {
  note.bend={shape,amount:4,rate:3.4};
  assert.deepEqual(validate(doc),[],shape);
  assert.deepEqual(parse(JSON.stringify(doc)),doc);
  const samples=Array.from({length:36},(_,i)=>bendSemitones(note.bend,i/35,i/35));
  if(shape!=="straight")assert.ok(samples.some(s=>Math.abs(s)>.05),shape);
  assert.equal(note.pitch,60);
 }
});
test("bend boundaries and malformed values are validated",()=>{
 assert.ok(validateBend({shape:"wail",amount:15,rate:4}).length);
 assert.ok(validateBend({shape:"bogus",amount:2,rate:4}).length);
 assert.ok(validateBend({shape:"wave",amount:2,rate:0}).length);
 assert.deepEqual(validateBend(undefined),[]);
 assert.ok(validateMovement({glide:NaN}).length);
 assert.ok(validateMovement({tone:3}).length);
 assert.equal(bendSemitones({shape:"scoop",amount:4,rate:4},0),-4);
 assert.ok(Math.abs(bendSemitones({shape:"scoop",amount:4,rate:4},1))<.001);
 assert.ok(Math.abs(bendSemitones({shape:"dip",amount:4,rate:4},.5)+4)<.001);
});
test("instrument glide and per-note bend coexist without requiring a new note type",()=>{
 const doc=create(),note=doc.instruments[0].chunks[0].notes[0];
 note.duration=16;
 note.bend={shape:"rise",amount:3,rate:4};
 const m=movement({movement:{glide:-5,glideTime:.23}});
 assert.equal(pitchCents(note,m,0,1),-500);
 assert.ok(pitchCents(note,m,1,1)>280);
});
test("audio scheduler writes a real per-note pitch curve and delayed vibrato",()=>{
 const events=[];
 const param={setValueAtTime:(value,time)=>events.push(["set",value,time]),
  setValueCurveAtTime:(values,time,duration)=>events.push(["curve",values,time,duration])};
 const context={
  createOscillator:()=>({type:"sine",frequency:{setValueAtTime(){}},connect(){},start(){},stop(){},disconnect(){},onended:null}),
  createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}})
 };
 schedulePitch(context,param,{bend:{shape:"wail",amount:4,rate:4}},
  {glide:-2,glideTime:.2,depth:20,rate:5,delay:.3},1,2,5);
 const curve=events.find(x=>x[0]==="curve");
 assert.ok(curve);
 assert.equal(curve[2],1);
 assert.equal(curve[3],2);
 assert.ok(curve[1].some(x=>x>200));
 assert.ok(curve[1][0]<5);
});
