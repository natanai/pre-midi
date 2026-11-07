import test from "node:test";
import assert from "node:assert/strict";
import {create,validate,parse,clone} from "../schema.js";
import {validatePatch} from "../synth.js";
import {SAMPLE_LIBRARY,SAMPLE_ASSETS,makeSamplerPatch} from "../samples.js";
import {validateSampleAsset,makeSampleAsset,sampleForNote,usedSampleIds,MAX_BEAT_BYTES} from "../sampler.js";
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
 score.instruments[0].sounds[0].patch={
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
 assert.equal(MAX_BEAT_BYTES,1_000_000);
});

test("optional sample tone controls remain compatible and reject malformed values",()=>{
 const patch=makeSamplerPatch(SAMPLE_LIBRARY[0]);
 assert.deepEqual(validatePatch(patch),[],"Legacy sampler presets remain valid");
 patch.filter={type:"lowpass",cutoff:350,resonance:1};
 patch.drive=.7;
 assert.deepEqual(validatePatch(patch),[],"Authored tone settings are portable");
 patch.filter.cutoff=-1;
 assert.ok(validatePatch(patch).some(s=>/filter/.test(s)));
 patch.filter.cutoff=350;patch.drive=2;
 assert.ok(validatePatch(patch).some(s=>/distortion/.test(s)));
 delete patch.filter;delete patch.drive;
 assert.deepEqual(validatePatch(patch),[],"Optional tone settings can be omitted");
});

test("sample preparation uses direct freeform notes and only placed freeform Chunks",()=>{
 const beat=create(),inst=beat.instruments[0];
 inst.sounds[0].patch={
  type:"sample",zones:[{assetId:"low",root:48},{assetId:"high",root:72}],
  followPitch:true,transpose:0,gain:1,attack:.01,release:.1,pan:0
 };
 inst.timeline=[inst.chunks[0].id,...Array(beat.bars-1).fill(null)];
 inst.chunks[0].notes=[{id:"low-beat",pitch:48,start:0,duration:1,velocity:.8}];
 assert.deepEqual([...usedSampleIds(beat)],["low"],"legacy Beat references stay unchanged");
 const freeformInst={...inst,timeline:undefined,chunkPlacements:[],notes:[
  {id:"direct",pitch:72,start:128,duration:32,velocity:.8}
 ]};
 assert.deepEqual([...usedSampleIds({instruments:[freeformInst]})],["high"],
  "direct notes prime their own samples without a Beat timeline");
 freeformInst.chunkPlacements=[{id:"phrase",chunkId:inst.chunks[0].id,startStep:48,length:16,every:16,repeats:1}];
 assert.deepEqual(new Set(usedSampleIds({instruments:[freeformInst]})),new Set(["high","low"]),
  "freeform Chunks and direct notes both prime audible assets");
});

test("recorded sound filter bypass survives validation, current serialization and native planning",async()=>{
 const {planNativeSample}=await import('../src/hosts/native/sample-plan.js');
 const patch=makeSamplerPatch(SAMPLE_LIBRARY.find(entry=>entry.id==='real-piano'));
 patch.filter=null;
 assert.deepEqual(validatePatch(patch),[]);
 const restored=JSON.parse(JSON.stringify(patch));
 const zone=sampleForNote(restored,60,1);
 const plan=planNativeSample({patch:restored,volume:1},{pitch:60,velocity:1},0,.5,
  new Map([[zone.assetId,{id:1,duration:2,normalization:1}]]));
 assert.equal(plan.filter,null);
 patch.filter={type:'lowpass',cutoff:NaN,resonance:.7};
 assert.ok(validatePatch(patch).length,'invalid enabled filters still fail');
});
