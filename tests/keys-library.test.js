import test from "node:test";
import assert from "node:assert/strict";
import {PRESETS,getPreset,makePatch,validatePatch} from "../synth.js";
import {SAMPLE_LIBRARY,SAMPLE_ASSETS,samplePreset,makeSamplerPatch} from "../samples.js";
import {sampleForNote} from "../sampler.js";
import {planSynthVoice} from "../src/dsp/synth-voice.js";
import {planNativeSample} from "../src/hosts/native/sample-plan.js";

const distinctiveSynthKeys=[
 "reed-electric","shimmer-tines","vintage-poly-keys","warm-drawbars"
];
const redundantSynthVariants=[
 "soft-hammer","muted-electric","chorus-electric",
 "tape-soft-keys","night-drive-keys","digital-chime"
];
const redundantRecordedPianos=["close-piano","felt-room-piano","tape-piano"];

test("keys are distinct starting points, not multiple tunings of the same piano recording",()=>{
 const all=[...PRESETS,...SAMPLE_LIBRARY];
 assert.equal(new Set(all.map(p=>p.id)).size,all.length);
 const piano=samplePreset("real-piano");
 assert.ok(piano);
 assert.equal(piano.category,"Keys");
 assert.deepEqual(piano.assets,["piano-c3","piano-c4"]);
 assert.equal(piano.trigger,"pitched");
 for(const id of redundantRecordedPianos)assert.equal(samplePreset(id),undefined,id);
 for(const id of redundantSynthVariants)assert.equal(getPreset(id),undefined,id);
 // A second piano with the same recording zones is just an editable variation.
 const keyedSamples=SAMPLE_LIBRARY.filter(p=>p.category==="Keys");
 const sourceSignatures=keyedSamples.map(p=>[...p.assets].sort().join("|"));
 assert.equal(new Set(sourceSignatures).size,keyedSamples.length);
});

test("remaining added key timbres have different oscillator recipes",()=>{
 const signatures=new Set();
 for(const preset of PRESETS.filter(p=>p.category==="Keys")){
  const signature=JSON.stringify(preset.patch.oscillators.map(osc=>({
   wave:osc.wave,octave:osc.octave,
   harmonics:osc.harmonics?.map(n=>Math.round(n*100)),
   // A silent layer does not establish another distinctive sound source.
   active:osc.level>.05
  })));
  assert.ok(!signatures.has(signature),preset.name+" duplicates an oscillator recipe");
  signatures.add(signature);
 }
 for(const id of distinctiveSynthKeys)assert.ok(getPreset(id),id);
});

test("curated synth keys validate and generate native voice plans across the register",()=>{
 for(const id of distinctiveSynthKeys){
  const patch=makePatch(id);
  assert.deepEqual(validatePatch(patch),[],id);
  for(const pitch of [48,60,84]){
   const voice=planSynthVoice({patch,volume:.78},{pitch,velocity:.76},0,.75);
   assert.equal(voice.contract,"pre-midi-synth-voice");
   assert.equal(voice.oscillators.length,2);
   assert.ok(voice.graphEnd>voice.off,id);
  }
 }
});

test("curated presets remain editable independently",()=>{
 const first=makePatch("shimmer-tines"),second=makePatch("shimmer-tines");
 first.oscillators[0].harmonics[0]=0;
 first.filter.cutoff=100;
 assert.notEqual(first.oscillators[0].harmonics[0],second.oscillators[0].harmonics[0]);
 assert.notEqual(first.filter.cutoff,second.filter.cutoff);
});

test("single piano preset retains both recordings and native tone editing",()=>{
 const preset=samplePreset("real-piano"),patch=makeSamplerPatch(preset);
 assert.deepEqual(validatePatch(patch),[]);
 for(const zone of patch.zones)assert.ok(SAMPLE_ASSETS.some(a=>a.id===zone.assetId));
 assert.equal(sampleForNote(patch,60)?.assetId,"piano-c4");
 patch.filter={type:"lowpass",cutoff:2400,resonance:.7};
 patch.drive=.08;patch.attack=.02;patch.release=1.1;
 assert.deepEqual(validatePatch(patch),[]);
 const plan=planNativeSample({patch,volume:.8},{pitch:60,velocity:.8},0,.6,
  new Map([["piano-c4",{id:1,duration:3,normalization:1}]]));
 assert.equal(plan.contract,"pre-midi-sample-voice");
 assert.equal(plan.filter.cutoff,2400);
 assert.equal(plan.drive,.08);
});

test("old self-contained piano patches stay valid after library cleanup",()=>{
 for(const id of redundantRecordedPianos){
  // A saved .premidi stores the sound instructions, not a lookup-only preset.
  const patch=makeSamplerPatch({
   ...samplePreset("real-piano"),id,
   attack:.024,release:1.15,
   filter:{type:"lowpass",cutoff:3100,resonance:.65},
   drive:.075
  });
  assert.equal(patch.presetId,id);
  assert.deepEqual(validatePatch(patch),[],id);
  assert.equal(sampleForNote(patch,60)?.assetId,"piano-c4");
 }
});
