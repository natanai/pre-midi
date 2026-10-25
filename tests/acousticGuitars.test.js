import test from "node:test";
import assert from "node:assert/strict";
import { GUITAR_RECORDINGS, GUITAR_PRESETS } from "../acousticGuitars.js";
import { SAMPLE_ASSETS, makeSamplerPatch } from "../samples.js";
import { sampleForNote, usedSampleIds, validateSamplerPatch } from "../sampler.js";
import { strumOffset } from "../guitarTiming.js";
import { create, validate } from "../schema.js";

const preset = id => GUITAR_PRESETS.find(item => item.id === id);
test("acoustic library has true fretboard coverage, real velocity takes and pinned provenance",()=>{
 assert.equal(GUITAR_RECORDINGS.length,108);
 assert.equal(new Set(GUITAR_RECORDINGS.map(row=>row.id)).size,108);
 assert.equal(new Set(GUITAR_RECORDINGS.map(row=>row.sha)).size,108);
 for(const row of GUITAR_RECORDINGS) {
  assert.ok(row.sha.length===40);
  assert.ok(SAMPLE_ASSETS.some(item=>item.id===row.id && item.sha===row.sha));
 }
 for(const sound of GUITAR_PRESETS) {
  assert.ok(sound.assets.length>=18,sound.name);
  assert.deepEqual(validateSamplerPatch(makeSamplerPatch(sound)),[],sound.name);
 }
});
test("acoustic pitches select an actual nearby string recording, never a whole-octave shift",()=>{
 for(const sound of [preset("nylon-finger"),preset("nylon-guitar"),preset("steel-guitar")]) {
  const patch=makeSamplerPatch(sound);
  for(let pitch=40;pitch<=83;pitch++) {
   const selected=sampleForNote(patch,pitch,.55);
   assert.ok(selected, "missing note "+pitch);
   assert.ok(Math.abs(selected.root-pitch)<=2,sound.name+" pitch "+pitch+" => "+selected.root);
   assert.ok(["LowE","A","D","G","B","HighE"].includes(selected.string));
  }
 }
});
test("soft medium and hard plucks use distinct recorded steel takes",()=>{
 const patch=makeSamplerPatch(preset("steel-guitar"));
 const notes=[.25,.55,.9].map(velocity=>sampleForNote(patch,60,velocity));
 assert.deepEqual(notes.map(zone=>zone.root),[60,60,60]);
 assert.equal(new Set(notes.map(zone=>zone.assetId)).size,3);
 assert.equal(notes[0].string,"B");
 assert.equal(patch.preserveDynamics,true);
});
test("picked nylon has bright and light takes separate from fingerstyle",()=>{
 const picked=makeSamplerPatch(preset("nylon-guitar"));
 const finger=makeSamplerPatch(preset("nylon-finger"));
 assert.notEqual(sampleForNote(picked,60,.55).assetId,sampleForNote(picked,60,.9).assetId);
 assert.notEqual(sampleForNote(finger,60,.25).assetId,sampleForNote(picked,60,.55).assetId);
});
test("strum brushes chord from low to high or reverse without modifying note events",()=>{
 const inst={patch:{type:"sample",strumMs:12}};
 const notes=[{id:"mid",pitch:64,start:0},{id:"top",pitch:67,start:0},{id:"low",pitch:60,start:0},{id:"later",pitch:55,start:4}];
 assert.equal(strumOffset(inst,notes[2],notes),0);
 assert.equal(strumOffset(inst,notes[0],notes),.012);
 assert.equal(strumOffset(inst,notes[1],notes),.024);
 assert.equal(strumOffset(inst,notes[3],notes),0);
 inst.patch.strumMs=-12;
 assert.equal(strumOffset(inst,notes[1],notes),0);
 assert.equal(strumOffset(inst,notes[2],notes),.024);
});
test("unused velocity takes remain portable but are not decoded into RAM",()=>{
 const doc=create(),inst=doc.instruments[0],chunk=inst.chunks[0];
 inst.patch=makeSamplerPatch(preset("steel-guitar"));
 chunk.notes=[{id:"note",pitch:60,start:0,duration:4,velocity:.9}];
 const played=sampleForNote(inst.patch,60,.9);
 assert.deepEqual([...usedSampleIds(doc)],[played.assetId]);
 assert.equal(inst.patch.zones.length,54);
 assert.deepEqual(validate(doc).filter(error=>!error.includes("missing audio")).length,0);
});

test("Steel Strum is a distinct articulation, not simply a relabeled Steel Acoustic",()=>{
 const steel=makeSamplerPatch(preset("steel-guitar"));
 const strum=makeSamplerPatch(preset("steel-strum"));
 assert.ok(strum.strumMs>=20);
 assert.equal(steel.strumMs,0);
 assert.ok(strum.release<steel.release);
 assert.ok(strum.gain>steel.gain);
 const chord=[{id:"low",pitch:52,start:0},{id:"middle",pitch:60,start:0},{id:"high",pitch:69,start:0}];
 assert.deepEqual(chord.map(n=>strumOffset({patch:strum},n,chord)),[0,.024,.048]);
 assert.deepEqual(chord.map(n=>strumOffset({patch:steel},n,chord)),[0,0,0]);
});
