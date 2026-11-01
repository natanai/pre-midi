import test from "node:test";
import assert from "node:assert/strict";
import {PRESETS,getPreset,makePatch,validatePatch} from "../synth.js";
import {SAMPLE_LIBRARY,SAMPLE_ASSETS,samplePreset,makeSamplerPatch} from "../samples.js";
import {sampleForNote} from "../sampler.js";
import {planSynthVoice} from "../src/dsp/synth-voice.js";
import {planNativeSample} from "../src/hosts/native/sample-plan.js";

const newSynthKeys=[
 "soft-hammer","reed-electric","muted-electric","chorus-electric",
 "shimmer-tines","tape-soft-keys","vintage-poly-keys","night-drive-keys",
 "digital-chime","warm-drawbars"
];
const newSampleKeys=["close-piano","felt-room-piano","tape-piano"];

test("factory key IDs remain unique and appear in the Keys library",()=>{
 const all=[...PRESETS,...SAMPLE_LIBRARY],ids=all.map(p=>p.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of [...newSynthKeys,...newSampleKeys]){
  const entry=all.find(item=>item.id===id);
  assert.ok(entry,id);
  assert.equal(entry.category,"Keys");
  assert.equal(entry.trigger,"pitched");
 }
});

test("all new key synths validate and generate native voice plans at contrasting pitches",()=>{
 for(const id of newSynthKeys){
  assert.ok(getPreset(id),id);
  const patch=makePatch(id);
  assert.deepEqual(validatePatch(patch),[],id);
  assert.equal(patch.type,"synth");
  for(const pitch of [48,60,84]){
   const voice=planSynthVoice({patch,volume:.78},{pitch,velocity:.76},0,.75);
   assert.equal(voice.contract,"pre-midi-synth-voice");
   assert.equal(voice.oscillators.length,2);
   assert.ok(voice.graphEnd>voice.off,id);
  }
 }
});

test("synth key patches are copied independently when selected",()=>{
 const first=makePatch("soft-hammer"),second=makePatch("soft-hammer");
 first.oscillators[0].harmonics[0]=0;
 first.filter.cutoff=100;
 assert.notEqual(first.oscillators[0].harmonics[0],second.oscillators[0].harmonics[0]);
 assert.notEqual(first.filter.cutoff,second.filter.cutoff);
});

test("recorded piano variants reuse pinned assets and preserve tone settings",()=>{
 const original=samplePreset("real-piano");
 for(const id of newSampleKeys){
  const preset=samplePreset(id),patch=makeSamplerPatch(preset);
  assert.deepEqual(preset.assets,original.assets,id);
  assert.deepEqual(validatePatch(patch),[],id);
  assert.equal(patch.filter.type,"lowpass");
  assert.equal(patch.filter.cutoff,preset.filter.cutoff);
  assert.equal(patch.drive,preset.drive);
  for(const zone of patch.zones)assert.ok(SAMPLE_ASSETS.some(a=>a.id===zone.assetId));
  assert.equal(sampleForNote(patch,60)?.assetId,"piano-c4");
  const plan=planNativeSample({patch,volume:.8},{pitch:60,velocity:.8},0,.6,
   new Map([[ "piano-c4",{id:1,duration:3,normalization:1} ]]));
  assert.equal(plan.contract,"pre-midi-sample-voice");
  assert.equal(plan.filter.cutoff,preset.filter.cutoff);
  assert.equal(plan.drive,preset.drive??0);
 }
});
