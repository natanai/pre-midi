import test from "node:test";
import assert from "node:assert/strict";
import {create} from "../schema.js";
import {createSong,addVocalTake,validateSong} from "../songModel.js";
import {makeRecordingAsset,inspectRecordingBytes} from "../recordingAssets.js";
import {getAsset,putAsset,clearAssets} from "../assetRegistry.js";
import {exportSongProject,importSongProject} from "../songIO.js";
import {readZip} from "../zip.js";
import {recordingEventsAtStep} from "../songAudio.js";
import {waveformPeaks} from "../songRecorder.js";
const webmBytes=(size=320)=>{
 const bytes=new Uint8Array(size);bytes.set([0x1a,0x45,0xdf,0xa3,0x9f,0x42,0x86,0x81]);
 return bytes;
};
test("long vocal assets do not inherit the 1 MB Beat sample limit",()=>{
 const long=webmBytes(1_100_000);
 assert.throws(()=>putAsset("sample-too-large",long),/1 MB/);
 const recording=makeRecordingAsset("voice-test","Voice 1","audio/webm;codecs=opus",long,
  {durationSeconds:12.5,trimSeconds:.07});
 assert.equal(recording.path,"assets/voice-test.webm");
 assert.deepEqual(getAsset(recording.id),long);
});
test("vocal clips are separate recording references above Beat Tracks",()=>{
 const song=createSong(create());
 const bytes=webmBytes();
 const recording=makeRecordingAsset("voice-layer","Voice 1","audio/webm",bytes,
  {durationSeconds:4.5,trimSeconds:.07});
 const {track,clip}=addVocalTake(song,recording);
 assert.equal(song.tracks[0],track);
 assert.equal(song.tracks[1].kind,"beat");
 assert.equal(clip.recordingId,recording.id);
 assert.equal(recordingEventsAtStep(song,0).length,1);
 assert.equal(recordingEventsAtStep(song,1).length,0);
 assert.ok(clip.lengthSteps>1);
 assert.deepEqual(validateSong(song),[]);
 clip.gain=1.45;
 assert.deepEqual(validateSong(song),[]);
 clip.recordingId="missing";
 assert.match(validateSong(song).join(" "),/missing Recording/);
});
test("Song ZIP preserves long-form vocals alongside native Beat instructions",async()=>{
 const song=createSong(create()),bytes=webmBytes(1_050_000);
 const rec=makeRecordingAsset("voice-zip","Voice take","audio/webm",bytes,
  {durationSeconds:18.2,trimSeconds:.09});
 addVocalTake(song,rec);
 const before=structuredClone(song);
 const output=exportSongProject(song);
 assert.match(output.name,/\.zip$/);
 const entries=await readZip(output.blob);
 assert.equal(entries.size,2);
 assert.deepEqual(entries.get(rec.path),bytes);
 clearAssets();
 const imported=await importSongProject({name:output.name,size:output.blob.size,
  arrayBuffer:()=>output.blob.arrayBuffer()});
 assert.deepEqual(imported,before);
 assert.deepEqual(getAsset(rec.id),bytes);
});
test("recorded waveform peaks are bounded, native metadata is validated",()=>{
 const samples=new Float32Array(900).fill(.5);
 samples[70]=1;
 const peaks=waveformPeaks({numberOfChannels:1,length:samples.length,getChannelData:()=>samples},24);
 assert.equal(peaks.length,24);
 assert.ok(Math.max(...peaks)===1);
 const bytes=webmBytes();
 assert.throws(()=>inspectRecordingBytes(bytes,"audio/mp4"),/not MP4/);
 const song=createSong(create());
 const rec=makeRecordingAsset("voice-invalid","Voice","audio/webm",bytes,
  {durationSeconds:3,trimSeconds:.1});
 rec.waveform=peaks;
 addVocalTake(song,rec);
 assert.deepEqual(validateSong(song),[]);
 song.recordings[0].waveform=[-2];
 assert.match(validateSong(song).join(" "),/waveform/);
});
