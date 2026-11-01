import test from "node:test";
import assert from "node:assert/strict";
import {assignSoundEdit} from "../soundEditPath.js";
import {DEFAULT_SAMPLE_FILTER,validateSampleTone} from "../audioEffects.js";
import {makePatch} from "../synth.js";

test("sampled sound without a filter gains the complete valid filter on direct illustration drag",()=>{
 const sample={type:"sample",drive:0};
 assignSoundEdit(sample,[["filter","cutoff"],["filter","resonance"]],[2400,3]);
 assert.deepEqual(sample.filter,{...DEFAULT_SAMPLE_FILTER,cutoff:2400,resonance:3});
 assert.equal(validateSampleTone(sample),null);
});

test("one-axis filter edit keeps the default sample filter type and resonance",()=>{
 const sample={type:"sample"};
 assignSoundEdit(sample,["filter","cutoff"],6000);
 assert.deepEqual(sample.filter,{...DEFAULT_SAMPLE_FILTER,cutoff:6000});
 assert.equal(validateSampleTone(sample),null);
});

test("existing sample and synth filters remain intact with multi-axis edits",()=>{
 const sample={type:"sample",filter:{type:"bandpass",cutoff:3000,resonance:2}};
 assignSoundEdit(sample,[["filter","cutoff"],["filter","resonance"]],[1200,4]);
 assert.equal(sample.filter.type,"bandpass");
 assert.equal(validateSampleTone(sample),null);
 const synth=makePatch("init");
 assignSoundEdit(synth,[["filter","cutoff"],["filter","resonance"]],[800,9]);
 assert.equal(synth.filter.type,"lowpass");
 assert.equal(synth.filter.sweepTime,.2);
 assert.equal(synth.filter.cutoff,800);
 assert.equal(synth.filter.resonance,9);
});

test("preview patch copy can be edited without mutating original",()=>{
 const current={type:"sample",gain:.8};
 const next=structuredClone(current);
 assignSoundEdit(next,["filter","cutoff"],2200);
 assert.equal(current.filter,undefined);
 assert.equal(next.filter.cutoff,2200);
});
