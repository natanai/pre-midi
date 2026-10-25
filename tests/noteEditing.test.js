import test from "node:test";
import assert from "node:assert/strict";
import { create, id, clone, validate } from "../schema.js";
import { resizeNote, noteDurationLimit } from "../noteEditing.js";
import { stepEvents } from "../audio.js";
const withNotes=()=>{
 const score=create(),chunk=score.instruments[0].chunks[0];
 chunk.notes=[60,64,67,72].map((pitch,i)=>({id:id(),pitch,start:i*4,duration:3,velocity:.8}));
 return score;
};


test("the right edge grows and shrinks an existing canonical note", () => {
 const score=withNotes(),inst=score.instruments[0],chunk=inst.chunks[0],first=chunk.notes[0];
 const original=first.duration;
 assert.equal(resizeNote(chunk, first.id,8),8);
 // Different pitches can overlap. Only the next note on this same pitch bounds the length.
 chunk.notes.push({id:id(),pitch:first.pitch,start:10,duration:2,velocity:0.7});
 assert.equal(resizeNote(chunk, first.id,16),10);
 assert.equal(first.duration,10);
 assert.equal(resizeNote(chunk, first.id,1),1);
 assert.equal(resizeNote(chunk, first.id,original),original);
 assert.deepEqual(validate(score),[]);
});
test("note length clamps to the one-bar grid and stays at least one step", () => {
 const score=withNotes(),chunk=score.instruments[0].chunks[0],last=chunk.notes[3];
 assert.equal(noteDurationLimit(chunk,last),4);
 assert.equal(resizeNote(chunk,last.id,100),4);
 assert.equal(resizeNote(chunk,last.id,-100),1);
 assert.equal(resizeNote(chunk,"not-here",10),null);
 assert.deepEqual(validate(score),[]);
});
test("changing a chunk note changes every placed occurrence and survives native export", () => {
 const score=withNotes(),inst=score.instruments[0],chunk=inst.chunks[0];
 inst.timeline[4]=chunk.id;
 resizeNote(chunk,chunk.notes[0].id,4);
 assert.equal(stepEvents(score,0)[0].note.duration,4);
 assert.equal(stepEvents(score,64)[0].note.duration,4);
 assert.equal(clone(score).instruments[0].chunks[0].notes[0].duration,4);
 assert.deepEqual(validate(score),[]);
});
test("resizing an instrument's chunk doesn't affect another instrument", () => {
 const score=withNotes();
 const other=clone(score.instruments[0]);
 other.id=id();
 other.name="Other";
 other.chunks[0].id=id();
 other.chunks[0].notes.forEach(n=>n.id=id());
 other.timeline=other.timeline.map(x=>x===null?null:other.chunks[0].id);
 score.instruments.push(other);
 const baseline=other.chunks[0].notes[3].duration;
 resizeNote(score.instruments[0].chunks[0],score.instruments[0].chunks[0].notes[3].id,4);
 assert.equal(other.chunks[0].notes[3].duration,baseline);
 assert.deepEqual(validate(score),[]);
});
