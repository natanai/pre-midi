import test from 'node:test';
import assert from 'node:assert/strict';
import {modulationTargetsFor,parameterDefaults} from '../src/dsp/parameters.js';
import {modulationWave,validateModulation,nativeModulationSource,combineParameter} from '../src/dsp/modulation.js';
import {validateRecordedModulation,processingFromPatch} from '../recordedAudio.js';
test('all source contexts expose the same bounded amplitude and resonance routes',()=>{
 for(const context of ['synth','sample','vocal']){
  const targets=modulationTargetsFor(context);
  assert.equal(targets.find(t=>t.id==='amplitude').index,7);
  assert.equal(targets.find(t=>t.id==='filter.resonance').index,6);
  for(const shape of ['sine','triangle','ramp','square']){
   const block={version:1,routes:[{id:'r',target:'amplitude',unit:'linear_gain',depth:1,polarity:'bipolar',smoothing:.005,source:{kind:'lfo',shape,rate:2}}]};
   assert.deepEqual(validateModulation(block),[]);assert.deepEqual(validateRecordedModulation(block,{vocal:context==='vocal'}),[]);
   assert.deepEqual(processingFromPatch({type:'sample',modulation:block}).modulation,block);
  }
 }
 assert.equal(parameterDefaults('','synth').amplitude,undefined,'The unity route multiplier is not another stored source level');
 assert.equal(combineParameter('amplitude',1,-3),0);assert.equal(combineParameter('amplitude',1,3),2);
 assert.equal(combineParameter('filter.resonance',.7,-20),.1);assert.equal(combineParameter('filter.resonance',.7,20),16);
});
test('waveform values and current native shape identities are deterministic',()=>{
 assert.equal(modulationWave('triangle',0),-1);assert.equal(modulationWave('triangle',.5),1);
 assert.equal(modulationWave('ramp',.25),-.5);assert.equal(modulationWave('square',.25),1);assert.equal(modulationWave('square',.75),-1);
 for(const [shape,kind] of [['sine',0],['triangle',4],['ramp',5],['square',6]]){
  assert.equal(nativeModulationSource({kind:'lfo',shape}),kind);
  for(const time of [.125,.375,.875])assert.ok(Math.abs(modulationWave(shape,time)-modulationWave(shape,time+100))<1e-12);
 }
 const invalid={version:1,routes:[{id:'bad',target:'amplitude',unit:'linear_gain',depth:1,polarity:'bipolar',smoothing:0,source:{kind:'lfo',shape:'unknown',rate:2}}]};
 assert.ok(validateModulation(invalid).length);
});
