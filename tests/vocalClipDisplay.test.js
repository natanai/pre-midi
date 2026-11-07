import test from 'node:test';
import assert from 'node:assert/strict';
import {vocalClipDisplay} from '../vocalAudioView.js';
import {trimVocalClip} from '../songModel.js';
test('Song tile crops the trimmed lead-in while retaining its intended Song position',()=>{
 const recording={id:'take',durationSeconds:4,trimSeconds:0,waveform:[...Array(16).fill(0),...Array(16).fill(.7)]};
 const clip={id:'clip',recordingId:'take',startStep:16,lengthSteps:32};
 const song={bpm:120,recordings:[recording],tracks:[{kind:'vocal',clips:[clip]}]};
 const before=vocalClipDisplay(recording,clip,song.bpm);
 trimVocalClip(song,clip.id,2);
 const after=vocalClipDisplay(recording,clip,song.bpm);
 assert.equal(clip.startStep,16);assert.equal(after.steps,16);assert.equal(after.duration,2);
 assert.equal(after.sourceStart,2);assert.equal(after.sourceEnd,4);
 assert.ok(before.peaks.some(p=>p===0));assert.ok(after.peaks.every(p=>p===.7));
});
test('Song tile length uses actual audible duration instead of a rounded step allocation',()=>{
 const recording={durationSeconds:3.929,trimSeconds:0,waveform:[.1,.3,.7,.2]};
 const clip={trimStartSeconds:1.321,lengthSteps:11,effects:{transpose:12}};
 const result=vocalClipDisplay(recording,clip,120);
 assert.ok(Math.abs(result.duration-1.304)<1e-10);
 assert.ok(Math.abs(result.steps-10.432)<1e-10);assert.ok(result.steps<clip.lengthSteps);
 assert.equal(result.sourceStart,1.321);assert.ok(Math.abs(result.sourceEnd-3.929)<1e-10);
});
