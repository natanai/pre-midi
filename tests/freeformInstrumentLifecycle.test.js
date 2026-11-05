import test from "node:test";
import assert from "node:assert/strict";
import {create,clone,id,makeInstrument,makeSound} from "../schema.js";
import {makePatch} from "../synth.js";
import {createSong,upgradeSongFeatures,validateSong} from "../songModel.js";
import {createFreeformNoteCutoff} from "../freeformNoteAutomation.js";
import {ensureFreeform,addFreeformInstrument,addFreeformNote,
 addFreeformChunkPlacement,duplicateFreeformInstrument,moveFreeformInstrument,
 removeFreeformInstrument,eventsAtFreeformStep} from "../freeformModel.js";
import {renderEvents} from "../audio.js";
import {parseSong} from "../songIO.js";

test("duplicating an editable freeform Instrument copies its notes, Chunks and cutoff without linking source identities",()=>{
 const song=createSong(create()),layer=ensureFreeform(song.tracks[0]);
 const original=addFreeformInstrument(layer),first=addFreeformNote(original,{
  pitch:68,start:20,duration:25,velocity:.8,strumGroup:"source-strum",strumKey:"source-note"
 });
 first.cutoffAutomation=createFreeformNoteCutoff(first,original.sounds[0].patch);
 layer.version=2;
 original.chunks[0].notes=[{id:id(),pitch:60,start:3,duration:24,velocity:.72}];
 addFreeformChunkPlacement(original,original.chunks[0].id,32,{repeats:2,every:16});
 const before=clone(song),onsets=renderEvents(song).filter(x=>x.kind==="note");
 const copy=duplicateFreeformInstrument(layer,original.id);
 upgradeSongFeatures(song);
 assert.equal(layer.instruments.length,2);
 assert.equal(copy.name,original.name+" copy");
 assert.notEqual(copy.id,original.id);
 assert.notEqual(copy.sounds[0].id,original.sounds[0].id);
 assert.notEqual(copy.notes[0].id,original.notes[0].id);
 assert.notEqual(copy.chunks[0].id,original.chunks[0].id);
 assert.notEqual(copy.chunks[0].notes[0].id,original.chunks[0].notes[0].id);
 assert.notEqual(copy.chunkPlacements[0].id,original.chunkPlacements[0].id);
 assert.equal(copy.chunkPlacements[0].chunkId,copy.chunks[0].id);
 assert.deepEqual(copy.notes[0].cutoffAutomation,original.notes[0].cutoffAutomation);
 assert.deepEqual(layer.instruments[0],original,"Copy must not modify the source");
 assert.deepEqual(before.tracks[0].freeform.instruments[0],original);
 const doubled=renderEvents(song).filter(x=>x.kind==="note");
 assert.equal(doubled.length,onsets.length*2,"Each copy plays independently, without flattening");
 const signature=event=>[event.at,event.note.pitch,event.duration,event.instrument.sounds[0].patch.type,
  event.note.cutoffAutomation?.block.points.map(p=>[p.step,p.value])];
 const normalized=events=>events.map(signature).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 assert.deepEqual(normalized(doubled),normalized([...onsets,...onsets]));
 assert.deepEqual(validateSong(song),[]);
 assert.deepEqual(parseSong(JSON.stringify(song)),song);
 // Cutting or changing the copied note never changes its source expression.
 copy.notes[0].pitch=71;
 copy.notes[0].cutoffAutomation.block.points[1].value=950;
 assert.equal(original.notes[0].pitch,68);
 assert.notEqual(original.notes[0].cutoffAutomation.block.points[1].value,950);
});

test("Instrument reordering changes only visual order, while removing one keeps neighboring music",()=>{
 const song=createSong(create()),layer=ensureFreeform(song.tracks[0]);
 const first=addFreeformInstrument(layer),second=addFreeformInstrument(layer);
 addFreeformNote(first,{pitch:60,start:5,duration:2,velocity:.6});
 addFreeformNote(second,{pitch:65,start:9,duration:4,velocity:.8});
 upgradeSongFeatures(song);
 const before=renderEvents(song).map(e=>[e.at,e.note.pitch]).sort((a,b)=>a[0]-b[0]);
 assert.equal(moveFreeformInstrument(layer,first.id,-1),false);
 assert.equal(moveFreeformInstrument(layer,first.id,1),true);
 assert.deepEqual(layer.instruments.map(e=>e.id),[second.id,first.id]);
 assert.deepEqual(renderEvents(song).map(e=>[e.at,e.note.pitch]).sort((a,b)=>a[0]-b[0]),before);
 assert.equal(removeFreeformInstrument(layer,first.id),first);
 assert.equal(renderEvents(song).filter(e=>e.kind==="note").length,1);
 assert.equal(removeFreeformInstrument(layer,second.id),second);
 assert.equal(layer.instruments.length,0,"Freeform may remain open without Instruments");
 assert.deepEqual(validateSong(song),[]);
 assert.throws(()=>duplicateFreeformInstrument(layer,"missing"),/Choose/);
 assert.throws(()=>moveFreeformInstrument(layer,"missing",1),/Choose/);
 assert.throws(()=>removeFreeformInstrument(layer,"missing"),/Choose/);
});

test("duplicate Rack sounds remap note and Chunk IDs while immutable samples remain shared and prune only on last removal",()=>{
 const layer=ensureFreeform(createSong(create()).tracks[0]);
 const source=makeInstrument(2,1,makeSound("Recorded",makePatch(),"hit"));
 const rack=addFreeformInstrument(layer,source),oldSoundId=rack.sounds[0].id;
 rack.sounds[0].patch={type:"sample",zones:[{assetId:"one-recording",root:60}]};
 layer.samples=[{id:"one-recording",name:"shared"},{id:"unused",name:"discard"}];
 addFreeformNote(rack,{soundId:oldSoundId,start:12,duration:1,velocity:.8});
 rack.chunks[0].notes=[{id:id(),soundId:oldSoundId,start:0,duration:1,velocity:.6}];
 addFreeformChunkPlacement(rack,rack.chunks[0].id,32);
 const copied=duplicateFreeformInstrument(layer,rack.id);
 assert.equal(copied.sounds[0].patch.zones[0].assetId,"one-recording");
 assert.equal(copied.notes[0].soundId,copied.sounds[0].id);
 assert.equal(copied.chunks[0].notes[0].soundId,copied.sounds[0].id);
 assert.equal(copied.chunkPlacements[0].chunkId,copied.chunks[0].id);
 assert.equal(layer.samples.length,2,"Copy reuses existing external audio reference");
 removeFreeformInstrument(layer,rack.id);
 assert.deepEqual(layer.samples.map(x=>x.id),["one-recording"],"Surviving Rack retains its shared WAV");
 assert.equal(eventsAtFreeformStep(layer,12).length,1);
 removeFreeformInstrument(layer,copied.id);
 assert.deepEqual(layer.samples,[],"The last removed reference prunes freeform orphan assets");
});
