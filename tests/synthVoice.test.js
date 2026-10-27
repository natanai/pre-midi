import test from "node:test";
import assert from "node:assert/strict";
import {makePatch,PRESETS} from "../synth.js";
import {planSynthVoice,SYNTH_PARAMETERS} from "../src/dsp/synth-voice.js";
import {renderEvents,renderEndSeconds} from "../audio.js";
import {create} from "../schema.js";
test("every stock synth compiles to a host-neutral stable immutable voice plan",()=>{
 for(const preset of PRESETS){
  const patch=makePatch(preset.id),before=structuredClone(patch);
  const plan=planSynthVoice({patch,volume:.7},{pitch:69,velocity:.8},1,.25);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan);
  assert.deepEqual(patch,before);
  assert.equal(plan.presetId,preset.id);
  assert.equal(plan.version,1);
  assert.equal(plan.oscillators[0].frequency,440*2**patch.oscillators[0].octave);
  patch.filter.cutoff=50;assert.equal(plan.patch.filter.cutoff,before.filter.cutoff);
  assert.ok(plan.routing.includes("drive"));assert.ok(plan.amplitude.events.length);
 }
});
test("portable parameter IDs are unique and match current patch defaults",()=>{
 const patch=makePatch(),ids=SYNTH_PARAMETERS.map(x=>x.id);
 assert.equal(ids.length,new Set(ids).size);
 for(const parameter of SYNTH_PARAMETERS){
  const value=parameter.id.split(".").reduce((obj,key)=>obj?.[key],patch);
  if(value!==undefined)assert.equal(value,parameter.default,parameter.id);
  assert.ok(parameter.interpolation);assert.ok(parameter.unit);
 }
});
test("render length includes long feedback tails in both Beat and Song pathways",async()=>{
 const beat=create(),inst=beat.instruments[0],patch=inst.sounds[0].patch;
 patch.effects={drive:0,delayMix:1,delayTime:1,delayFeedback:.8};
 inst.chunks[0].notes.push({id:"tail",pitch:69,start:0,duration:1,velocity:.8});
 const {createSong}=await import("../songModel.js"),song=createSong(beat);
 for(const doc of [beat,song]){
  const end=renderEndSeconds(doc,renderEvents(doc),new Map());
  assert.ok(end>40,"tail cannot be cut at 2.4 or 8 seconds");
 }
});

test("legacy optional expression fields and event bends remain independent snapshots",()=>{
 const patch=makePatch();delete patch.bend;delete patch.noiseDecay;
 const event={pitch:60,velocity:.7};
 const plan=planSynthVoice({patch,volume:1},event,0,.1);
 assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan);
 event.bend={shape:"rise",amount:2,rate:4};
 const expressive=planSynthVoice({patch,volume:1},event,0,.1);
 event.bend.amount=9;assert.equal(expressive.expression.bend.amount,2);
});
