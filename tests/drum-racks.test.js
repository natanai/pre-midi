import test from "node:test";
import assert from "node:assert/strict";
import {DRUM_RACKS} from "../drumRacks.js";
import {SAMPLE_ASSETS,SAMPLE_LIBRARY,sampleAsset} from "../samples.js";
import {create,makeInstrument,validate} from "../schema.js";
import {validatePatch} from "../synth.js";
import {planNativeSample} from "../src/hosts/native/sample-plan.js";

test("three factory racks are distinct editable drum instruments",()=>{
 assert.equal(DRUM_RACKS.length,3);
 assert.equal(new Set(DRUM_RACKS.map(r=>r.id)).size,3);
 for(const rack of DRUM_RACKS){
  assert.equal(rack.category,"Drums");
  assert.equal(rack.layout,"rack");
  assert.ok(rack.sounds.length>=8 && rack.sounds.length<=64);
  assert.equal(new Set(rack.sounds.map(s=>s.id)).size,rack.sounds.length);
  assert.ok(rack.sounds.every(s=>s.trigger==="hit"));
  assert.ok(rack.sounds.every(s=>s.gain>=0 && s.gain<=1));
  const beat=create(),instrument=makeInstrument(1,beat.bars,rack.sounds[0]);
  instrument.name=rack.name;instrument.layout="rack";
  instrument.sounds=structuredClone(rack.sounds);
  instrument.volume=rack.volume;
  beat.instruments=[instrument];
  const used=new Set(instrument.sounds.flatMap(s=>s.patch.type==="sample"?s.patch.zones.map(z=>z.assetId):[]));
  beat.samples=[...used].map(id=>{
   const asset=sampleAsset(id);
   assert.ok(asset,rack.name+" needs known CC0 asset "+id);
   return {id,name:id,mime:asset.mime,
    path:"assets/"+id+"."+ (asset.mime==="audio/ogg"?"ogg":"wav"),
    source:asset.sourceUrl};
  });
  assert.deepEqual(validate(beat),[],rack.name);
  for(const sound of rack.sounds)assert.deepEqual(validatePatch(sound.patch),[],sound.name);
 }
});

test("every recorded drum/percussion one-shot is available in at least one factory rack",()=>{
 const assigned=new Set(DRUM_RACKS.flatMap(r=>r.sounds)
  .flatMap(s=>s.patch.type==="sample"?s.patch.zones.map(z=>z.assetId):[]));
 for(const preset of SAMPLE_LIBRARY.filter(p=>p.category==="Drums")){
  assert.equal(preset.trigger,"hit",preset.id);
  for(const asset of preset.assets)assert.ok(assigned.has(asset),
   "recorded drum asset "+asset+" is missing from preset racks");
 }
});

test("new factory drum recordings have pinned CC0 provenance and bounded size",()=>{
 const ids=[
  "wood-snare","live-hat","dry-rim","room-crash",
  "floor-tom","mid-tom","high-tom","machine-kick",
  "machine-snare","machine-hat","machine-open-hat",
  "hand-shaker","soft-clap"
 ];
 for(const id of ids){
  const a=sampleAsset(id);
  assert.ok(a,id);assert.match(a.sha,/^[a-f0-9]{40}$/);
  assert.equal(a.license,"CC0-1.0");
  assert.match(a.path,/\.wav$/);
  assert.match(a.sourceUrl,/stargatedaw\/stargate-sample-pack/);
 }
 assert.equal(new Set(SAMPLE_ASSETS.map(a=>a.id)).size,SAMPLE_ASSETS.length);
});

test("recorded rack rows plan natively with their own sample and one-shot behavior",()=>{
 for(const rack of DRUM_RACKS){
  for(const sound of rack.sounds.filter(s=>s.patch.type==="sample")){
   const patch=sound.patch,zone=patch.zones[0];
   assert.equal(patch.oneShot,true,sound.name);
   assert.equal(patch.followPitch,false,sound.name);
   const plan=planNativeSample({patch,volume:rack.volume},
    {pitch:sound.referencePitch,velocity:.8},0,.15,
    new Map([[zone.assetId,{id:1,duration:.65,normalization:1}]]));
   assert.equal(plan.contract,"pre-midi-sample-voice");
   assert.equal(plan.asset,1);
   assert.equal(plan.off,.65-patch.release);
  }
 }
});
