import test from "node:test";
import assert from "node:assert/strict";
import {create,parse,validate} from "../schema.js";
import {makeSampleAsset,base64ToBytes} from "../sampler.js";
import {exportPackage,importPackage,crc32} from "../packageIO.js";
import {RECORDER_DURATIONS,RECORDING_RATE,pitchLabel,estimatePitch,encodeMonoWav,describeRecording} from "../recording.js";
const wave=(hz,seconds=.9)=>Float32Array.from({length:Math.round(RECORDING_RATE*seconds)},(_,i)=>
 .55*Math.sin(2*Math.PI*hz*i/RECORDING_RATE));
test("short recording options and note labels",()=>{
 assert.deepEqual(RECORDER_DURATIONS,[.75,1.5,3,4]);
 assert.equal(pitchLabel(60),"C4");
 assert.equal(pitchLabel(69),"A4");
});
test("single sustained tones suggest pitches, while silence does not",()=>{
 for(const hz of [196,261.6256,440]){
  const detected=estimatePitch(wave(hz),RECORDING_RATE);
  assert.ok(detected,"No pitch estimate at "+hz);
  assert.ok(Math.abs(detected.hz-hz)<hz*.055);
 }
 assert.equal(estimatePitch(new Float32Array(RECORDING_RATE),RECORDING_RATE),null);
});
test("standard recorded WAV round-trips as a separate asset alongside music data",async()=>{
 const wav=encodeMonoWav(wave(440,.75));
 const header=new DataView(wav.buffer);
 assert.equal(header.getUint16(22,true),1);
 assert.equal(header.getUint32(24,true),RECORDING_RATE);
 assert.equal(header.getUint16(34,true),16);
 const score=create(),instrument=score.instruments[0];
 const sample=makeSampleAsset("recorded-c4","Guitar C4","audio/wav",wav,"Recorded by author");
 score.samples=[sample];
 instrument.patch={type:"sample",presetId:"custom",zones:[{assetId:sample.id,root:60}],
 followPitch:true,transpose:0,gain:1,attack:.005,release:.3,pan:0};
 assert.deepEqual(validate(score),[]);
 const pkg=exportPackage(score);
 assert.match(pkg.name,/\.zip$/);
 assert.equal(pkg.manifest.samples[0].data,undefined);
 assert.equal(pkg.manifest.samples[0].mime,"audio/wav");
 assert.match(pkg.manifest.samples[0].path,/^assets\/.*\.wav$/);
 const restored=importPackage(new Uint8Array(await pkg.blob.arrayBuffer()));
 assert.deepEqual(base64ToBytes(restored.samples[0].data),wav);
 assert.deepEqual(restored.instruments[0].patch,instrument.patch);
 assert.deepEqual(validate(restored),[]);
});
test("plain synthesizer song exports a readable single .premidi",async()=>{
 const score=create();score.title="Plain synth";
 const pkg=exportPackage(score);
 assert.equal(pkg.name,"Plain-synth.premidi");
 assert.deepEqual(parse(await pkg.blob.text()).samples,[]);
});
test("ZIP CRC matches standard",()=>assert.equal(crc32(new TextEncoder().encode("123456789")),0xcbf43926));
