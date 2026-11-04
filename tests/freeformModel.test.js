import test from "node:test";
import assert from "node:assert/strict";
import {create,id,clone,makeInstrument} from "../schema.js";
import {createSong} from "../songModel.js";
import {createFreeform,addFreeformInstrument,addFreeformNote,
 addFreeformChunkPlacement,eventsAtFreeformStep,freeformEndStep,
 moveFreeformPassage,unpackBeatClip,validateFreeform,FREEFORM_SONG_VERSION} from "../freeformModel.js";

test("empty freeform supports long notes and independent reusable Chunks",()=>{
 const layer=createFreeform(),instrument=addFreeformInstrument(layer);
 addFreeformNote(instrument,{pitch:64,start:42,duration:23,velocity:.8});
 assert.equal(eventsAtFreeformStep(layer,42).length,1);
 assert.equal(eventsAtFreeformStep(layer,43).length,0);
 instrument.chunks[0].notes=[{id:id(),pitch:60,start:3,duration:2,velocity:.8}];
 addFreeformChunkPlacement(instrument,instrument.chunks[0].id,80,{every:12,repeats:3});
 assert.deepEqual([83,95,107].map(step=>eventsAtFreeformStep(layer,step).length),[1,1,1]);
 assert.equal(freeformEndStep(layer),120);
 assert.deepEqual(validateFreeform(layer),[]);
});
test("unpack resolves all audible repetitions into independent notes without changing source",()=>{
 const beat=create(),inst=beat.instruments[0];
 inst.chunks[0].notes=[{id:"note-a",pitch:60,start:2,duration:8,velocity:.7}];
 inst.timeline[1]=inst.chunks[0].id;
 const other=makeInstrument(2,beat.bars);
 other.chunks[0].notes=[{id:"note-b",pitch:72,start:0,duration:1,velocity:.8}];
 beat.instruments.push(other);
 const song=createSong(beat),snapshot=clone(song.beats[0]),clip=song.tracks[0].clips[0];
 const passage=unpackBeatClip(song,clip.id);
 assert.equal(song.version,FREEFORM_SONG_VERSION);
 assert.equal(song.tracks[0].clips.length,0);
 assert.deepEqual(song.beats[0],snapshot);
 const layer=song.tracks[0].freeform;
 assert.equal(layer.instruments.length,2);
 assert.equal(eventsAtFreeformStep(layer,2).length,1);
 assert.equal(eventsAtFreeformStep(layer,16).length,0);
 assert.equal(eventsAtFreeformStep(layer,18).length,1);
 assert.deepEqual(validateFreeform(layer),[]);
 const prev=layer.instruments[0].notes[0].start;
 moveFreeformPassage(layer,passage.id,passage.startStep+12);
 assert.equal(layer.instruments[0].notes[0].start,prev+12);
});
test("partial unpack preserves the original Beat phase on both sides",()=>{
 const beat=create();beat.instruments[0].chunks[0].notes=[{
  id:"a",pitch:60,start:0,duration:1,velocity:.9
 }];
 beat.instruments[0].timeline[1]=beat.instruments[0].chunks[0].id;
 const song=createSong(beat),clip=song.tracks[0].clips[0];
 const original=clone(clip);
 unpackBeatClip(song,clip.id,{fromStep:8,toStep:24});
 const [left,right]=song.tracks[0].clips;
 assert.equal(left.startStep,0);assert.equal(left.lengthSteps,8);
 assert.equal(right.startStep,24);assert.equal(right.lengthSteps,original.lengthSteps-24);
 assert.equal(right.sourceOffsetSteps,24);
 assert.equal(eventsAtFreeformStep(song.tracks[0].freeform,16).length,1);
 assert.deepEqual(validateFreeform(song.tracks[0].freeform),[]);
});
test("unsupported automation never mutates the source Song",()=>{
 const song=createSong(create());
 song.beats[0].instruments[0].automation={version:1};
 const before=clone(song);
 assert.throws(()=>unpackBeatClip(song,song.tracks[0].clips[0].id),/automation/);
 assert.deepEqual(song,before);
});
