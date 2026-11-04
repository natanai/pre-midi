import test from "node:test";
import assert from "node:assert/strict";
import {create,clone} from "../schema.js";
import {createSong,addBeat,validateSong,editBeatClip,CLIP_PHASE_SONG_VERSION} from "../songModel.js";
import {parseSong,exportSongProject,importSongProject} from "../songIO.js";
import {makeSampleAsset} from "../sampler.js";
import {encodeMonoWav} from "../recording.js";
import {readZip} from "../zip.js";
import {clearAssets,getAsset} from "../assetRegistry.js";
import {unpackBeatClip} from "../freeformModel.js";
import {unpackBeatClip} from "../freeformModel.js";

test("unrecorded native Songs roundtrip as plain .premidi instructions",async()=>{
 const beat=create(),song=createSong(beat);
 const second=create();second.title="Alternate";
 addBeat(song,second);
 const expected=clone(song),packed=exportSongProject(song);
 assert.match(packed.name,/\.premidi$/);
 assert.deepEqual(parseSong(await packed.blob.text()),expected);
 assert.deepEqual(await importSongProject({name:packed.name,size:packed.blob.size,text:()=>packed.blob.text()}),expected);
 assert.deepEqual(song,expected);
});
test("Song ZIP includes a shared recorded Asset exactly once while retaining editable Beats",async()=>{
 const wave=encodeMonoWav(Float32Array.from({length:4410},(_,i)=>Math.sin(i*.1)*.5));
 const beat=create();
 const asset=makeSampleAsset("v8-sample-test","Test sample","audio/wav",wave,"Author recording");
 beat.samples=[asset];
 beat.instruments[0].sounds[0].patch={
  type:"sample",presetId:"custom",zones:[{assetId:asset.id,root:60}],
  followPitch:true,transpose:0,gain:1,attack:.01,release:.1,pan:0
 };
 const song=createSong(beat);
 addBeat(song,beat,{independent:true});
 assert.deepEqual(validateSong(song),[]);
 const packed=exportSongProject(song);
 assert.match(packed.name,/\.zip$/);
 const entries=await readZip(packed.blob);
 assert.equal(entries.size,2,"Shared sound should be bundled once");
 assert.deepEqual(entries.get(asset.path),wave);
 clearAssets();
 const restored=await importSongProject({
  name:packed.name,size:packed.blob.size,arrayBuffer:()=>packed.blob.arrayBuffer()
 });
 assert.deepEqual(restored,song);
 assert.deepEqual(getAsset(asset.id),wave);
});
test("Song import refuses orphan Assets, missing bundles, and Beat documents",async()=>{
 const song=createSong(create());
 assert.throws(()=>parseSong(JSON.stringify(song.beats[0])),/Unsupported Song format/);
 const file=exportSongProject(song);
 const corrupt=JSON.parse(await file.blob.text());
 corrupt.tracks[0].clips[0].beatId="absent";
 assert.throws(()=>parseSong(JSON.stringify(corrupt)),/missing Beat/);
 await assert.rejects(importSongProject({name:"x.wav",size:1}),/Open a/);
});

test("versioned source-phase Beat Clips survive Song export and reimport",async()=>{
 const song=createSong(create()),clip=song.tracks[0].clips[0];
 editBeatClip(song,clip.id,{sourceOffsetSteps:23});
 assert.equal(song.version,CLIP_PHASE_SONG_VERSION);
 const exported=exportSongProject(song);
 const restored=parseSong(await exported.blob.text());
 assert.deepEqual(restored,song);
 assert.equal(restored.tracks[0].clips[0].sourceOffsetSteps,23);
});

test("freeform notes survive a Song instruction export/reimport",async()=>{
 const song=createSong(create()),inst=song.beats[0].instruments[0];
 inst.chunks[0].notes=[{id:"freeform-test-note",pitch:63,start:2,duration:3,velocity:.8}];
 unpackBeatClip(song,song.tracks[0].clips[0].id);
 const file=exportSongProject(song);
 assert.match(file.name,/\.premidi$/);
 assert.deepEqual(parseSong(await file.blob.text()),song);
});

test("sample assets stay external after Song freeform unpack and portable round trip",async()=>{
 const bytes=encodeMonoWav(Float32Array.from({length:4410},(_,i)=>Math.sin(i*.04)*.3));
 const beat=create(),asset=makeSampleAsset("unpack-external-wav","Unpacked sample","audio/wav",bytes,"test");
 beat.samples=[asset];
 beat.instruments[0].sounds[0].patch={
  type:"sample",presetId:"custom",zones:[{assetId:asset.id,root:60}],
  followPitch:true,transpose:0,gain:1,attack:.01,release:.1,pan:0
 };
 beat.instruments[0].chunks[0].notes=[{id:"sample-hit",pitch:60,start:2,duration:2,velocity:.8}];
 const song=createSong(beat);
 unpackBeatClip(song,song.tracks[0].clips[0].id);
 const manifest=exportSongProject(song);
 assert.match(manifest.name,/\.zip$/);
 const entries=await readZip(manifest.blob);
 assert.deepEqual(entries.get(asset.path),bytes);
 clearAssets();
 const restored=await importSongProject({
  name:manifest.name,size:manifest.blob.size,arrayBuffer:()=>manifest.blob.arrayBuffer()
 });
 assert.deepEqual(restored,song);
 assert.deepEqual(getAsset(asset.id),bytes);
});
