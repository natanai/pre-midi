import test from "node:test";
import assert from "node:assert/strict";
import {create} from "../schema.js";
import {createSong,upgradeSongFeatures,songDurationSteps} from "../songModel.js";
import {ensureFreeform,addFreeformInstrument,addFreeformNote} from "../freeformModel.js";
import {scheduledSongOnsets} from "../songSchedule.js";
import {nextNativeOnsetPage,nativePageDescriptorCursor} from "../src/hosts/native/onset-pages.js";

test("adaptive onset pages cover dense Song steps with no skipped, duplicated or truncated onsets",()=>{
 const song=createSong(create()),layer=ensureFreeform(song.tracks[0]);
 const instrument=addFreeformInstrument(layer);
 for(let step=0;step<40;step++)
  addFreeformNote(instrument,{pitch:60+step%8,start:step,duration:step===0?45:2,velocity:.7});
 for(const step of [4,6,19,19,20,28])
  addFreeformNote(instrument,{pitch:72,start:step,duration:3,velocity:.65});
 upgradeSongFeatures(song);
 const total=songDurationSteps(song),expected=scheduledSongOnsets(song);
 let cursor=0,previous=0,iterations=0;
 const result=new Map();
 while(cursor<total){
  const page=nextNativeOnsetPage(song,cursor,{maxSteps:16,maxOnsets:6});
  assert.ok(page,"an unfinished Song must produce its next page");
  assert.equal(page.startStep,cursor);
  assert.ok(page.endStep>cursor&&page.endStep<=cursor+16);
  assert.ok(page.onsetCount<=6);
  for(const [step,entry] of page.onsets){
   assert.ok(step>=cursor&&step<page.endStep,"a page cannot own an onset outside its range");
   assert.ok(!result.has(step),"no onset may be rendered by two pages");
   result.set(step,entry);
  }
  previous=cursor;cursor=page.endStep;
  assert.ok(++iterations<100,"page planner must always make forward progress");
 }
 assert.equal(previous<cursor,true);
 assert.equal(cursor,total);
 assert.deepEqual([...result].sort((a,b)=>a[0]-b[0]),
  [...expected].sort((a,b)=>a[0]-b[0]));
 const tail=result.get(0).notes.find(x=>x.note.duration===45);
 assert.ok(tail,"a note releasing across later pages retains its original duration");
 assert.equal(nextNativeOnsetPage(song,total),null);
});

test("adaptive pages reject an overloaded single Song step without truncating voices",()=>{
 const song=createSong(create()),layer=ensureFreeform(song.tracks[0]);
 const inst=addFreeformInstrument(layer);
 for(let i=0;i<7;i++)
  addFreeformNote(inst,{pitch:60+i,start:12,duration:3,velocity:.7});
 upgradeSongFeatures(song);
 const before=JSON.stringify(song);
 const prior=nextNativeOnsetPage(song,0,{maxSteps:16,maxOnsets:6});
 assert.ok(prior.endStep<=12&&prior.endStep>0);
 assert.throws(()=>nextNativeOnsetPage(song,12,{maxSteps:16,maxOnsets:6}),
  /step 12 exceeds the native page onset budget/);
 assert.equal(JSON.stringify(song),before,"planning cannot mutate authored Song events");
});

test("late pages do not need to expand thousands of earlier linked Beat Clips",()=>{
 const beat=create(),chunk=beat.instruments[0].chunks[0];
 chunk.notes=[{id:"ping",pitch:60,start:0,duration:1,velocity:.8}];
 const song=createSong(beat),clip=song.tracks[0].clips[0];
 song.tracks[0].clips=Array.from({length:6000},(_,i)=>({
  ...clip,id:"far-"+i,startStep:16*i,lengthSteps:16
 }));
 const page=nextNativeOnsetPage(song,5500*16,{maxSteps:64,maxOnsets:4});
 assert.equal(page.startStep,5500*16);
 assert.equal(page.endStep,5504*16);
 assert.equal(page.onsetCount,4);
 assert.ok(page.hasMore);
 assert.deepEqual([...page.onsets.keys()].sort((a,b)=>a-b),
  [5500,5501,5502,5503].map(i=>16*i));
 assert.throws(()=>nextNativeOnsetPage(song,-1),/nonnegative/);
 assert.throws(()=>nextNativeOnsetPage(song,0,{maxSteps:0}),/width/);
 assert.throws(()=>nextNativeOnsetPage(song,0,{maxOnsets:4097}),/budget/);
});

test("native page descriptors have exact contiguous frame clocks, owner/revision and no premature resource claim",()=>{
 const song=createSong(create()),beat=song.beats[0],clip=song.tracks[0].clips[0];
 beat.instruments[0].chunks[0].notes=[
  {id:"note-a",pitch:60,start:4,duration:22,velocity:.8},
  {id:"note-b",pitch:67,start:8,duration:2,velocity:.7}
 ];
 clip.startStep=9;clip.lengthSteps=321;clip.sourceOffsetSteps=7;
 const layer=ensureFreeform(song.tracks[0]),free=addFreeformInstrument(layer);
 for(let step=10;step<250;step+=9)
  addFreeformNote(free,{pitch:72,start:step,duration:4,velocity:.6});
 upgradeSongFeatures(song);
 const source=JSON.stringify(song),unit=60/song.bpm/4,sr=44100;
 let revision=4,previous=null,sequence=0,seen=0;
 const cursor=nativePageDescriptorCursor(song,{
  owner:91,revision,sampleRate:sr,startStep:5,maxSteps:21,maxOnsets:5,
  getRevision:()=>revision
 });
 for(let page=cursor.next();page;page=cursor.next()){
  const d=page.descriptor;
  assert.equal(d.sequence,++sequence);
  assert.equal(d.owner,91);assert.equal(d.revision,4);
  assert.equal(d.onsets,page.onsetCount);
  assert.equal(d.resources,0);
  assert.equal(d.prepared,false,"unvalidated resources must never be marked ready for callback");
  assert.equal(d.last,!page.hasMore);
  assert.equal(d.startFrame,Math.ceil(page.startStep*unit*sr-1e-9));
  assert.equal(d.endFrame,Math.ceil(page.endStep*unit*sr-1e-9));
  assert.ok(d.endFrame>d.startFrame);
  if(previous)assert.equal(d.startFrame,previous.endFrame,"audio frame clock has a page gap");
  previous=d;seen+=d.onsets;
  assert.ok(sequence<500,"adaptive descriptor generation must advance");
 }
 assert.ok(sequence>3&&seen>10);
 assert.equal(cursor.positionStep,songDurationSteps(song));
 assert.equal(cursor.sequence,sequence);
 assert.equal(previous.last,true);
 assert.equal(JSON.stringify(song),source,"descriptor generation may never mutate music");
 revision=5;
 assert.throws(()=>cursor.next(),/invalidate the transport revision/);
});

test("native page descriptor ownership and late frame numbers reject unsafe input",()=>{
 const song=createSong(create());
 for(const options of [
  {owner:0,revision:1,sampleRate:48000},
  {owner:1,revision:0,sampleRate:48000},
  {owner:1,revision:1,sampleRate:4800},
  {owner:1,revision:1,sampleRate:48000,startStep:-1},
  {owner:1,revision:1,sampleRate:48000,getRevision:"wrong"}
 ])assert.throws(()=>nativePageDescriptorCursor(song,options));
 const clip=song.tracks[0].clips[0];
 clip.startStep=8000;clip.lengthSteps=32;
 const clock=nativePageDescriptorCursor(song,{owner:2,revision:3,
  sampleRate:48000,startStep:7995,maxSteps:10,maxOnsets:4});
 const first=clock.next();
 assert.equal(first.descriptor.startFrame,Math.ceil(7995*.125*48000-1e-9));
 assert.ok(first.descriptor.startFrame>600*48000,
  "page metadata can represent late time without authorizing >10-minute native playback");
 assert.equal(first.descriptor.prepared,false);
 song.bpm=121;
 assert.throws(()=>clock.next(),/invalidate the transport revision/);
});
