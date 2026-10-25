import test from "node:test";
import assert from "node:assert/strict";
import {EXAMPLES,buildExample} from "../examples.js";
import {sampleAsset} from "../samples.js";
import {makeSampleAsset,usedSampleIds} from "../sampler.js";
import {validate,parse} from "../schema.js";
import {stepEvents} from "../audio.js";
function stubSample(assetId){
 const recorded=sampleAsset(assetId);
 assert.ok(recorded,"Unknown source "+assetId);
 const bytes=new Uint8Array(48);
 if(recorded.mime==="audio/ogg"){
  bytes.set(new TextEncoder().encode("OggS"),0);
 }else{
  bytes.set(new TextEncoder().encode("RIFF"),0);
  bytes.set(new TextEncoder().encode("WAVE"),8);
 }
 return makeSampleAsset(assetId,assetId,recorded.mime,bytes,recorded.sourceUrl);
}
test("examples are diverse, opt-in and generate real valid portable scores",async()=>{
 assert.equal(EXAMPLES.length,5);
 assert.equal(new Set(EXAMPLES.map(x=>x.id)).size,EXAMPLES.length);
 const observed=new Set();
 for(const example of EXAMPLES){
  const doc=await buildExample(example.id,async id=>stubSample(id));
  assert.equal(doc.bpm,example.bpm);
  assert.equal(doc.bars,example.bars);
  assert.equal(doc.title,example.name);
  assert.equal(doc.instruments.length,example.voices.length);
  assert.ok(doc.instruments.length>=4);
  assert.deepEqual(validate(doc),[],example.name);
  const restored=parse(JSON.stringify(doc));
  assert.deepEqual(restored,doc);
  assert.ok(doc.instruments.every(inst=>inst.chunks.every(chunk=>chunk.notes.length>0)));
  const active=doc.instruments.some(inst=>inst.chunks.some(chunk=>chunk.notes.length>0)&&inst.timeline.some(Boolean));
  assert.ok(active,example.name);
  const noteCount=doc.instruments.reduce((sum,inst)=>sum+inst.chunks.reduce((n,c)=>n+c.notes.length,0),0);
  assert.ok(noteCount>=20,example.name);
  for(const inst of doc.instruments)observed.add(inst.patch.presetId);
  assert.ok(JSON.stringify(doc).length<15_000_000);
 }
 assert.ok(observed.size>=16,"Example library should showcase substantial instrument breadth");
});
test("sampled examples embed only the used recordings with no external playback dependency",async()=>{
 for(const name of ["porchlight","swaying-wire"]){
  const doc=await buildExample(name,async id=>stubSample(id));
  assert.ok(doc.samples.length>=3,name);
  const sampleIds=new Set(doc.samples.map(asset=>asset.id));
  const used=usedSampleIds(doc);
  assert.deepEqual(sampleIds,used,"Every embedded recording should be used in the score");
  assert.ok(doc.instruments.some(inst=>inst.patch.type==="sample"));
  assert.ok(doc.samples.every(asset=>asset.data.length>0&&asset.source.startsWith("https://")));
  assert.deepEqual(validate(doc),[]);
 }
});
test("long ambient example uses real arrangement lanes and multiple distinct sections",async()=>{
 const doc=await buildExample("floating-signals",async id=>stubSample(id));
 assert.equal(doc.bars,16);
 assert.ok(doc.instruments.some(inst=>inst.timeline.some(c=>c===null)));
 assert.ok(doc.instruments.some(inst=>new Set(inst.timeline.filter(Boolean)).size>=3));
 assert.ok(doc.instruments.some(inst=>inst.chunks.some(chunk=>chunk.notes.some(note=>note.bend))));
 assert.ok(stepEvents(doc,0).length>=1);
 assert.ok(stepEvents(doc,16*8).length>=1);
});
test("unknown examples reject without changing existing authored scores",async()=>{
 await assert.rejects(()=>buildExample("absent",async id=>stubSample(id)),/Unknown example/);
});
