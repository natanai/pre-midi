import test from "node:test";
import assert from "node:assert/strict";
import {create} from "../schema.js";
import {createSong,addVocalTake,setSongTempo,trimVocalClip,upgradeSongFeatures,validateSong} from "../songModel.js";
import {recordingEventsAtStep} from "../songAudio.js";
import {vocalSourceRange} from "../vocalEffects.js";
import {makeRecordingAsset} from "../recordingAssets.js";
import {exportSongProject,importSongProject} from "../songIO.js";
import {clearAssets,getAsset} from "../assetRegistry.js";
const bytes=()=>{const data=new Uint8Array(320);data.set([0x1a,0x45,0xdf,0xa3]);return data;};
const rec=(id,duration,trim=.05)=>makeRecordingAsset(id,id,"audio/webm",bytes(),{durationSeconds:duration,trimSeconds:trim});

test("overlapping voice takes retain a single track and can seek into both continuous recordings",()=>{
 const song=createSong(create()),a=rec("overlap-one",3),b=rec("overlap-two",2.4);
 const one=addVocalTake(song,a,{startStep:16});
 const two=addVocalTake(song,b,{startStep:24,trackId:one.track.id});
 assert.equal(song.tracks.filter(track=>track.kind==="vocal").length,1);
 assert.equal(one.track.clips.length,2);
 assert.deepEqual(recordingEventsAtStep(song,16).map(x=>x.clip.id),[one.clip.id]);
 assert.deepEqual(recordingEventsAtStep(song,20).map(x=>x.clip.id),[]);
 assert.deepEqual(recordingEventsAtStep(song,20,{includeOverlapping:true}).map(x=>x.clip.id),[one.clip.id]);
 assert.deepEqual(new Set(recordingEventsAtStep(song,26,{includeOverlapping:true}).map(x=>x.clip.id)),
  new Set([one.clip.id,two.clip.id]));
 assert.equal(recordingEventsAtStep(song,26).length,0,
  "Regular playback schedules each voice only at onset");
 assert.deepEqual(validateSong(song),[]);
});
test("tempo changes update vocal step lengths without changing beat placement or source-time audio",async()=>{
 clearAssets();
 const song=createSong(create()),recording=rec("tempo-voice",3.02,.075);
 const {clip}=addVocalTake(song,recording,{startStep:40});
 trimVocalClip(song,clip.id,.125);
 clip.effects={transpose:12}; // Twice normal playback speed, no time-stretching.
 upgradeSongFeatures(song);
 const originalBytes=getAsset(recording.id).slice();
 const start=clip.startStep;
 const source=(recording.durationSeconds-recording.trimSeconds-.125)/2;
 for(const bpm of [180,60,120,240]){
  setSongTempo(song,bpm);
  const stepLength=60/bpm/4;
  assert.equal(clip.startStep,start);
  assert.ok(clip.lengthSteps*stepLength>=source-1e-9);
  assert.ok(clip.lengthSteps*stepLength<source+stepLength+1e-9);
  const range=vocalSourceRange(recording,clip,stepLength);
  assert.ok(Math.abs(range.offset-.2)<1e-9);
  assert.ok(Math.abs(range.duration-source)<1e-9);
  assert.deepEqual(validateSong(song),[]);
 }
 const file=exportSongProject(song);
 const imported=await importSongProject({name:file.name,size:file.blob.size,
  arrayBuffer:()=>file.blob.arrayBuffer()});
 assert.deepEqual(imported,song);
 assert.deepEqual(getAsset(recording.id),originalBytes);
});
test("seeking after onset and after trims maps audible position in real source time",()=>{
 const song=createSong(create()),recording=rec("seek-voice",4,.1);
 const {clip}=addVocalTake(song,recording,{startStep:10});
 trimVocalClip(song,clip.id,.15);
 upgradeSongFeatures(song);
 const unit=60/song.bpm/4;
 const late=recordingEventsAtStep(song,18,{includeOverlapping:true});
 assert.equal(late.length,1);
 const range=vocalSourceRange(recording,clip,unit,18-clip.startStep);
 assert.ok(Math.abs(range.offset-(.1+.15+8*unit))<1e-10);
 assert.equal(range.rate,1);
 assert.ok(range.duration>0);
 assert.equal(recordingEventsAtStep(song,10).length,1);
 assert.equal(recordingEventsAtStep(song,18).length,0);
 assert.deepEqual(validateSong(song),[]);
});
