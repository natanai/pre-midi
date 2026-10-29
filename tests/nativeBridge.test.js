import test from "node:test";
import assert from "node:assert/strict";
import {makePatch} from "../synth.js";
import {prepareNativePlan} from "../native/bridge.mjs";
import {planSynthVoice} from "../src/dsp/synth-voice.js";
import {cleanPatch} from "./audio-quality/fixtures.js";
const plan=patch=>planSynthVoice({patch,volume:1},{pitch:69,velocity:.8},0,.2);
test("native control adapter encodes the canonical plan with explicit bounded transport",()=>{
 const packet=prepareNativePlan(plan(cleanPatch()),48000,24000);
 assert.equal(packet.readUInt32LE(0),0x344e4d50);assert.equal(packet.readUInt32LE(4),48000);assert.equal(packet.readUInt32LE(8),24000);
 assert.throws(()=>prepareNativePlan(plan(cleanPatch()),48000,Infinity));
});
test("native synth adapter accepts drive and legacy movement while retaining validation",()=>{
 for(const mutate of [p=>p.effects.drive=.1,p=>p.movement.depth=4,p=>p.movement.tone=.4,p=>p.movement.tremolo=.5]){
  const patch=cleanPatch();mutate(patch);assert.equal(prepareNativePlan(plan(patch),48000,24000).readUInt32LE(12),7);
 }
 const invalid=cleanPatch();invalid.effects.drive=2;assert.throws(()=>prepareNativePlan(plan(invalid),48000,24000),/Invalid effects/);
 assert.throws(()=>prepareNativePlan({...plan(cleanPatch()),version:99},48000,24000),/contract v1/);
});

test("native filter sweep uses a versioned packet with explicit start and end",()=>{
 const patch=cleanPatch();patch.filter.cutoff=800;patch.filter.sweep=2;patch.filter.sweepTime=.15;
 const bytes=prepareNativePlan(plan(patch),48000,24000);
 assert.equal(bytes.readUInt32LE(12),4);
 assert.ok(Math.abs(bytes.readDoubleLE(76)-3200)<.001);
 assert.ok(Math.abs(bytes.readDoubleLE(84)-.15)<.001);
});
test("all existing waveform and filter identifiers reach the native profile",()=>{
 for(const wave of ["sine","triangle","square","sawtooth","harmonic"])for(const type of ["lowpass","highpass","bandpass","notch"]){
  const patch=cleanPatch(wave);patch.filter.type=type;assert.ok(prepareNativePlan(plan(patch),48000,24000).length>0);
 }
});

test("native v2 accepts the musical modulation presets and rejects malformed routes",()=>{
 for(const name of ["evolving-glass","breath-lead","touch-keys"]){const p=plan(makePatch(name));assert.equal(p.version,2);assert.ok(prepareNativePlan(p,48000,24000).length>0);p.modulation.routes[0].unit="unknown";assert.throws(()=>prepareNativePlan(p,48000,24000),/Invalid modulation/);}
});

test("native noise voice uses version 5 with deterministic noise level and decay",()=>{
 const patch=cleanPatch();patch.noise=.65;patch.noiseDecay=.2;
 const packet=prepareNativePlan(plan(patch),48000,24000);
 assert.equal(packet.readUInt32LE(12),5);
 assert.equal(packet.readDoubleLE(92),.65);
 assert.equal(packet.readDoubleLE(100),.2);
 const quiet=cleanPatch();quiet.noise=0;
 assert.notEqual(prepareNativePlan(plan(quiet),48000,24000).readUInt32LE(12),5);
});

test("native delay uses v6 and carries all authored effect parameters",()=>{
 const patch=cleanPatch();patch.effects={drive:0,delayMix:.4,delayTime:.281,delayFeedback:.6};
 const bytes=prepareNativePlan(plan(patch),48000,24000);
 assert.equal(bytes.readUInt32LE(12),6);
 assert.equal(bytes.readDoubleLE(108),.4);assert.equal(bytes.readDoubleLE(116),Math.fround(.281));assert.equal(bytes.readDoubleLE(124),Math.fround(.6));
});

// The extension selects its own wire version; project/voice model versions stay
// intact, and short ordinary voices retain their previous encoding.
test("extended synth execution uses v9 for long notes and high pitch",()=>{
 const patch=cleanPatch();const before=structuredClone(patch);
 const held=planSynthVoice({patch,volume:.2},{pitch:60,velocity:.8},0,40);
 assert.equal(prepareNativePlan(held,48000,24000).readUInt32LE(12),9);
 const high=planSynthVoice({patch,volume:.2},{pitch:127,velocity:.8},0,.2);
 assert.equal(prepareNativePlan(high,8000,4000).readUInt32LE(12),9);
 assert.deepEqual(patch,before);assert.equal(held.version,1);
});
