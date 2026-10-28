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
test("native prototype rejects unsupported features instead of silently changing the sound",()=>{
 for(const mutate of [p=>p.noise=.1,p=>p.effects.drive=.1,p=>p.effects.delayMix=.1,p=>p.movement.depth=4]){
  const patch=cleanPatch();mutate(patch);assert.throws(()=>prepareNativePlan(plan(patch),48000,24000),/Unsupported native profile/);
 }
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
