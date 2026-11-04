import test from "node:test";
import assert from "node:assert/strict";
import { create, makeInstrument, makeChunk, id, validate, parse, clone, resizeBeatBars, EXTENDED_BEAT_VERSION, SUSTAIN_BEAT_VERSION, CAPTURED_AUTOMATION_BEAT_VERSION, upgradeBeatFeatures } from "../schema.js";
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

test("Beat lengths include every integer through 64 with an explicit format version",()=>{
 for(const bars of [1,3,5,7,15,16,17,31,64]){
  const beat=create();resizeBeatBars(beat,bars);
  assert.equal(beat.bars,bars);
  assert.equal(beat.instruments[0].timeline.length,bars);
  assert.equal(beat.instruments[0].placements.length,bars);
  assert.equal(beat.version,bars>16?EXTENDED_BEAT_VERSION:7);
  assert.deepEqual(validate(beat),[]);
  assert.deepEqual(parse(JSON.stringify(beat)),beat);
 }
 const invalid=create();invalid.bars=65;assert.match(validate(invalid).join(" "),/1–64 bars/);
 const wronglyVersioned=create();wronglyVersioned.bars=17;
 assert.match(validate(wronglyVersioned).join(" "),/v17/);
});
test("shortening a Beat does not silently discard placed Chunks",()=>{
 const beat=create(),inst=beat.instruments[0],chunk=inst.chunks[0];
 resizeBeatBars(beat,64);inst.timeline[63]=chunk.id;
 const before=clone(beat);
 assert.throws(()=>resizeBeatBars(beat,7),/Move or remove placed Chunks/);
 assert.deepEqual(beat,before);
 inst.timeline[63]=null;
 resizeBeatBars(beat,7);
 assert.equal(beat.bars,7);
 assert.deepEqual(validate(beat),[]);
});

test("a sustained Chunk note requires v25 and round-trips without retriggering",()=>{
 const beat=create(),chunk=beat.instruments[0].chunks[0];
 chunk.notes.push({id:id(),pitch:60,start:14,duration:40,velocity:.9});
 assert.match(validate(beat).join(" "),/Beat v25/,"Legacy Beat v7 must reject unknown sustain semantics.");
 upgradeBeatFeatures(beat);
 assert.equal(beat.version,SUSTAIN_BEAT_VERSION);
 assert.deepEqual(validate(beat),[]);
 assert.deepEqual(parse(JSON.stringify(beat)),beat);
 assert.equal(stepEvents(beat,14).length,1);
 assert.equal(stepEvents(beat,16).length,0);
 const invalid=clone(beat);invalid.instruments[0].chunks[0].notes[0].duration=1025;
 assert.match(validate(invalid).join(" "),/Invalid chunk note/);
});

test("captured cutoff movement uses v27 and rejects invalid curves and unsupported layouts",()=>{
 const beat=create(),chunk=beat.instruments[0].chunks[0];
 chunk.notes=[{id:id(),pitch:60,start:12,duration:25,velocity:.8,
  cutoffAutomation:{version:1,step:4,limitStep:128,block:{version:1,
   target:"filter.cutoff",unit:"hz",interpolation:"exponential",points:[
    {id:"lo",step:0,value:450},{id:"hi",step:128,value:5200}
   ]}}}];
 assert.match(validate(beat).join(" "),/Beat v27/);
 upgradeBeatFeatures(beat);
 assert.equal(beat.version,CAPTURED_AUTOMATION_BEAT_VERSION);
 assert.deepEqual(validate(beat),[]);
 assert.deepEqual(parse(JSON.stringify(beat)),beat);
 const broken=clone(beat);broken.instruments[0].chunks[0].notes[0].cutoffAutomation.step=-1;
 assert.match(validate(broken).join(" "),/Invalid captured note cutoff movement/);
 const wrongLayout=clone(beat);wrongLayout.instruments[0].sounds[0].patch.type="sample";
 assert.match(validate(wrongLayout).join(" "),/pitched synthesizer/);
 const downgraded=clone(beat);downgraded.version=SUSTAIN_BEAT_VERSION;
 assert.match(validate(downgraded).join(" "),/Beat v27/);
});
