import test from "node:test";
import assert from "node:assert/strict";
import {create,upgradeBeatFeatures,validate as validateBeat,parse as parseBeat,
 SAMPLE_SLICE_BEAT_VERSION} from "../schema.js";
import {createSong,addVocalTake,removeSongClip,pruneUnusedRecordings,upgradeSongFeatures,validateSong,renameVocalRecording,
 SAMPLE_SLICE_SONG_VERSION} from "../songModel.js";
import {linkedVocalSample} from "../vocalBeatReuse.js";
import {makeRecordingAsset} from "../recordingAssets.js";
import {getAsset,clearAssets} from "../assetRegistry.js";
import {encodeMonoWav} from "../recording.js";
import {sampleSourceRegion} from "../sampleSlice.js";
import {planNativeSample,encodeNativeSample} from "../src/hosts/native/sample-plan.js";
import {exportSongProject,importSongProject,parseSong} from "../songIO.js";
import {exportProject,importProject} from "../packageIO.js";
import {readZip} from "../zip.js";

const WAV_RATE=44100;
function wav(seconds){
 const frames=Math.floor(seconds*WAV_RATE),pcm=new Float32Array(frames);
 for(let i=0;i<frames;i++)pcm[i]=.25*Math.sin(i*2*Math.PI*440/WAV_RATE);
 return encodeMonoWav(pcm);
}
function longWav(seconds){
 // The regular Beat recorder intentionally refuses >4s recordings. Construct
 // a valid longer Song WAV here to test that the linking threshold rejects it.
 const original=wav(4),frames=Math.round(seconds*WAV_RATE),data=new Uint8Array(44+frames*2);
 data.set(original);
 const view=new DataView(data.buffer);
 view.setUint32(4,data.length-8,true);
 view.setUint32(40,data.length-44,true);
 return data;
}
function fixture(){
 const original=wav(2.5),rec=makeRecordingAsset("voice-linked-wav","Voice linked","audio/wav",original,
  {durationSeconds:2.5,trimSeconds:.08});
 const song=createSong(create()),{clip}=addVocalTake(song,rec,{startStep:32});
 clip.trimStartSeconds=.184;
 const link=linkedVocalSample(rec,clip,original);
 assert.ok(link);
 const beat=song.beats[0];
 beat.samples.push(link.asset);
 const sound=beat.instruments[0].sounds[0];
 beat.instruments[0].layout="rack";sound.trigger="hit";sound.referencePitch=60;
 sound.patch={
  type:"sample",presetId:"custom",zones:[link.zone],followPitch:false,oneShot:true,
  transpose:0,gain:.8,attack:.02,release:.1,pan:0
 };
 upgradeSongFeatures(song);
 return {original,rec,song,clip,link,beat,sound};
}
test("short trimmed WAV vocals reuse their canonical asset, never creating another file",()=>{
 const {song,rec,clip,link,beat,original}=fixture();
 assert.equal(link.asset.id,rec.id);
 assert.equal(link.asset.path,rec.path);
 assert.equal(link.asset.sourceRecordingId,rec.id);
 assert.deepEqual(link.zone,{assetId:rec.id,root:60,startSeconds:.264,durationSeconds:2.236});
 assert.deepEqual(getAsset(rec.id),original);
 assert.equal(beat.samples.length,1);
 assert.equal(song.recordings.length,1);
 assert.equal(song.version,SAMPLE_SLICE_SONG_VERSION);
 assert.equal(beat.version,SAMPLE_SLICE_BEAT_VERSION);
 assert.deepEqual(validateSong(song),[]);
 assert.deepEqual(validateBeat(beat),[]);
 assert.deepEqual(parseSong(JSON.stringify(song)),song);
 assert.deepEqual(parseBeat(JSON.stringify(beat)),beat);
 assert.equal(clip.startStep,32,"Clip remains where the author placed it");
});
test("web and native sample playback use the identical source-time region",()=>{
 const {link,sound,beat}=fixture();
 const region=sampleSourceRegion(link.zone,2.5,1);
 assert.equal(region.offset,.264);
 assert.ok(Math.abs(region.sourceLength-2.236)<1e-8);
 assert.ok(Math.abs(region.length-2.236)<1e-8);
 const plan=planNativeSample({patch:sound.patch,volume:.8},{pitch:60,velocity:1},.75,.15,
  new Map([[link.asset.id,{id:7,duration:2.5,normalization:1}]]));
 assert.equal(plan.offset,region.offset);
 assert.equal(plan.playbackRate,1);
 assert.equal(plan.end, .75+region.length+.01);
 const packet=encodeNativeSample(plan,44100);
 const view=new DataView(packet.buffer,packet.byteOffset,packet.byteLength);
 assert.equal(view.getUint32(12,true),13,"Current native sampler packet preserves source offset");
 assert.equal(view.getUint32(16,true),1);
 assert.deepEqual(validateBeat(beat),[]);
});
test("Song ZIP bundles a linked WAV once and both Song and standalone Beat round-trip",async()=>{
 const {song,rec,original,beat}=fixture();
 renameVocalRecording(song,song.tracks.find(t=>t.kind==="vocal").clips[0].id,"  sung phrase  ");
 assert.equal(song.recordings[0].name,"sung phrase");assert.equal(beat.samples[0].name,song.recordings[0].name);
 assert.deepEqual(validateSong(song),[]);
 const packed=exportSongProject(song);
 const items=await readZip(packed.blob);
 assert.equal(items.size,2,"One instructions file and one shared WAV");
 assert.deepEqual(items.get(rec.path),original);
 const beatZip=exportProject(beat),separate=await readZip(beatZip.blob);
 assert.equal(separate.size,2);
 assert.deepEqual(separate.get(rec.path),original);
 clearAssets();
 const restored=await importSongProject({name:packed.name,size:packed.blob.size,
  arrayBuffer:()=>packed.blob.arrayBuffer()});
 assert.deepEqual(restored,song);
 assert.deepEqual(getAsset(rec.id),original);
 const again=await readZip(exportSongProject(restored).blob);
 assert.equal(again.size,2);
 clearAssets();
 const restoredBeat=await importProject({name:beatZip.name,size:beatZip.blob.size,
  arrayBuffer:()=>beatZip.blob.arrayBuffer()});
 assert.deepEqual(restoredBeat,beat);
 assert.deepEqual(getAsset(rec.id),original);
});
test("a Beat keeps its shared WAV alive after the original voice clip is removed",()=>{
 const {song,clip,rec,original}=fixture();
 removeSongClip(song,clip.id);
 assert.ok(song.recordings.some(recording=>recording.id===rec.id),
  "Recording metadata survives while the Beat uses the same asset");
 assert.deepEqual(validateSong(song),[]);
 assert.equal(song.tracks.filter(track=>track.kind==="vocal").length,0);
 assert.equal(song.beats[0].samples[0].id,rec.id);
 assert.deepEqual(getAsset(rec.id),original);
 assert.equal(exportSongProject(song).blob.size>0,true);
});
test("removing the final Beat sound reference prunes unused recording metadata",()=>{
 const {song,clip,rec,original}=fixture();
 removeSongClip(song,clip.id);
 assert.equal(song.recordings.length,1);
 const beat=song.beats[0];
 beat.instruments[0].sounds[0].patch={type:"synth"};
 beat.samples=[];
 pruneUnusedRecordings(song);
 assert.deepEqual(song.recordings,[]);
 assert.equal(song.version,SAMPLE_SLICE_SONG_VERSION,"Version remains stable for project compatibility");
 assert.deepEqual(getAsset(rec.id),original,"Binary survives for Song Undo");
});
test("identity collisions, unversioned slices, overlong excerpts and incompatible codecs are rejected",()=>{
 const {song,beat,rec,clip,link}=fixture();
 const unversioned=structuredClone(beat);unversioned.version=7;
 assert.match(validateBeat(unversioned).join(" "),/v23/);
 const staleSong=structuredClone(song);staleSong.version=22;
 assert.match(validateSong(staleSong).join(" "),/v24/);
 const collision=structuredClone(song);
 collision.beats[0].samples[0].sourceRecordingId="unrelated-id";
 assert.match(validateSong(collision).join(" "),/Conflicting Beat audio asset ID/);
 assert.equal(linkedVocalSample({...rec,mime:"audio/webm"},clip,getAsset(rec.id)),null);
 const tooLongBytes=longWav(4.5);
 const tooLong=makeRecordingAsset("voice-too-long","Long voice","audio/wav",tooLongBytes,
  {durationSeconds:4.5,trimSeconds:0});
 assert.equal(linkedVocalSample(tooLong,{recordingId:tooLong.id,trimStartSeconds:0},tooLongBytes),null);
 assert.throws(()=>linkedVocalSample(rec,{...clip,trimStartSeconds:-.08},getAsset(rec.id)),
  /Invalid vocal trim/);
 const bad=structuredClone(beat);
 bad.instruments[0].sounds[0].patch.zones[0].durationSeconds=4.2;
 assert.match(validateBeat(bad).join(" "),/excerpt/);
 assert.throws(()=>sampleSourceRegion({startSeconds:9,durationSeconds:1},2.5,1),
  /beyond its recording/);
});
