import test from "node:test";
import assert from "node:assert/strict";
import {FACTORY_SOUND_CATALOG,RETIRED_SAMPLE_LISTINGS,CURATED_EXAMPLE_RACKS} from "../soundCatalog.js";
import {PRESETS,makePatch} from "../synth.js";
import {SAMPLE_LIBRARY,SAMPLE_ASSETS,makeSamplerPatch,samplePreset} from "../samples.js";
import {EXAMPLE_SOUND_PRESETS} from "../examples.js";
import {DRUM_RACKS} from "../drumRacks.js";

const ids=presets=>new Set(presets.map(p=>p.id));
test("factory catalog is a single unique list of real sound foundations and complete racks",()=>{
 const catalog=FACTORY_SOUND_CATALOG;
 assert.equal(ids(catalog).size,catalog.length,"Duplicate factory catalog ID");
 assert.equal(catalog.length,79,"Unexpected extra factory starting points; audit them before publishing");
 assert.equal(catalog.filter(p=>p.sounds).length,5);
 assert.equal(catalog.filter(p=>p.id.startsWith("example-")&&!p.sounds).length,0,
  "A song-specific variation is not another factory sound");
 assert.deepEqual(CURATED_EXAMPLE_RACKS.map(p=>p.id).sort(),
  EXAMPLE_SOUND_PRESETS.filter(p=>p.sounds).map(p=>p.id).sort());
 for(const patch of PRESETS)assert.ok(ids(catalog).has(patch.id),"Missing distinct synthesis source "+patch.id);
 for(const rack of DRUM_RACKS)assert.ok(ids(catalog).has(rack.id),"Missing complete kit "+rack.id);
});

test("retiring a browser entry never retires its source sample assets or example project",()=>{
 assert.deepEqual(RETIRED_SAMPLE_LISTINGS,["nylon-sob"]);
 for(const id of RETIRED_SAMPLE_LISTINGS){
  assert.ok(samplePreset(id),id+" must remain import-compatible");
  assert.ok(!ids(FACTORY_SOUND_CATALOG).has(id),id+" still in public catalog");
 }
 for(const entry of EXAMPLE_SOUND_PRESETS) {
  if(entry.sounds)continue;
  assert.ok(!ids(FACTORY_SOUND_CATALOG).has(entry.id),"Song-specific duplicated sound visible");
  assert.ok(entry.patch,"Example source patch cannot be deleted");
 }
 // Two historical shortcut IDs intentionally reuse the corresponding C3
 // guitar recording; they do not justify duplicate catalogue instruments.
 const byHash=new Map();
 for(const asset of SAMPLE_ASSETS){
  if(!byHash.has(asset.sha))byHash.set(asset.sha,[]);
  byHash.get(asset.sha).push(asset.id);
 }
 const duplicateBytes=[...byHash.values()].filter(ids=>ids.length>1)
  .map(ids=>ids.sort()).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(duplicateBytes,[
  ["g-nf-48","nylon-c3"],["g-ss1-48","steel-c3"]
 ].sort((a,b)=>a[0].localeCompare(b[0])),"Unexpected duplicated audio asset bytes");
});

test("multiple public instruments using the same recorded assets have a real playing distinction",()=>{
 const groups=new Map();
 for(const preset of FACTORY_SOUND_CATALOG.filter(p=>p.assets)){
  const patch=makeSamplerPatch(preset);
  const key=patch.zones.map(z=>z.assetId).sort().join(",");
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(preset);
 }
 const collisions=[...groups.values()].filter(entries=>entries.length>1);
 assert.equal(collisions.length,1,"Unreviewed reused recording family");
 const steel=collisions[0];
 assert.deepEqual(steel.map(p=>p.id).sort(),
  ["steel-guitar","steel-strum","steel-lap-cry","steel-haunt"].sort());
 // Strum is a chord gesture; the two expressive sounds have audible scale
 // pitch dives/rises, not a mere filter or gain tweak of Steel Acoustic.
 const byId=Object.fromEntries(steel.map(p=>[p.id,p]));
 assert.ok(byId["steel-strum"].strumMs>=12);
 assert.ok(Math.abs(byId["steel-lap-cry"].movement.glide)>=3);
 assert.ok(Math.abs(byId["steel-haunt"].movement.glide)>=2);
 assert.ok(byId["steel-haunt"].movement.depth>=40);
 assert.ok(byId["steel-haunt"].movement.tremolo>=.15);
});

test("sampled factory sounds keep playable distinct recordings; synth recipes are not exact duplicate patches",()=>{
 const keyed=FACTORY_SOUND_CATALOG.filter(p=>p.assets);
 const sourceSet=new Set(keyed.flatMap(p=>p.assets));
 for(const assetId of sourceSet)
  assert.ok(SAMPLE_ASSETS.find(a=>a.id===assetId),"Missing audio source "+assetId);
 const soundPatches=FACTORY_SOUND_CATALOG.filter(p=>p.patch);
 const sig=new Set();
 for(const p of soundPatches){
  const {presetId,...patch}=makePatch(p.id);
  const fingerprint=JSON.stringify(patch);
  assert.ok(!sig.has(fingerprint),"Identical synth patch sold twice: "+p.id);
  sig.add(fingerprint);
 }
});


test("lo-fi factory entries each have their own uniquely pinned sample",()=>{
 const names=["felt-upright","worn-reed-keys","thumb-tines","tape-celesta","dusty-vibraphone","tape-kick","cardboard-snare","brush-snare","soft-hat","washed-open-hat","vinyl-rim","dusty-clap","loose-shaker","wood-tom"];
 const presetIds=new Set(names);
 assert.equal(presetIds.size,14);
 const assets=new Set(),hashes=new Set();
 for(const id of names){
  const preset=samplePreset(id);
  assert.ok(preset,"Missing lo-fi sound "+id);
  assert.ok(ids(FACTORY_SOUND_CATALOG).has(id),"Not publicly browsable: "+id);
  assert.equal(preset.assets.length,1,"Every lo-fi sound needs its own source");
  const assetId=preset.assets[0];
  assert.ok(!assets.has(assetId),"Lo-fi samples may not be shared across sounds: "+assetId);
  assets.add(assetId);
  const asset=SAMPLE_ASSETS.find(item=>item.id===assetId);
  assert.ok(asset,"Missing lo-fi audio asset "+assetId);
  assert.equal(asset.repo,"natanai/pre-midi");
  assert.equal(asset.mime,"audio/wav");
  assert.match(asset.path,/^factory-samples\/[a-z0-9-]+\.wav$/);
  assert.match(asset.sha,/^[0-9a-f]{40}$/);
  assert.ok(!hashes.has(asset.sha),"Duplicate lo-fi waveform: "+assetId);
  hashes.add(asset.sha);
  assert.equal(preset.followPitch,preset.category==="Keys");
 }
 // Existing library sources, including the shared guitar recordings, must not
 // silently become alternate versions of any newly commissioned waveform.
 for(const asset of SAMPLE_ASSETS.filter(asset=>!assets.has(asset.id)))
  assert.ok(!hashes.has(asset.sha),"New source reuses an existing waveform: "+asset.id);
});
