import test from "node:test";
import assert from "node:assert/strict";
import {create} from "../schema.js";
import {createSong,addSongTrack,addVocalTake,duplicateVocalClip,trimVocalClip,moveVocalClip,removeSongClip,removeEmptyVocalTrack,validateSong,upgradeSongFeatures,VOCAL_FX_SONG_VERSION} from "../songModel.js";
import {makeRecordingAsset,inspectRecordingBytes} from "../recordingAssets.js";
import {getAsset,putAsset,clearAssets} from "../assetRegistry.js";
import {exportSongProject,importSongProject} from "../songIO.js";
import {readZip} from "../zip.js";
import {recordingEventsAtStep} from "../songAudio.js";
import {waveformPeaks,suggestVocalOnset} from "../songRecorder.js";
import {vocalEffects,vocalSourceRange} from "../vocalEffects.js";
import {planNativeVocal,encodeNativeSample} from "../src/hosts/native/sample-plan.js";
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

test("a vocal take can move without changing its duration, timing data or asset",()=>{
 const song=createSong(create()),recording=makeRecordingAsset("voice-move","Voice move","audio/webm",webmBytes(),
  {durationSeconds:3.5,trimSeconds:.1});
 const {clip}=addVocalTake(song,recording);
 const length=clip.lengthSteps;
 clip.startStep=32;
 assert.equal(clip.lengthSteps,length);
 assert.equal(recordingEventsAtStep(song,0).length,0);
 assert.equal(recordingEventsAtStep(song,32)[0].clip,clip);
 assert.deepEqual(validateSong(song),[]);
});
test("removing a vocal clip also removes its empty track and unreferenced recording",()=>{
 const song=createSong(create());
 const first=makeRecordingAsset("voice-one","First","audio/webm",webmBytes(),
  {durationSeconds:5,trimSeconds:.07});
 const second=makeRecordingAsset("voice-two","Second","audio/webm",webmBytes(),
  {durationSeconds:3,trimSeconds:.07});
 const one=addVocalTake(song,first,{startStep:16});
 const two=addVocalTake(song,second,{startStep:48});
 assert.equal(one.track,two.track,"Repeated takes share the existing voice track");
 const beatTrack=song.tracks.find(track=>track.kind==="beat");
 assert.equal(removeSongClip(song,one.clip.id),one.clip);
 assert.ok(song.tracks.includes(one.track),"Keep the track until its last take is removed");
 assert.ok(song.tracks.includes(beatTrack));
 assert.deepEqual(song.recordings.map(recording=>recording.id),[second.id]);
 assert.deepEqual(validateSong(song),[]);
 removeSongClip(song,two.clip.id);
 assert.deepEqual(song.tracks,[beatTrack]);
 assert.deepEqual(song.recordings,[]);
 assert.deepEqual(validateSong(song),[]);
 assert.deepEqual(getAsset(first.id),webmBytes(),"Keep source bytes available for undo");
 assert.throws(()=>removeSongClip(song,one.clip.id),/does not exist/);
});
test("legacy empty vocal lanes can be deleted without affecting playable tracks",()=>{
 const song=createSong(create()),empty=addSongTrack(song,"vocal");
 const orphan=makeRecordingAsset("voice-orphan","Old take","audio/webm",webmBytes(),
  {durationSeconds:2,trimSeconds:.1});
 song.recordings.push(orphan);
 assert.equal(removeEmptyVocalTrack(song,empty.id),empty);
 assert.equal(song.tracks.length,1);
 assert.equal(song.tracks[0].kind,"beat");
 assert.deepEqual(song.recordings,[]);
 assert.deepEqual(validateSong(song),[]);
 assert.throws(()=>removeEmptyVocalTrack(song,empty.id),/Only an empty vocal track/);
 const a=addSongTrack(song,"vocal"),b=addSongTrack(song,"vocal");
 removeEmptyVocalTrack(song,a.id);
 assert.equal(addSongTrack(song,"vocal").name,"Voice 3","New track names must not duplicate surviving lanes");
 assert.equal(b.name,"Voice 2");
});

test("vocal effects and trims use a versioned Clip contract without changing source bytes",async()=>{
 const song=createSong(create()),bytes=webmBytes(440),recording=makeRecordingAsset("voice-shaped","Shaped","audio/webm",bytes,
  {durationSeconds:3,trimSeconds:.08});
 const {track,clip}=addVocalTake(song,recording,{startStep:4});
 assert.equal(clip.effects,undefined);
 trimVocalClip(song,clip.id,.184);
 clip.effects={filter:{type:"lowpass",cutoff:1200,resonance:1.4},drive:.25,
  transpose:-2,pan:-.2,attack:.03,release:.08,delayMix:.2,delayTime:.23,delayFeedback:.32,
  movement:{depth:22,rate:5},bend:{shape:"straight",amount:2,rate:4}};
 upgradeSongFeatures(song);
 assert.equal(song.version,VOCAL_FX_SONG_VERSION);
 assert.equal(clip.trimStartSeconds,.184);
 assert.equal(recording.durationSeconds,3);
 assert.equal(vocalSourceRange(recording,clip,60/song.bpm/4).offset,.264);
 assert.deepEqual(validateSong(song),[]);
 const packet=encodeNativeSample(planNativeVocal({clip,recording},.25,60/song.bpm/4,
  new Map([[recording.id,{id:1,duration:3}]])),44100);
 assert.equal(new DataView(packet.buffer).getUint32(12,true),16,"Native recordings share the current processing packet");
 assert.equal(new DataView(packet.buffer).getUint32(16,true),2,"Vocal remains a native sample voice");
 const packed=exportSongProject(song);assert.match(packed.name,/zip/);
 const entries=await readZip(packed.blob);assert.deepEqual(entries.get(recording.path),bytes);
 assert.deepEqual(song.tracks[0],track);
 assert.deepEqual(validateSong(song),[]);
 clip.effects.drive=4;
 assert.match(validateSong(song).join(" "),/distortion/);
});
test("vocal Clips duplicate by reference and move between only vocal tracks",()=>{
 const song=createSong(create()),rec=makeRecordingAsset("voice-copy","Copy","audio/webm",webmBytes(),
  {durationSeconds:2,trimSeconds:.05});
 const {track,clip}=addVocalTake(song,rec);
 const copy=duplicateVocalClip(song,clip.id);
 assert.notEqual(copy.id,clip.id);assert.equal(copy.recordingId,rec.id);
 assert.equal(song.recordings.length,1);
 const other=addSongTrack(song,"vocal");
 moveVocalClip(song,copy.id,other.id);
 assert.equal(other.clips[0].id,copy.id);
 removeSongClip(song,clip.id);
 assert.ok(!song.tracks.includes(track));
 assert.deepEqual(song.recordings.map(item=>item.id),[rec.id]);
 removeSongClip(song,copy.id);
 assert.deepEqual(song.recordings,[]);
 assert.deepEqual(validateSong(song),[]);
});
test("the suggested onset is advisory and identifies short quiet lead-ins",()=>{
 const rate=48000,samples=new Float32Array(rate);
 for(let n=Math.round(.23*rate);n<samples.length;n++)samples[n]=.5*Math.sin(n*2*Math.PI*440/rate);
 const buffer={sampleRate:rate,length:samples.length,numberOfChannels:1,getChannelData:()=>samples};
 const suggestion=suggestVocalOnset(buffer);
 assert.ok(suggestion>=.20&&suggestion<=.24,String(suggestion));
 assert.equal(suggestVocalOnset({...buffer,getChannelData:()=>new Float32Array(samples.length)}),null);
});
