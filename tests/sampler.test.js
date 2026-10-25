import test from "node:test";
import assert from "node:assert/strict";
import {create,validate,parse,clone} from "../schema.js";
import {validatePatch} from "../synth.js";
import {SAMPLE_LIBRARY,SAMPLE_ASSETS,makeSamplerPatch} from "../samples.js";
import {validateSampleAsset,makeSampleAsset,sampleForNote,MAX_SCORE_BYTES} from "../sampler.js";
import {getAsset} from "../assetRegistry.js";
test("CC0 sample presets span recorded instruments and multiple percussion voices",()=>{
 assert.ok(SAMPLE_LIBRARY.length>=10);
 assert.ok(new Set(SAMPLE_LIBRARY.map(s=>s.category)).has("Recorded"));
 assert.ok(new Set(SAMPLE_LIBRARY.map(s=>s.category)).has("Drums"));
 assert.equal(new Set(SAMPLE_ASSETS.map(a=>a.id)).size,SAMPLE_ASSETS.length);
 for(const entry of SAMPLE_LIBRARY){
  assert.deepEqual(validatePatch(makeSamplerPatch(entry)),[],entry.name);
  for(const key of entry.assets)assert.ok(SAMPLE_ASSETS.some(asset=>asset.id===key));
 }
});
test("different piano pitches select nearest recorded key zone",()=>{
 const patch=makeSamplerPatch(SAMPLE_LIBRARY.find(entry=>entry.id==="real-piano"));
 assert.equal(sampleForNote(patch,49).assetId,"piano-c3");
 assert.equal(sampleForNote(patch,63).assetId,"piano-c4");
});
test("sample imports keep readable score references separate from native audio bytes",()=>{
 const score=create();
 const raw=new Uint8Array(44);
 raw.set(new TextEncoder().encode("RIFF"),0);
 raw.set(new TextEncoder().encode("WAVE"),8);
 const sample=makeSampleAsset("custom1","My sound","audio/wav",raw,"user");
 score.samples.push(sample);
 score.instruments[0].patch={
  type:"sample",presetId:"custom",zones:[{assetId:"custom1",root:60}],
  followPitch:true,transpose:0,gain:1,attack:.01,release:.1,pan:0
 };
 assert.deepEqual(validate(score),[]);
 assert.deepEqual(parse(JSON.stringify(score)),score);
 assert.equal(sample.path,"assets/custom1.wav");
 assert.equal(sample.data,undefined);
 assert.deepEqual(getAsset(sample.id),raw);
 const broken=clone(score);broken.samples=[];
 assert.ok(validate(broken).some(error=>error.includes("missing audio")));
});
test("invalid untrusted sample data and external-link-only assets cannot become playable",()=>{
 assert.ok(validateSampleAsset({id:"x",name:"X",mime:"audio/wav",data:"https://evil.invalid",source:"user"}));
 assert.ok(validateSampleAsset({id:"x",name:"X",mime:"text/html",data:"AAAA",source:"user"}));
 assert.equal(MAX_SCORE_BYTES,1_000_000);
});
