import test from "node:test";
import assert from "node:assert/strict";
import { create, id, clone, validate } from "../schema.js";
import { resizeNote, noteDurationLimit, moveNote } from "../noteEditing.js";
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

test("moving a held note changes its start and pitch without losing expression", () => {
 const score=withNotes(),chunk=score.instruments[0].chunks[0],note=chunk.notes[0];
 note.bend={shape:"rise",amount:2,rate:4};
 const originalId=note.id,originalDuration=note.duration,originalVelocity=note.velocity;
 assert.equal(moveNote(chunk,note.id,7,72,{minPitch:36,maxPitch:83}),true);
 assert.equal(note.start,7);
 assert.equal(note.pitch,72);
 assert.equal(note.id,originalId);
 assert.equal(note.duration,originalDuration);
 assert.equal(note.velocity,originalVelocity);
 assert.equal(note.bend.shape,"rise");
 assert.deepEqual(validate(score),[]);
});
test("moving notes clamps to the displayed grid and never overlaps same-pitch notes", () => {
 const score=withNotes(),chunk=score.instruments[0].chunks[0],first=chunk.notes[0];
 assert.equal(moveNote(chunk,first.id,100,200,{minPitch:36,maxPitch:83}),true);
 assert.equal(first.start,13);
 assert.equal(first.pitch,83);
 assert.equal(moveNote(chunk,first.id,-9,-10,{minPitch:36,maxPitch:83}),true);
 assert.equal(first.start,0);
 assert.equal(first.pitch,36);
 chunk.notes.push({id:id(),pitch:64,start:8,duration:5,velocity:.75});
 const original=[first.start,first.pitch];
 assert.equal(moveNote(chunk,first.id,7,64,{minPitch:36,maxPitch:83}),false);
 assert.deepEqual([first.start,first.pitch],original);
 assert.equal(moveNote(chunk,"unknown",1,60),null);
 assert.equal(moveNote(chunk,first.id,Number.NaN,60),false);
 assert.deepEqual(validate(score),[]);
});
test("a newly placed note can be lengthened before its first saved commit", () => {
 const score=withNotes(),chunk=score.instruments[0].chunks[0];
 const note={id:id(),pitch:60,start:5,duration:1,velocity:.8};
 chunk.notes.push(note);
 assert.equal(resizeNote(chunk,note.id,4),4);
 assert.equal(note.start,5);
 assert.equal(note.duration,4);
 assert.equal(resizeNote(chunk,note.id,200),11);
 assert.deepEqual(validate(score),[]);
});
test("piano-roll pointer handler keeps simple clicks and commits drags only once",async () => {
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 assert.match(source,/setTimeout\(\(\)=>\{\s*if\(finished\)return;\s*grabbed=true/);
 assert.match(source,/applyNoteCommand\(chunk,\{type:"note.move"/);
 assert.match(source,/mode==="paint"[\s\S]*?applyNoteCommand\(chunk,\{type:"note.add",note\}\)/);
 assert.match(source,/if\(changed\)\{\s*ignoreClick=true;[\s\S]*?setTimeout\(\(\)=>commitChange\(before\),0\)/);
 assert.match(source,/if\s*\(ignoreClick\)\s*return;/);
});
