import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedEffects,processingFromPatch,validateRecordedModulation,applyProcessingToPatch} from '../recordedAudio.js';
import {validateVocalEffects} from '../vocalEffects.js';
import {validatePatch} from '../synth.js';
import {planNativeSample,planNativeVocal,encodeNativeSample} from '../src/hosts/native/sample-plan.js';
import {presetFromProcessing,validUserSound} from '../userSoundLibrary.js';
const routes={version:1,routes:[{id:'pan',source:{kind:'lfo',shape:'sine',rate:2},target:'pan',unit:'pan',depth:.5,polarity:'bipolar',smoothing:.01}]};
const processing={pan:.2,transpose:0,attack:.03,release:.1,drive:.2,filter:{type:'lowpass',cutoff:2400,resonance:1},delayMix:.25,delayTime:.2,delayFeedback:.3,movement:{tone:.5,toneRate:2},modulation:routes,
 automation:{version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',points:[{id:'a',step:0,value:2400},{id:'b',step:16,value:600}]}};
const patch={type:'sample',presetId:'custom',zones:[{assetId:'voice',root:60,startSeconds:.2,durationSeconds:1}],followPitch:false,oneShot:true,audioMode:'clip',gain:.8,...processing};
test('a reused vocal and sampled Sound retain identical current processing and gain envelopes',()=>{
 const assets=new Map([['voice',{id:1,duration:1.2,normalization:3.7}]]);
 const vocal=planNativeVocal({recording:{id:'voice',durationSeconds:1.2,trimSeconds:.2},clip:{gain:.8,lengthSteps:8,effects:processing}},0,.125,assets);
 const sample=planNativeSample({patch,volume:1},{pitch:60,velocity:1},0,1,assets);
 for(const key of ['filter','drive','movement','pan','playbackRate','offset','delayMix','delayTime','delayFeedback','modulation'])assert.deepEqual(sample[key],vocal[key],key);
 assert.deepEqual(sample.events,vocal.events);
 assert.deepEqual(validatePatch(patch),[]);assert.deepEqual(validateVocalEffects(processing),[]);
 assert.equal(new DataView(encodeNativeSample(sample,44100).buffer).getUint32(12,true),11);
});
test('processing-only presets preserve modulation, tone, delay and automation without source assets',()=>{
 const fx=processingFromPatch(patch),preset=presetFromProcessing(fx,'voice processing');
 assert.ok(validUserSound(preset));assert.deepEqual(preset.samples,[]);assert.equal(preset.patch,undefined);
 const other=structuredClone(patch);other.zones=[{assetId:'different-voice',root:48}];
 applyProcessingToPatch(other,JSON.parse(JSON.stringify(preset)).processing);
 assert.equal(other.zones[0].assetId,'different-voice');
 assert.deepEqual(other.modulation,routes);assert.equal(other.delayMix,.25);assert.deepEqual(other.automation,processing.automation);
});
test('recorded-audio routing rejects oscillator destinations and timeline note-only sources',()=>{
 const bad=structuredClone(routes);bad.routes[0]={...bad.routes[0],target:'oscillators.0.level',unit:'linear_gain'};
 assert.ok(validateRecordedModulation(bad).length);
 const touch=structuredClone(routes);touch.routes[0].source={kind:'velocity'};
 assert.deepEqual(validateRecordedModulation(touch),[]);assert.ok(validateRecordedModulation(touch,{vocal:true}).length);
});
test('vocal excerpt conversion keeps stereo channels distinct instead of averaging them',async()=>{
 const {encodePcmWav}=await import('../recording.js');
 const data=encodePcmWav([new Float32Array([.5,0]),new Float32Array([0,-.5])]);
 const view=new DataView(data.buffer);assert.equal(view.getUint16(22,true),2);
 assert.equal(view.getInt16(44,true),16384);assert.equal(view.getInt16(46,true),0);
 assert.equal(view.getInt16(48,true),0);assert.equal(view.getInt16(50,true),-16384);
});
