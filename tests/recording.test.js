import test from "node:test";
import assert from "node:assert/strict";
import {create,parse,validate} from "../schema.js";
import {makeSampleAsset} from "../sampler.js";
import {exportProject,importProject} from "../packageIO.js";
import {readZip} from "../zip.js";
import {getAsset,clearAssets} from "../assetRegistry.js";
import {RECORDER_DURATIONS,RECORDING_RATE,pitchLabel,estimatePitch,encodeMonoWav,describeRecording} from "../recording.js";
const wave=(hz,seconds=.9)=>Float32Array.from({length:Math.round(RECORDING_RATE*seconds)},(_,i)=>
 .55*Math.sin(2*Math.PI*hz*i/RECORDING_RATE));
test("guided recording options and pitches",()=>{
 assert.deepEqual(RECORDER_DURATIONS,[.75,1.5,3,4]);
 assert.equal(pitchLabel(60),"C4");
 assert.equal(pitchLabel(69),"A4");
});
test("a steady note receives a suggested pitch, but silence never does",()=>{
 for(const hz of [196,261.6256,440]){
  const found=estimatePitch(wave(hz),RECORDING_RATE);
  assert.ok(found,"No pitch estimate at "+hz);
  assert.ok(Math.abs(found.hz-hz)<hz*.06,JSON.stringify(found));
 }
 assert.equal(estimatePitch(new Float32Array(RECORDING_RATE),RECORDING_RATE),null);
});
test("WAV is raw mono PCM and separate from the .premidi file in the ZIP",async()=>{
 const wav=encodeMonoWav(wave(440,.75));
 const head=new DataView(wav.buffer);
 assert.equal(head.getUint16(22,true),1);
 assert.equal(head.getUint32(24,true),RECORDING_RATE);
 assert.equal(head.getUint16(34,true),16);
 assert.equal(describeRecording(wave(440)).quiet,false);
 const score=create(),inst=score.instruments[0];
 const asset=makeSampleAsset("recorded-a4","Guitar A4","audio/wav",wav,"Recorded by author");
 score.samples=[asset];
 inst.patch={type:"sample",presetId:"custom",zones:[{assetId:asset.id,root:69}],
  followPitch:true,transpose:0,gain:1,attack:.005,release:.3,pan:0};
 assert.deepEqual(validate(score),[]);
 const result=exportProject(score);
 assert.match(result.name,/\.zip$/);
 const zip=await readZip(result.blob);
 const manifest=parse(new TextDecoder().decode(zip.get("Guitar-A4.premidi")||zip.get("Untitled-composition.premidi")));
 assert.equal(manifest.samples[0].data,undefined);
 assert.equal(manifest.samples[0].path,"assets/recorded-a4.wav");
 assert.deepEqual(zip.get(manifest.samples[0].path),wav);
 clearAssets();
 const restored=await importProject({name:result.name,size:result.blob.size,arrayBuffer:()=>result.blob.arrayBuffer()});
 assert.deepEqual(restored,score);
 assert.deepEqual(getAsset("recorded-a4"),wav);
});
test("synth-only compositions export a single readable plain .premidi",async()=>{
 const score=create();score.title="Plain synth";
 const output=exportProject(score);
 assert.equal(output.name,"Plain-synth.premidi");
 assert.deepEqual(parse(await output.blob.text()).samples,[]);
});
test("invalid or corrupted packages cannot silently substitute recordings",async()=>{
 const wav=encodeMonoWav(wave(330,.75));
 const score=create(),asset=makeSampleAsset("note-test","Tone","audio/wav",wav,"author");
 score.samples=[asset];
 score.instruments[0].patch={type:"sample",presetId:"custom",zones:[{assetId:asset.id,root:64}],
  followPitch:true,transpose:0,gain:1,attack:.01,release:.1,pan:0};
 const packed=exportProject(score);
 const bytes=new Uint8Array(await packed.blob.arrayBuffer());
 bytes[bytes.length-40]^=0xff;
 await assert.rejects(readZip(new Blob([bytes])));
});
