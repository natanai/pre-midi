import test from "node:test";
import assert from "node:assert/strict";
import { create, makeInstrument, makeChunk, id, validate, parse, clone } from "../schema.js";
import { stepEvents } from "../audio.js";
import { PRESETS, getPreset, makePatch, validatePatch } from "../synth.js";

test("v7 scores contain fully editable native instrument patches", () => {
 const score=create();
 assert.equal(score.version,7);
 assert.deepEqual(validate(score),[]);
 assert.deepEqual(parse(JSON.stringify(score)),score);
 const patch=score.instruments[0].sounds[0].patch;
 assert.ok(patch.oscillators.length===2);
 assert.ok(patch.filter.cutoff>0);
 assert.ok(patch.envelope.release>0);
});
test("library holds diverse original sample-free recipes with no shared editable state",()=>{
 assert.ok(PRESETS.length>=15);
 assert.equal(new Set(PRESETS.map(p=>p.id)).size,PRESETS.length);
 for(const preset of PRESETS)assert.deepEqual(validatePatch(makePatch(preset.id)),[],preset.name);
 const a=makePatch("neon-lead"),b=makePatch("neon-lead");
 a.oscillators[0].level=0;
 assert.notEqual(a.oscillators[0].level,b.oscillators[0].level);
 assert.notDeepEqual(getPreset("static-snare").patch,getPreset("glass-keys").patch);
});
test("shared instrument patch affects all of its chunk uses",()=>{
 const score=create(),inst=score.instruments[0],chunk=inst.chunks[0];
 inst.timeline=Array(score.bars).fill(chunk.id);
 chunk.notes.push({id:id(),pitch:60,start:0,duration:4,velocity:.8});
 inst.sounds[0].patch=makePatch("acid-line");
 assert.equal(stepEvents(score,0)[0].instrument,inst);
 assert.equal(stepEvents(score,16)[0].instrument,inst);
 assert.equal(stepEvents(score,16)[0].instrument.sounds[0].patch.filter.cutoff,1450);
 assert.deepEqual(validate(score),[]);
});
test("invalid synthesis parameters and unknown timeline chunks are rejected",()=>{
 const score=create();score.instruments[0].sounds[0].patch.filter.cutoff=-100;
 assert.ok(validate(score).some(e=>e.includes("filter")));
 const another=create();another.instruments[0].timeline[0]="deleted";
 assert.ok(validate(another).some(e=>e.includes("timeline")));
});
test("reusable chunks and note editing still work independently of sound patches",()=>{
 const score=create(),inst=score.instruments[0];
 const chunk=makeChunk("Verse");
 chunk.notes.push({id:id(),pitch:71,start:0,duration:4,velocity:.8});
 inst.chunks.push(chunk);inst.timeline[1]=chunk.id;
 inst.chunks[0].notes.push({id:id(),pitch:60,start:0,duration:3,velocity:.8});
 assert.equal(stepEvents(score,16)[0].note.pitch,71);
 assert.equal(stepEvents(score,0)[0].note.pitch,60);
 const other=makeInstrument(2,score.bars);other.sounds[0].patch=makePatch("pulse-kick");
 score.instruments.push(other);
 assert.deepEqual(validate(score),[]);
});
test("older exported schemas aren't silently interpreted as new synth definitions",()=>{
 const previous=clone(create());previous.version=3;
 assert.throws(()=>parse(JSON.stringify(previous)),/v7/);
});

test("fresh compositions have no arranged demo notes or looping opening",()=>{
 const score=create();
 assert.equal(score.instruments[0].chunks[0].notes.length,0);
 assert.equal(score.instruments[0].timeline.filter(Boolean).length,1);
 assert.equal(stepEvents(score,0).length,0);
 assert.deepEqual(validate(score),[]);
});
