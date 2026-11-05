import test from "node:test";
import assert from "node:assert/strict";
import {create,id,upgradeBeatFeatures} from "../schema.js";
import {createSong,addSongTrack,addBeatClip,songDurationSteps,upgradeSongFeatures} from "../songModel.js";
import {ensureFreeform,addFreeformInstrument,addFreeformNote,addFreeformChunkPlacement} from "../freeformModel.js";
import {renderEvents,renderEventsInWindow,secondsPerStep} from "../audio.js";
import {nativePlans} from "../src/hosts/native/session.js";

const signature=event=>event.kind==="vocal"?
 ["vocal",event.at,event.event.track.id,event.event.clip.id]:
 ["note",event.at,event.duration,event.instrument.id,event.note.id,
  event.timeline?.step,event.timeline?.limitStep,event.note.pitch??event.note.soundId];

test("Song page event materialization preserves all native plans, voices, vocals and source phases",()=>{
 const beat=create(),keys=beat.instruments[0];
 keys.chunks[0].notes=[
  {id:"held",pitch:60,start:15,duration:25,velocity:.8},
  {id:"short",pitch:67,start:4,duration:3,velocity:.7}
 ];
 keys.timeline[1]=keys.chunks[0].id;
 upgradeBeatFeatures(beat);
 const song=createSong(beat),first=song.tracks[0].clips[0];
 first.startStep=7;first.lengthSteps=159;first.sourceOffsetSteps=9;
 const other=addSongTrack(song,"beat");
 const repeated=addBeatClip(song,other.id,beat.id,18,110);
 repeated.sourceOffsetSteps=31;
 const freeform=ensureFreeform(song.tracks[0]),instrument=addFreeformInstrument(freeform);
 addFreeformNote(instrument,{pitch:74,start:14,duration:31,velocity:.75});
 addFreeformNote(instrument,{pitch:76,start:64,duration:2,velocity:.85});
 instrument.chunks[0].notes=[
  {id:"left",pitch:79,start:2,duration:18,velocity:.6},
  {id:"right",pitch:81,start:12,duration:1,velocity:.65}
 ];
 addFreeformChunkPlacement(instrument,instrument.chunks[0].id,29,{every:11,repeats:13});
 const vocal=addSongTrack(song,"vocal");
 song.recordings=[{id:"voice",durationSeconds:2}];
 vocal.clips.push({id:"vocal-clip",recordingId:"voice",startStep:48,lengthSteps:8,gain:1});
 upgradeSongFeatures(song);
 const source=JSON.stringify(song),full=renderEvents(song),paged=[];
 const end=songDurationSteps(song);
 for(let start=0;start<end;start+=13)
  paged.push(...renderEventsInWindow(song,start,Math.min(start+13,end)));
 paged.sort((a,b)=>a.at-b.at);
 assert.deepEqual(paged.map(signature),full.map(signature),
  "Every page must match full Song rendering without a second synthesis implementation");
 assert.deepEqual(nativePlans(paged.filter(e=>e.kind==="note")),
  nativePlans(full.filter(e=>e.kind==="note")),
  "Native voice timing and automation must retain their absolute Song phases");
 assert.equal(JSON.stringify(song),source,"Page preparation must never mutate authored music");
 assert.ok(paged.some(event=>event.note?.id==="held"&&event.duration===25*secondsPerStep(song)),
  "A release crossing multiple page boundaries must not be truncated");
 assert.equal(paged.filter(e=>e.kind==="vocal").length,1);
});

test("strum crossing a page boundary is owned by its source Song step exactly once",()=>{
 const song=createSong(create()),inst=song.beats[0].instruments[0];
 inst.chunks[0].notes=[
  {id:"down",pitch:60,start:15,duration:2,velocity:.8},
  {id:"up",pitch:64,start:15,duration:2,velocity:.8}
 ];
 const patch=inst.sounds[0].patch;
 // A sample-style Sound can add an audible positive strum offset. The
 // source-time page boundary remains fixed even when the higher note sounds
 // after its page's end.
 patch.type="sample";patch.strumMs=175;
 const unit=secondsPerStep(song),full=renderEvents(song);
 const first=renderEventsInWindow(song,0,16);
 const second=renderEventsInWindow(song,16,32);
 assert.equal(first.length,2);
 assert.equal(second.length,0);
 assert.deepEqual(first.map(signature),full.map(signature));
 assert.ok(first.some(event=>event.at>16*unit-0.001),
  "The delayed strummed note must remain owned by its authored onset page");
});

test("late page events materialize without a 4096-onset full Song",()=>{
 const beat=create(),inst=beat.instruments[0];
 inst.chunks[0].notes=[{id:id(),pitch:60,start:0,duration:1,velocity:.8}];
 const song=createSong(beat),clip=song.tracks[0].clips[0];
 song.tracks[0].clips=Array.from({length:5500},(_,i)=>({
  ...clip,id:"source-"+i,startStep:i*16,lengthSteps:16
 }));
 assert.throws(()=>renderEvents(song,{maxEvents:4096}),/4096 scheduled/);
 const events=renderEventsInWindow(song,5000*16,5010*16,{maxEvents:10});
 assert.equal(events.length,10);
 assert.deepEqual(events.map(event=>event.at/secondsPerStep(song)),
  Array.from({length:10},(_,i)=>(5000+i)*16));
 assert.throws(()=>renderEventsInWindow(song,5000*16,5010*16,{maxEvents:9}),
  /9 scheduled/);
 assert.throws(()=>renderEventsInWindow(beat,0,16),/require a Song/);
});
