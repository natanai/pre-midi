import test from "node:test";
import assert from "node:assert/strict";
import {create,id,clone,makeInstrument,makeSound,upgradeBeatFeatures,validate as validateBeat} from "../schema.js";
import {makePatch} from "../synth.js";
import {renderEvents} from "../audio.js";
import {createSong,editBeatClip,upgradeSongFeatures,validateSong} from "../songModel.js";
import {nativePlans} from "../src/hosts/native/session.js";
import {noteCutoffAutomation} from "../src/dsp/automation.js";
import {planSynthVoice} from "../src/dsp/synth-voice.js";
import {createFreeform,addFreeformInstrument,addFreeformNote,
 addFreeformChunkPlacement,eventsAtFreeformStep,freeformEndStep,
 moveFreeformPassage,unpackBeatClip,createBeatFromFreeformSelection,soundingFreeformPitches,validateFreeform,FREEFORM_SONG_VERSION,FREEFORM_AUTOMATION_SONG_VERSION} from "../freeformModel.js";

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

test("partial unpack rejects cuts through sustained notes without mutating source",()=>{
 const beat=create();
 beat.instruments[0].chunks[0].notes=[{
  id:"sustain",pitch:65,start:2,duration:12,velocity:.8
 }];
 const song=createSong(beat),clip=song.tracks[0].clips[0],before=clone(song);
 assert.throws(()=>unpackBeatClip(song,clip.id,{fromStep:6,toStep:16}),/sustained note crosses/);
 assert.deepEqual(song,before);
 assert.throws(()=>unpackBeatClip(song,clip.id,{fromStep:0,toStep:6}),/sustained note crosses/);
 assert.deepEqual(song,before);
});

test("Create Beat from freeform selection preserves pitched and rack sounds, timing, and source",()=>{
 const song=createSong(create()),track=song.tracks[0];
 const free=createFreeform();track.freeform=free;
 const keys=addFreeformInstrument(free);
 addFreeformNote(keys,{pitch:61,start:16,duration:3,velocity:.82,bend:{shape:"rise",amount:1,rate:5}});
 addFreeformNote(keys,{pitch:64,start:33,duration:3,velocity:.64});
 keys.chunks[0].notes.push({id:id(),pitch:72,start:4,duration:2,velocity:.55});
 addFreeformChunkPlacement(keys,keys.chunks[0].id,16,{length:16,repeats:2,every:16});
 const drumSource=makeInstrument(2,1,makeSound("Snare",makePatch(),"hit"));
 const drums=addFreeformInstrument(free,drumSource);
 addFreeformNote(drums,{soundId:drums.sounds[0].id,start:24,duration:1,velocity:.91});
 song.version=22;
 const snapshot=clone(song);
 const beat=createBeatFromFreeformSelection(song,track.id,16,48,{title:"Chorus variation"});
 assert.deepEqual(song,snapshot,"Creating a Beat cannot change the Song or its notes");
 assert.equal(beat.title,"Chorus variation");
 assert.equal(beat.bars,2);
 assert.equal(beat.bpm,song.bpm);
 assert.equal(beat.instruments.length,2);
 assert.equal(beat.instruments[1].layout,"rack");
 assert.deepEqual(validateBeat(beat),[]);
 const before=[];
 for(let step=16;step<48;step++)
  for(const event of eventsAtFreeformStep(free,step))
   before.push([step-16,event.instrument.name,event.note.pitch??"hit",event.note.velocity]);
 const after=renderEvents(beat).map(event=>[
  Math.round(event.at/(60/beat.bpm/4)),event.instrument.name,
  event.note.pitch??"hit",event.note.velocity
 ]);
 assert.deepEqual(after.sort((a,b)=>a[0]-b[0]),before.sort((a,b)=>a[0]-b[0]));
});
test("Create Beat from selection deduplicates repeating one-bar patterns",()=>{
 const song=createSong(create()),track=song.tracks[0],free=createFreeform();
 track.freeform=free;
 const inst=addFreeformInstrument(free);
 for(let bar=0;bar<40;bar++)addFreeformNote(inst,{pitch:60,start:bar*16,duration:4,velocity:.8});
 const beat=createBeatFromFreeformSelection(song,track.id,0,640);
 assert.equal(beat.bars,40);
 assert.equal(beat.version,17);
 assert.equal(beat.instruments[0].chunks.length,1,"identical bars reuse the same Chunk");
 assert.equal(new Set(beat.instruments[0].timeline).size,1);
 assert.deepEqual(validateBeat(beat),[]);
});
test("Create Beat from selection refuses lossy boundaries and format overflows",()=>{
 const song=createSong(create()),track=song.tracks[0],free=createFreeform();
 track.freeform=free;const inst=addFreeformInstrument(free);
 addFreeformNote(inst,{pitch:60,start:15,duration:3,velocity:.8});
 song.version=22;
 const before=clone(song);
 assert.throws(()=>createBeatFromFreeformSelection(song,track.id,0,16),/beyond the selection/);
 assert.throws(()=>createBeatFromFreeformSelection(song,track.id,0,32),/crosses a Beat bar boundary/);
 assert.throws(()=>createBeatFromFreeformSelection(song,track.id,16,32),/sustains into the selection/);
 assert.throws(()=>createBeatFromFreeformSelection(song,track.id,0,65*16),/at most 64 bars/);
 assert.deepEqual(song,before);
});
test("Create Beat from selection refuses unrepresentable unique Chunk counts",()=>{
 const song=createSong(create()),track=song.tracks[0],free=createFreeform();
 track.freeform=free;const inst=addFreeformInstrument(free);
 for(let bar=0;bar<33;bar++)addFreeformNote(inst,{pitch:36+bar,start:bar*16,duration:2,velocity:.8});
 const before=clone(song);
 assert.throws(()=>createBeatFromFreeformSelection(song,track.id,0,33*16),/32 unique Chunks/);
 assert.deepEqual(song,before);
});

test("Create Beat from selection supports non-bar-aligned Song positions",()=>{
 const song=createSong(create()),track=song.tracks[0],free=createFreeform();
 track.freeform=free;
 const inst=addFreeformInstrument(free);
 addFreeformNote(inst,{pitch:60,start:6,duration:2,velocity:.8});
 addFreeformNote(inst,{pitch:64,start:18,duration:1,velocity:.7});
 const beat=createBeatFromFreeformSelection(song,track.id,4,20);
 assert.equal(beat.bars,1);
 assert.deepEqual(beat.instruments[0].chunks[0].notes.map(note=>note.start).sort((a,b)=>a-b),[2,14]);
 assert.deepEqual(validateBeat(beat),[]);
});

test("freeform keys light for independent sustained notes and repeated placed Chunks",()=>{
 const layer=createFreeform(),first=addFreeformInstrument(layer),second=addFreeformInstrument(layer);
 addFreeformNote(first,{pitch:64,start:16,duration:48,velocity:.8});
 first.chunks[0].notes=[{id:id(),pitch:72,start:12,duration:4,velocity:.8}];
 addFreeformChunkPlacement(first,first.chunks[0].id,0,{length:16,every:16,repeats:3});
 addFreeformNote(second,{pitch:79,start:16,duration:1,velocity:.8});
 assert.deepEqual([...soundingFreeformPitches(layer,first.id,12)].sort((a,b)=>a-b),[72]);
 assert.deepEqual([...soundingFreeformPitches(layer,first.id,28)].sort((a,b)=>a-b),[64,72]);
 assert.deepEqual([...soundingFreeformPitches(layer,first.id,44)].sort((a,b)=>a-b),[64,72]);
 assert.deepEqual([...soundingFreeformPitches(layer,first.id,63)],[64]);
 assert.deepEqual([...soundingFreeformPitches(layer,first.id,64)],[]);
 assert.deepEqual([...soundingFreeformPitches(layer,first.id,16)],[64]);
 assert.deepEqual([...soundingFreeformPitches(layer,second.id,16)],[79]);
 assert.deepEqual([...soundingFreeformPitches(layer,"missing",16)],[]);
 assert.deepEqual([...soundingFreeformPitches(layer,first.id,-1)],[]);
});

const cutoffCurve=()=>({version:1,target:"filter.cutoff",unit:"hz",
 interpolation:"exponential",points:[
  {id:"low",step:0,value:400},{id:"high",step:128,value:6400}
 ]});
const automatedSong=({offset=0,length=256}={})=>{
 const beat=create(),inst=beat.instruments[0];
 inst.automation=cutoffCurve();
 inst.chunks[0].notes=[
  {id:"low-source",pitch:60,start:4,duration:6,velocity:.8},
  {id:"top-source",pitch:67,start:12,duration:4,velocity:.75}
 ];
 inst.timeline[1]=inst.chunks[0].id;
 upgradeBeatFeatures(beat);
 const song=createSong(beat),clip=song.tracks[0].clips[0];
 editBeatClip(song,clip.id,{lengthSteps:length,sourceOffsetSteps:offset});
 return song;
};
const round=value=>Math.round(value*1e9)/1e9;
const signature=plan=>({
 at:round(plan.start),pitch:plan.expression.pitch,duration:round(plan.duration),
 cutoff:plan.automation?.points.map(point=>[round(point.time),round(point.value)])
});
test("unpacking automated repetitions gives exactly matching native voice timelines",()=>{
 const song=automatedSong({offset:16,length:256}),clip=song.tracks[0].clips[0];
 const original=clone(song.beats[0]),before=nativePlans(renderEvents(song)).map(signature);
 const passage=unpackBeatClip(song,clip.id);
 assert.equal(song.version,FREEFORM_AUTOMATION_SONG_VERSION);
 assert.equal(song.tracks[0].freeform.version,2);
 assert.deepEqual(song.beats[0],original);
 assert.equal(song.tracks[0].clips.length,0);
 assert.deepEqual(validateSong(song),[]);
 const after=nativePlans(renderEvents(song)).map(signature);
 assert.deepEqual(after,before,"Automated cutoff envelopes, starts, and note durations must match");
 const captured=song.tracks[0].freeform.instruments[0].notes;
 assert.ok(captured.length>2);
 assert.ok(captured.every(note=>note.cutoffAutomation?.version===1));
 const unchanged=after.map(({cutoff})=>cutoff.map(([time,value])=>value));
 moveFreeformPassage(song.tracks[0].freeform,passage.id,passage.startStep+16);
 const shifted=nativePlans(renderEvents(song)).map(signature);
 assert.deepEqual(shifted.map(({cutoff})=>cutoff.map(([time,value])=>value)),unchanged,
  "Moving the passage cannot change the source automation phase");
 assert.deepEqual(shifted.map(x=>x.at),after.map(x=>round(x.at+16*60/song.bpm/4)));
 assert.deepEqual(validateSong(song),[]);
});
test("partial automated unpack preserves remaining Beat Clips and exact cutoff plans",()=>{
 const song=automatedSong({length:256}),clip=song.tracks[0].clips[0];
 const before=nativePlans(renderEvents(song)).map(signature);
 // Convert the middle, leaving both neighboring Clips linked to the source.
 unpackBeatClip(song,clip.id,{fromStep:32,toStep:96});
 const [left,right]=song.tracks[0].clips;
 assert.equal(left.lengthSteps,32);
 assert.equal(right.startStep,96);
 assert.equal(right.sourceOffsetSteps,96);
 assert.equal(left.automationTailSteps,224,
  "Retained linked Clip keeps its original cutoff release-tail continuation");
 const after=nativePlans(renderEvents(song)).map(signature);
 assert.deepEqual(after,before);
 assert.deepEqual(validateSong(song),[]);
});
test("captured cutoff movement is validated, versioned, and never silently discarded",()=>{
 const song=automatedSong(),clip=song.tracks[0].clips[0];
 unpackBeatClip(song,clip.id);
 const before=clone(song),track=song.tracks[0],inst=track.freeform.instruments[0];
 assert.throws(()=>createBeatFromFreeformSelection(song,track.id,0,128),/captured cutoff movement/);
 assert.deepEqual(song,before,"Beat conversion must not erase a saved cutoff curve");
 song.version=FREEFORM_SONG_VERSION;
 assert.match(validateSong(song).join(" "),/requires Song v23/);
 song.version=FREEFORM_AUTOMATION_SONG_VERSION;
 track.freeform.version=1;
 assert.match(validateSong(song).join(" "),/requires freeform v2/);
 track.freeform.version=2;
 const note=inst.notes[0],savedStep=note.cutoffAutomation.step;
 note.cutoffAutomation.step=-1;
 assert.match(validateSong(song).join(" "),/Invalid captured note cutoff movement/);
 note.cutoffAutomation.step=savedStep;
 assert.deepEqual(validateSong(song),[]);
});
test("freeform Chunk creation may retain a captured note cutoff curve",()=>{
 const song=automatedSong(),clip=song.tracks[0].clips[0];
 unpackBeatClip(song,clip.id);
 const layer=song.tracks[0].freeform,inst=layer.instruments[0],note=inst.notes[0];
 const cloneNote=clone(note);cloneNote.id=id();cloneNote.start=4;
 delete cloneNote.passageId;delete cloneNote.strumGroup;delete cloneNote.strumKey;
 inst.chunks[0].notes.push(cloneNote);
 assert.deepEqual(validateFreeform(layer),[]);
 const placed=addFreeformChunkPlacement(inst,inst.chunks[0].id,400);
 const at=placed.startStep+cloneNote.start;
 const event=eventsAtFreeformStep(layer,at).find(entry=>entry.note.id===cloneNote.id);
 assert.ok(event?.note.cutoffAutomation);
 const resolved=noteCutoffAutomation(event.instrument,event.note,{step:at,unit:.125,limitStep:512});
 const preview=planSynthVoice({patch:inst.sounds[0].patch,volume:inst.volume},{...cloneNote,pitch:60},0,.4,resolved);
 assert.equal(preview.version,3);
});
