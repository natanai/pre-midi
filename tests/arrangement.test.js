import test from "node:test";
import assert from "node:assert/strict";
import {create,makeInstrument,makeChunk,id,parse,clone,validate} from "../schema.js";
import {eventsAtStep,phraseInstances,chunkProgress} from "../arrangement.js";
import {stepEvents} from "../audio.js";
import {chunkIsPlaying} from "../pianoPlayhead.js";

const note=(pitch,start,duration=2)=>({id:id(),pitch,start,duration,velocity:.8});
test("bar-based v6 compositions migrate without losing any event timing",()=>{
 const score=create(),inst=score.instruments[0];
 inst.chunks[0].notes=[note(60,0),note(64,12)];
 inst.timeline[1]=inst.chunks[0].id;
 const older=clone(score);older.version=6;delete older.instruments[0].placements;
 const original=clone(older);
 const upgraded=parse(JSON.stringify(older));
 assert.equal(upgraded.version,7);
 assert.deepEqual(upgraded.instruments[0].timeline,older.instruments[0].timeline);
 assert.deepEqual(upgraded.instruments[0].placements,Array(score.bars).fill(null));
 assert.deepEqual(older,original,"Import must not mutate supplied scores");
 assert.deepEqual(stepEvents(upgraded,0).map(e=>e.note.pitch),[60]);
 assert.deepEqual(stepEvents(upgraded,16).map(e=>e.note.pitch),[60]);
 assert.deepEqual(stepEvents(upgraded,28).map(e=>e.note.pitch),[64]);
 assert.deepEqual(parse(JSON.stringify(upgraded)),upgraded);
});
test("a melody really starts on beat three while the pad continues beneath it",()=>{
 const score=create(),pad=score.instruments[0];
 pad.chunks[0].notes=[note(48,0,16)];
 const melody=makeInstrument(2,score.bars);
 melody.chunks[0].notes=[note(72,0,6),note(76,4,4)];
 melody.placements[0]={offset:8,every:16,repeats:1};
 score.instruments.push(melody);
 assert.deepEqual(validate(score),[]);
 assert.deepEqual(eventsAtStep(score,0).map(e=>e.instrument.id),[pad.id]);
 assert.equal(eventsAtStep(score,7).length,0);
 assert.deepEqual(eventsAtStep(score,8).map(e=>e.instrument.id),[melody.id]);
 assert.deepEqual(eventsAtStep(score,12).map(e=>e.note.pitch),[76]);
 assert.equal(eventsAtStep(score,16).length,0,"The offset source does not retrigger at the next bar");
 assert.equal(chunkProgress(score,melody.id,melody.chunks[0].id,{bar:0,step:7}),null);
 assert.equal(chunkProgress(score,melody.id,melody.chunks[0].id,{bar:0,step:8}),0);
 assert.equal(chunkProgress(score,melody.id,melody.chunks[0].id,{bar:1,step:0}),8);
 assert.equal(chunkIsPlaying(score,melody.id,melody.chunks[0].id,{bar:1,step:0}),true);
});
test("three-beat polymeter repeats on 12-step onsets across 4/4 barlines",()=>{
 const score=create(),inst=score.instruments[0];
 inst.chunks[0].notes=[note(60,0,12),note(64,9,2)];
 inst.placements[0]={offset:0,every:12,repeats:8};
 assert.deepEqual(validate(score),[]);
 const starts=[...phraseInstances(score,inst)].map(phrase=>phrase.start);
 assert.deepEqual(starts,[0,12,24,36,48,60,72,84]);
 for(const onset of starts)assert.ok(stepEvents(score,onset).some(e=>e.note.pitch===60));
 assert.ok(stepEvents(score,21).some(e=>e.note.pitch===64));
 assert.ok(stepEvents(score,33).some(e=>e.note.pitch===64));
 assert.equal(stepEvents(score,96).length,0);
 const parsed=parse(JSON.stringify(score));
 assert.deepEqual(parsed.instruments[0].placements[0],inst.placements[0]);
});
test("offset and repetition overlap a later clip on the same instrument",()=>{
 const score=create(),inst=score.instruments[0],first=inst.chunks[0];
 first.notes=[note(60,0,16)];
 const second=makeChunk("Second phrase");
 second.notes=[note(67,0,8)];inst.chunks.push(second);
 inst.timeline[1]=second.id;
 inst.placements[0]={offset:8,every:12,repeats:3};
 inst.placements[1]={offset:4,every:16,repeats:1};
 assert.deepEqual(validate(score),[]);
 assert.deepEqual(stepEvents(score,20).map(e=>e.note.pitch).sort(),[60,67]);
 assert.deepEqual(stepEvents(score,32).map(e=>e.note.pitch),[60]);
 assert.equal(stepEvents(score,8)[0].sourceBar,0);
 assert.equal(stepEvents(score,20)[1].sourceBar,1);
});
test("invalid timing, unassigned placements, and length mismatches are rejected",()=>{
 for(const alter of [
  doc=>{doc.instruments[0].placements[0]={offset:16,every:12,repeats:3};},
  doc=>{doc.instruments[0].placements[0]={offset:8,every:0,repeats:3};},
  doc=>{doc.instruments[0].placements[0]={offset:8,every:12,repeats:99};},
  doc=>{doc.instruments[0].placements[0]={offset:8.5,every:12,repeats:3};},
  doc=>{doc.instruments[0].placements[1]={offset:0,every:12,repeats:4};},
  doc=>{doc.instruments[0].placements.pop();}
 ]){
  const doc=create();alter(doc);
  assert.ok(validate(doc).length>0);
  assert.throws(()=>parse(JSON.stringify(doc)),/placement|offset|repeat/i);
 }
});
test("repetition is bounded by the song, and a missing clip never repeats",()=>{
 const score=create(),inst=score.instruments[0];
 inst.chunks[0].notes=[note(60,0)];
 inst.placements[0]={offset:15,every:1,repeats:16};
 assert.equal([...phraseInstances(score,inst)].length,16);
 assert.equal(stepEvents(score,15).length,1);
 assert.equal(stepEvents(score,30).length,1);
 inst.timeline[0]=null;inst.placements[0]=null;
 assert.equal([...phraseInstances(score,inst)].length,0);
});
