import test from 'node:test';import assert from 'node:assert/strict';
import {create} from '../schema.js';import {createSong,addVocalTake,trimVocalClip,setSongTempo,duplicateVocalClip,upgradeSongFeatures,validateSong} from '../songModel.js';
import {vocalSourceRange} from '../vocalEffects.js';import {makeRecordingAsset} from '../recordingAssets.js';import {encodePcmWav} from '../recording.js';import {linkedVocalSample} from '../vocalBeatReuse.js';import {planNativeVocal} from '../src/hosts/native/sample-plan.js';import {parseSong} from '../songIO.js';
test('independent start/end source trims change clip length, native bounds and reuse while preserving original recording',()=>{
 const bytes=encodePcmWav([new Float32Array(88200)]),recording=makeRecordingAsset('end-trim','take','audio/wav',bytes,{durationSeconds:2,trimSeconds:.1}),song=createSong(create()),{clip}=addVocalTake(song,recording,{startStep:0});
 trimVocalClip(song,clip.id,.2);trimVocalClip(song,clip.id,.6,'end');upgradeSongFeatures(song);
 assert.equal(clip.lengthSteps,Math.ceil(1.1/(60/song.bpm/4)));assert.deepEqual(validateSong(song),[]);
 const range=vocalSourceRange(recording,clip,60/song.bpm/4);assert.ok(Math.abs(range.offset-.3)<1e-9);assert.equal(range.sourceEnd,1.4);assert.ok(Math.abs(range.duration-1.1)<1e-9);
 assert.equal(planNativeVocal({clip,recording},0,.125,new Map([[recording.id,{id:1,duration:2}]] )).sourceLimit,1.4);
 const alias=linkedVocalSample(recording,clip,bytes);assert.equal(alias.zone.startSeconds,.3);assert.equal(alias.zone.durationSeconds,1.1);
 const duplicate=duplicateVocalClip(song,clip.id);trimVocalClip(song,duplicate.id,.3,'end');assert.equal(clip.trimEndSeconds,.6);
 setSongTempo(song,90);assert.equal(clip.lengthSteps,Math.ceil(1.1/(60/90/4)));assert.deepEqual(parseSong(JSON.stringify(song)),song);
 assert.throws(()=>trimVocalClip(song,clip.id,1.8,'end'),/leave/);assert.equal(recording.durationSeconds,2);
 trimVocalClip(song,clip.id,0,'end');assert.equal(vocalSourceRange(recording,clip,60/90/4).sourceEnd,2);
});
