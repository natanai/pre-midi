import test from "node:test";
import assert from "node:assert/strict";
import {EXAMPLES,buildExample} from "../examples.js";
import {sampleAsset} from "../samples.js";
import {makeSampleAsset,usedSampleIds,sampleForNote} from "../sampler.js";
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
test("guitar example develops four sections and retains native sample layering and phrase shifts",async()=>{
 const doc=await buildExample("porchlight",async id=>stubSample(id));
 assert.equal(doc.version,7);
 assert.equal(doc.bpm,112);
 assert.equal(doc.bars,16);
 assert.equal(doc.instruments.length,6);
 const guitar=doc.instruments.find(i=>i.sounds[0].patch.presetId==="steel-guitar");
 assert.ok(guitar&&guitar.layout==="pitched");
 assert.equal(guitar.sounds[0].patch.preserveDynamics,true);
 assert.deepEqual(guitar.timeline.map(Boolean),[
  false,false,true,true,true,false,false,false,
  true,false,false,false,true,false,true,true
 ]);
 for(const bar of [4,8])assert.deepEqual(guitar.placements[bar],{
  offset:0,length:12,every:12,repeats:5
 });
 for(const bar of [0,1,2,3])assert.equal(guitar.placements[bar],null);
 const barNotes=bar=>Array.from({length:16},(_,step)=>stepEvents(doc,bar*16+step))
  .flat().filter(e=>e.instrument.id===guitar.id).map(e=>e.note.pitch);
 assert.deepEqual(barNotes(0),[],"The opening motif belongs to the keys");
 assert.deepEqual(barNotes(1),[],"Repeat the motif before introducing guitar");
 assert.deepEqual(barNotes(2),[64,67,71],"C-major-seventh guitar answer");
 assert.deepEqual(barNotes(3),[66,69,74],"D-major guitar answer");
 assert.deepEqual(guitar.placements[12],{offset:0,length:12,every:12,repeats:3});
 const noteEvents=Array.from({length:256},(_,step)=>stepEvents(doc,step)
  .filter(e=>e.instrument.id===guitar.id));
 assert.ok(noteEvents.every(events=>events.length<=1),"No artificial six-string chord stacks");
 for(const onset of [32,48,64,76,88,100,112,128,140,152,164,176,192,204,216,224,240])
  assert.ok(noteEvents[onset].length,"Intro, phrase or ending missing at "+onset);
 assert.equal(noteEvents[0].length,0,"Initial guitar entry is delayed");
 assert.ok(new Set(guitar.chunks.flatMap(c=>c.notes.map(n=>n.pitch))).size>=6,
  "Lead should have recognizable melodic variation rather than one four-note loop");
 assert.ok(new Set(guitar.chunks.map(c=>JSON.stringify(c.notes.map(n=>[n.pitch,n.start])))).size>=5);
 const zoneLow=sampleForNote(guitar.sounds[0].patch,64,.25);
 const zoneHigh=sampleForNote(guitar.sounds[0].patch,64,.9);
 assert.ok(zoneLow&&zoneHigh&&zoneLow.assetId!==zoneHigh.assetId);
 assert.ok(doc.samples.length<32);
 const drums=doc.instruments.find(i=>i.layout==="rack");
 assert.ok(drums&&drums.sounds.length===8);
 const hitsAt=bar=>drums.chunks.find(c=>c.id===drums.timeline[bar])?.notes.length??0;
 assert.ok(hitsAt(4)>hitsAt(0)*3,"Full groove should add independent drum layers");
 assert.ok(hitsAt(12)<hitsAt(11)/5,"Break must remove most percussion");
 assert.ok(hitsAt(14)>hitsAt(12)*4,"Final return must restore percussion");
 const pad=doc.instruments.find(i=>i.sounds[0].patch.presetId==="tape-strings");
 assert.ok(new Set(pad.timeline).size>=5,"Use a real changing chord progression");
 const melodic=doc.instruments.find(i=>i.sounds[0].patch.presetId==="felt-electric");
 assert.ok(melodic.timeline.some(x=>x===null)&&melodic.timeline.some(Boolean));
 const keysAt=bar=>Array.from({length:16},(_,step)=>stepEvents(doc,bar*16+step))
  .flat().filter(e=>e.instrument.id===melodic.id).map(e=>e.note.pitch);
 assert.deepEqual(keysAt(0),[76,71,67,71]);
 assert.deepEqual(keysAt(1),[67,71,76,74]);
 assert.deepEqual(keysAt(2),[],"Guitar replies without key overlap");
 assert.deepEqual(keysAt(3),[],"Second guitar reply has room");
 assert.equal(pad.timeline[0],null,"Do not layer a saw pad underneath the initial motif");
 const atBar=bar=>Array.from({length:16},(_,step)=>stepEvents(doc,bar*16+step)).flat();
 const rack=doc.instruments.find(i=>i.layout==="rack");
 assert.equal(atBar(0).filter(e=>e.instrument.id===rack.id).length,2,
  "Opening uses only kick and one low-level closed hat");
 assert.equal(atBar(1).filter(e=>e.instrument.id===rack.id).length,4);
 assert.equal(atBar(2).filter(e=>e.instrument.id===rack.id).length,8);
 assert.ok(atBar(4).filter(e=>e.instrument.id===rack.id).length>=14);
 assert.ok(doc.instruments.some(i=>i.chunks.some(c=>c.notes.some(n=>n.bend))));
 assert.deepEqual(new Set(doc.samples.map(a=>a.id)),usedSampleIds(doc));
 assert.deepEqual(validate(doc),[]);
 assert.deepEqual(parse(JSON.stringify(doc)),doc);
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

test("drum rack example has layered percussion and sustained bass",async()=>{
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
 const sub=doc.instruments.find(inst=>inst.sounds[0].patch.presetId==="sub-current");
 assert.ok(sub&&sub.layout==="pitched","Deep bass must remain an editable piano-roll instrument");
 assert.ok(sub.chunks.every(chunk=>chunk.notes.some(note=>note.duration>=12)));
 assert.ok(sub.chunks.some(chunk=>chunk.notes.some(note=>note.pitch<=40&&note.duration===16)));
 const activeSubBars=sub.timeline.map(chunkId=>sub.chunks.find(chunk=>chunk.id===chunkId))
  .filter(Boolean);
 assert.equal(activeSubBars.length,doc.bars,"The low-frequency bed must cover every bar");
 const mid=doc.instruments.find(inst=>inst.sounds[0].patch.presetId==="rubber-bass");
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
 const lead=doc.instruments.find(inst=>inst.sounds[0].patch.presetId==="neon-lead");
 assert.ok(lead,"The uploaded revision retains its editable lead instrument");
 const call=lead.chunks[0],answer=lead.chunks[1];
 assert.equal(lead.timeline[0],call.id,"The uploaded revision starts with the lead chunk");
 assert.deepEqual(call.notes.map(n=>[n.pitch,n.start,n.duration,n.velocity]),[
  [76,0,2,.9],[76,8,2,.9]
 ]);
 assert.deepEqual(answer.notes.map(n=>[n.pitch,n.start,n.duration,n.velocity]),[
  [83,0,5,.87],[79,12,4,.77],[81,8,1,.9]
 ]);
});

test("sustained example has independent within-bar note offsets",async()=>{
 const doc=await buildExample("floating-signals",async id=>stubSample(id));
 assert.equal(doc.bars,16);
 const bar=6,base=bar*16; // Bar 7 in the studio
 const expected=[
  ["violet-pad","Chunk 3",[0,0,0,0]],
  ["tape-strings","Chunk 3",[0,0]],
  ["midnight-theremin","Chunk 3",[1]],
  ["glass-keys","Chunk 2",[0,8,13]]
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
