import test from "node:test";
import assert from "node:assert/strict";
import { create, makeInstrument, makeChunk, id, validate, parse, clone } from "../schema.js";
import { stepEvents } from "../audio.js";

test("v2 file exports and imports every instrument, chunk, timeline slot and note", () => {
 const score = create();
 assert.equal(score.version, 2);
 assert.deepEqual(validate(score), []);
 assert.deepEqual(parse(JSON.stringify(score)), score);
});
test("instrument-wide synthesis and reused chunks remain one resource", () => {
 const score = create(), inst = score.instruments[0], chunk = inst.chunks[0];
 inst.timeline = Array(score.bars).fill(chunk.id);
 inst.waveform = "square";
 const events = stepEvents(score, 0);
 const later = stepEvents(score, 16);
 assert.equal(events[0].instrument, inst);
 assert.equal(later[0].instrument, inst);
 assert.equal(later[0].note.id, events[0].note.id);
 assert.equal(later[0].instrument.waveform, "square");
});
test("timeline slots directly change which chunk the engine plays", () => {
 const score = create(), inst = score.instruments[0];
 const alternate = makeChunk("Verse");
 alternate.notes.push({id:id(),pitch:71,start:0,duration:4,velocity:0.9});
 inst.chunks.push(alternate);
 inst.timeline[1] = alternate.id;
 assert.equal(stepEvents(score,16)[0].note.pitch,71);
 inst.timeline[1] = null;
 assert.equal(stepEvents(score,16).length,0);
 inst.timeline[1] = inst.chunks[0].id;
 assert.equal(stepEvents(score,16)[0].note.pitch,60);
 assert.deepEqual(validate(score),[]);
});
test("v1 is intentionally retired; no compatibility layers", () => {
 const score = create();
 const old = clone(score);
 old.version = 1;
 assert.throws(() => parse(JSON.stringify(old)), /v2/);
 old.version = 2;old.tracks=old.instruments;delete old.instruments;
 assert.ok(validate(old).length);
});
test("validator rejects unknown timeline chunk references and oversized notes", () => {
 const score = create();
 score.instruments[0].timeline[0] = "deleted-chunk";
 assert.ok(validate(score).some(e=>e.includes("timeline")));
 const another = create();
 another.instruments[0].chunks[0].notes[0].duration = 40;
 assert.ok(validate(another).some(e=>e.includes("chunk note")));
});
test("instrument creation uses its own chunk library", () => {
 const score=create(), second=makeInstrument(2, score.bars);
 score.instruments.push(second);
 assert.notEqual(second.chunks[0].id,score.instruments[0].chunks[0].id);
 assert.deepEqual(validate(score),[]);
});
