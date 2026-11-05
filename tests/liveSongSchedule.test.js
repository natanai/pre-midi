import test from "node:test";
import assert from "node:assert/strict";
import {create,id,clone} from "../schema.js";
import {createSong,addBeatClip,addSongTrack,eventsAtSongStep} from "../songModel.js";
import {ensureFreeform,addFreeformInstrument,addFreeformNote,addFreeformChunkPlacement} from "../freeformModel.js";
import {createLiveSongScheduler,scheduledSongOnsets} from "../songSchedule.js";
import {recordingEventsAtStep} from "../songAudio.js";
import {readFileSync} from "node:fs";

const signature=event=>JSON.stringify({
 instrument:event.instrument.id,note:event.note.id,
 clip:event.clip?.id||"",chunk:event.chunk.id,beatStep:event.beatStep,
 sourceBar:event.sourceBar,track:event.track.id
});
const sorted=events=>events.map(signature).sort();

test("live sparse scheduler matches legacy Song onsets, offsets, repeats and attached freeform",()=>{
 const beat=create(),inst=beat.instruments[0],chunk=inst.chunks[0];
 chunk.notes=[{id:id(),pitch:60,start:0,duration:8,velocity:.8},
  {id:id(),pitch:67,start:6,duration:5,velocity:.65}];
 inst.timeline[0]=chunk.id;
 const song=createSong(beat),clip=song.tracks[0].clips[0];
 clip.startStep=5;clip.sourceOffsetSteps=3;clip.lengthSteps=65;
 const second=addSongTrack(song,"beat");
 const overlap=addBeatClip(song,second.id,beat.id,12,38);
 overlap.sourceOffsetSteps=9;
 const layer=ensureFreeform(song.tracks[0]),free=addFreeformInstrument(layer);
 addFreeformNote(free,{pitch:72,start:14,duration:32,velocity:.85});
 free.chunks[0].notes=[{id:id(),pitch:74,start:3,duration:22,velocity:.72}];
 addFreeformChunkPlacement(free,free.chunks[0].id,23,{repeats:3,every:11});
 const sparse=createLiveSongScheduler(()=>song,()=>1);
 for(let step=0;step<90;step++){
  assert.deepEqual(sorted(sparse.atStep(step).notes),sorted(eventsAtSongStep(song,step)),
   "Song step "+step+" must preserve all original source identities");
 }
 assert.equal(sparse.atStep(180).notes.length,0);
 assert.equal(sparse.atStep(50).vocals.length,0);
});

test("explicit mutation revision and replacement identity invalidate cached live schedule",()=>{
 let song=createSong(create()),revision=0;
 const inst=song.beats[0].instruments[0],chunk=inst.chunks[0];
 chunk.notes=[{id:"one",pitch:60,start:0,duration:1,velocity:.7}];
 inst.timeline[0]=chunk.id;
 const live=createLiveSongScheduler(()=>song,()=>revision);
 assert.equal(live.atStep(0).notes.length,1);
 chunk.notes.push({id:"two",pitch:64,start:0,duration:1,velocity:.8});
 assert.equal(live.atStep(0).notes.length,1,
  "A live editor must explicitly report a committed revision");
 revision++;
 assert.equal(live.atStep(0).notes.length,2,"Committed edits refresh notes");
 chunk.notes.pop();revision++;
 assert.equal(live.atStep(0).notes.length,1,"Undo revision refreshes notes");
 chunk.notes.push({id:"three",pitch:67,start:0,duration:1,velocity:.8});revision++;
 assert.equal(live.atStep(0).notes.length,2,"Redo revision refreshes notes");
 const newSong=clone(song);
 newSong.beats[0].instruments[0].chunks[0].notes.push({
  id:"four",pitch:72,start:0,duration:1,velocity:.8
 });
 song=newSong;
 assert.equal(live.atStep(0).notes.length,3,
  "Importing another Song must invalidate even without a new revision number");
});

test("vocal Song onsets remain indexed and seek restores overlapping voice clips",()=>{
 const song=createSong(create()),track=addSongTrack(song,"vocal");
 song.recordings=[{id:"take",durationSeconds:3}];
 track.clips=[{id:"clip",recordingId:"take",startStep:5,lengthSteps:24,gain:1}];
 const live=createLiveSongScheduler(()=>song,()=>0);
 assert.equal(live.atStep(5).vocals.length,1);
 assert.equal(live.atStep(14).vocals.length,0);
 assert.equal(recordingEventsAtStep(song,14,{includeOverlapping:true}).length,1);
 const audio=readFileSync(new URL("../audio.js",import.meta.url),"utf8");
 assert.match(audio,/scheduled===start\?recordingEventsAtStep\(current,step,\{includeOverlapping:true\}\)/);
 assert.match(audio,/sparse\?\.vocals\?\?recordingEventsAtStep\(current,step\)/);
});

test("sparse live cache stays bounded by authored onsets rather than all silent steps",()=>{
 const song=createSong(create()),track=song.tracks[0];
 song.beats[0].instruments[0].timeline.fill(null);
 track.clips=Array.from({length:7000},(_,i)=>({
  id:"silent-"+i,beatId:song.beats[0].id,startStep:i%3500,lengthSteps:16
 }));
 const index=scheduledSongOnsets(song);
 assert.equal(index.size,0,"Thousands of silent Clips allocate no time-step buckets");
 const live=createLiveSongScheduler(()=>song,()=>1);
 for(let step=0;step<3500;step++)assert.equal(live.atStep(step).notes.length,0);
});
