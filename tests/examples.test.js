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
  for(const inst of doc.instruments)observed.add(inst.sounds[0].patch.presetId);
  assert.ok(JSON.stringify(doc).length<15_000_000);
 }
 assert.ok(observed.size>=16,"Example library should showcase substantial instrument breadth");
});
test("sampled examples reference only used recordings using portable relative asset paths",async()=>{
 for(const name of ["porchlight","swaying-wire"]){
  const doc=await buildExample(name,async id=>stubSample(id));
  assert.ok(doc.samples.length>=3,name);
  const sampleIds=new Set(doc.samples.map(asset=>asset.id));
  const used=usedSampleIds(doc);
  assert.deepEqual(sampleIds,used,"Every embedded recording should be used in the score");
  assert.ok(doc.instruments.some(inst=>inst.sounds[0].patch.type==="sample"));
  assert.ok(doc.samples.every(asset=>asset.path.startsWith("assets/")&&!Object.hasOwn(asset,"data")&&asset.source.startsWith("https://")));
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

test("Neon After Hours demonstrates an actual drum stack and sustained cinematic bass",async()=>{
 const doc=await buildExample("neon-after-hours",async id=>stubSample(id));
 assert.equal(doc.bars,16,"The revision should contain an evolving 16-bar structure");
 assert.equal(doc.bpm,108);
 assert.ok(doc.instruments.length>=7);
 const racks=doc.instruments.filter(inst=>inst.layout==="rack");
 assert.equal(racks.length,1,"Drums should share one editable rack lane");
 const drums=racks[0];
 assert.ok(drums.sounds.length>=8,"The kit must visibly layer multiple independent drum sounds");
 assert.ok(drums.sounds.filter(sound=>sound.patch.type==="sample").length>=4);
 assert.ok(drums.sounds.filter(sound=>sound.patch.type==="synth").length>=3);
 assert.ok(drums.sounds.some(sound=>sound.referencePitch===84),"Metallic transient is separately tuned");
 const punch=drums.sounds.find(sound=>sound.patch.presetId==="pulse-kick");
 const recorded=drums.sounds.find(sound=>sound.patch.presetId==="acoustic-kick");
 assert.ok(punch&&recorded&&punch.id!==recorded.id);
 const hitsInBar=bar=>{
  const chunk=drums.chunks.find(chunk=>chunk.id===drums.timeline[bar]);
  return chunk?.notes.length||0;
 };
 assert.ok(hitsInBar(5)>hitsInBar(0)*4,
  "A layered drop must contain far more strikes than the atmospheric introduction");
 assert.ok(hitsInBar(8)<hitsInBar(5)/4,
  "The breakdown must genuinely subtract percussion, not just change the label");
 assert.ok(hitsInBar(14)>hitsInBar(8)*4,
  "The final chase must restore energy after the breakdown");
 assert.ok(new Set(drums.timeline).size>=8,"The drum rack needs several real arrangements");
 const sub=doc.instruments.find(inst=>inst.name.includes("sustained sub"));
 assert.ok(sub&&sub.layout==="pitched","Deep bass must remain an editable piano-roll instrument");
 assert.ok(sub.chunks.every(chunk=>chunk.notes.some(note=>note.duration>=12)));
 assert.ok(sub.chunks.some(chunk=>chunk.notes.some(note=>note.pitch<=40&&note.duration===16)));
 const activeSubBars=sub.timeline.map(chunkId=>sub.chunks.find(chunk=>chunk.id===chunkId))
  .filter(Boolean);
 assert.equal(activeSubBars.length,doc.bars,"The low-frequency bed must cover every bar");
 const mid=doc.instruments.find(inst=>inst.name.includes("audible bass teeth"));
 assert.ok(mid?.timeline.includes(null),"Upper harmonics should contrast with a continuous sub");
 assert.ok(doc.instruments.some(inst=>inst.chunks.some(chunk=>
  chunk.notes.some(note=>note.bend?.shape==="wail"))),"The score needs expressive pitch movement");
 const ids=usedSampleIds(doc);
 assert.ok(ids.size>=4,"Recordings should provide real, editable transient layers");
 assert.deepEqual(new Set(doc.samples.map(asset=>asset.id)),ids);
 assert.deepEqual(validate(doc),[]);
 assert.deepEqual(parse(JSON.stringify(doc)),doc);
 assert.ok(new TextEncoder().encode(JSON.stringify(doc)).length<1_000_000,
  "The companion-audio score must still fit the native 1 MB .premidi limit");
 // Every rack hit must point to its actual sound row; none is a fake piano key.
 for(const chunk of drums.chunks){
  for(const hit of chunk.notes){
   assert.ok(drums.sounds.some(sound=>sound.id===hit.soundId));
   assert.equal(hit.pitch,undefined);
  }
 }
 assert.ok(stepEvents(doc,16*5).some(e=>e.instrument.id===drums.id));
});

test("Floating Signals distinguishes shared bar boundaries from actual within-bar note offsets",async()=>{
 const doc=await buildExample("floating-signals",async id=>stubSample(id));
 assert.equal(doc.bars,16);
 const bar=6,base=bar*16; // Bar 7 in the studio
 const expected=[
  ["violet-pad","Wide",[0,0,0,0]],
  ["tape-strings","Bloom",[0,0]],
  ["midnight-theremin","Hover",[1]],
  ["glass-keys","Mirror",[0,8,13]]
 ];
 for(const [preset,name,starts] of expected){
  const inst=doc.instruments.find(x=>x.sounds[0].patch.presetId===preset);
  assert.ok(inst,"Instrument missing: "+preset);
  const active=inst.chunks.find(chunk=>chunk.id===inst.timeline[bar]);
  assert.equal(active?.name,name,"Bar 7 chunk must use the shared bar slot");
  assert.deepEqual(active.notes.map(note=>note.start),starts,
   "Inside that bar, musical notes may have distinct step offsets");
 }
 const atBar=stepEvents(doc,base);
 assert.equal(atBar.length,7,"All notes at step zero share the same transport beat");
 assert.ok(atBar.every(x=>x.barIndex===bar&&x.step===0));
 assert.equal(atBar.some(x=>x.instrument.sounds[0].patch.presetId==="midnight-theremin"),false,
  "Theremin Hover doesn't begin at the displayed chunk edge");
 const atStepOne=stepEvents(doc,base+1);
 assert.equal(atStepOne.length,1);
 assert.equal(atStepOne[0].instrument.sounds[0].patch.presetId,"midnight-theremin");
 assert.equal(atStepOne[0].note.start,1);
});
