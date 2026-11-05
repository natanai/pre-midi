import test from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {create,id,clone,upgradeBeatFeatures} from "../schema.js";
import {renderEvents,noteTimeline,secondsPerStep} from "../audio.js";
import {eventsAtSongStep,songDurationSteps,createSong,addSongTrack,
 addBeatClip,upgradeSongFeatures,validateSong} from "../songModel.js";
import {recordingEventsAtStep} from "../songAudio.js";
import {ensureFreeform,addFreeformInstrument,addFreeformNote,
 addFreeformChunkPlacement} from "../freeformModel.js";
import {resolveEvent} from "../soundModel.js";
import {strumOffset} from "../guitarTiming.js";
import {nativePlans} from "../src/hosts/native/session.js";

// Slow, intentionally independent reference: exactly the legacy step-by-step
// public APIs, not the sparse compiler's implementation.
function reference(song){
 const unit=secondsPerStep(song),length=songDurationSteps(song),events=[];
 for(let step=0;step<length;step++){
  for(const event of recordingEventsAtStep(song,step))
   events.push({kind:"vocal",at:step*unit,event});
  for(const event of eventsAtSongStep(song,step)){
   const voice=event.instrument.layout==="rack"?null:
    (event.instrument.sounds?resolveEvent(event.instrument,event.note)?.voice:event.instrument);
   const offset=voice?strumOffset(voice,event.note,event.chunk.notes):0;
   events.push({kind:"note",at:step*unit+offset,instrument:event.instrument,
    note:event.note,duration:event.note.duration*unit,beat:event.beat||song,
    timeline:noteTimeline(event,step,unit,length)});
  }
 }
 return events.sort((a,b)=>a.at-b.at);
}

test("sparse Song schedule exactly matches stepwise source phases, overlaps, freeform and vocals",()=>{
 const beat=create(),inst=beat.instruments[0],chunk=inst.chunks[0];
 chunk.notes=[
  {id:id(),pitch:60,start:0,duration:25,velocity:.8},
  {id:id(),pitch:67,start:6,duration:3,velocity:.65}
 ];
 inst.timeline[0]=chunk.id;
 inst.timeline[1]=chunk.id;
 inst.placements[0]={offset:1,length:16,every:7,repeats:3};
 // Multi-bar sustain is versioned rather than split into multiple note-ons.
 upgradeBeatFeatures(beat);
 const song=createSong(beat),first=song.tracks[0].clips[0];
 first.startStep=9;first.lengthSteps=73;first.sourceOffsetSteps=5;
 const secondTrack=addSongTrack(song,"beat");
 const second=addBeatClip(song,secondTrack.id,beat.id,12,65);
 second.sourceOffsetSteps=18;
 const layer=ensureFreeform(song.tracks[0]),free=addFreeformInstrument(layer);
 addFreeformNote(free,{pitch:71,start:13,duration:34,velocity:.75});
 addFreeformNote(free,{pitch:72,start:13,duration:3,velocity:.85});
 free.chunks[0].notes=[{id:id(),pitch:75,start:5,duration:20,velocity:.6}];
 addFreeformChunkPlacement(free,free.chunks[0].id,17,{repeats:3,every:11});
 const voice=addSongTrack(song,"vocal");
 song.recordings=[{id:"voice-one",durationSeconds:2}];
 voice.clips.push({id:"voice-clip",recordingId:"voice-one",startStep:20,
  lengthSteps:8,gain:1});
 upgradeSongFeatures(song);
 const original=clone(song);
 assert.deepEqual(renderEvents(song),reference(song));
 assert.deepEqual(song,original,"Schedule creation may never alter reusable Beat or Song data");
 // The same exact onset/time/automation source is delivered to the native host.
 const expected=nativePlans(reference(song).filter(e=>e.kind==="note"));
 const actual=nativePlans(renderEvents(song).filter(e=>e.kind==="note"));
 assert.deepEqual(actual,expected);
});

test("sparse rendering supports long silent gaps and thousands of overlapping Clips",()=>{
 const beat=create();beat.instruments[0].timeline.fill(null);
 const song=createSong(beat),lane=song.tracks[0];
 lane.clips=Array.from({length:7000},(_,i)=>({
  id:"silent-"+i,beatId:beat.id,startStep:i%3500,lengthSteps:16
 }));
 const started=performance.now(),rendered=renderEvents(song);
 assert.equal(rendered.length,0);
 assert.equal(songDurationSteps(song),3515);
 assert.ok(performance.now()-started<3500,"Sparse long-Song scheduling took too long");
});

test("Song duration is stack-safe with very large sparse Clip arrays",()=>{
 const song=createSong(create()),clip=song.tracks[0].clips[0];
 song.tracks[0].clips=Array.from({length:150000},(_,i)=>({
  ...clip,id:"sparse-"+i,startStep:i%6000,lengthSteps:16
 }));
 assert.equal(songDurationSteps(song),6015);
});

test("native onset budgets reject dense Songs before unbounded packet allocation",()=>{
 const beat=create();beat.instruments[0].timeline.fill(null);
 const song=createSong(beat),lane=song.tracks[0];
 lane.clips=[];
 const layer=ensureFreeform(lane),instrument=addFreeformInstrument(layer);
 for(let step=0;step<4097;step++)
  addFreeformNote(instrument,{pitch:60,start:step,duration:1,velocity:.7});
 upgradeSongFeatures(song);
 assert.deepEqual(validateSong(song),[]);
 assert.equal(renderEvents(song).length,4097,"Web rendering keeps all valid notes");
 assert.throws(()=>renderEvents(song,{maxEvents:4096}),/4096 scheduled note\/voice onsets/);
});
