import test from 'node:test';
import assert from 'node:assert/strict';
import {randomLfoValue,modulationWave,sourceValueAt,validateModulation,resolveModulation} from '../src/dsp/modulation.js';
import {create,parse,upgradeBeatFeatures} from '../schema.js';
import {makePatch} from '../synth.js';
import {processingFromPatch} from '../recordedAudio.js';
import {diagram} from '../soundIllustrations.js';
const route=shape=>({id:'random',target:'amplitude',unit:'linear_gain',depth:.5,polarity:'bipolar',smoothing:.005,source:{kind:'lfo',shape,rate:3,seed:17,sync:1}});
test('seeded movement holds values and interpolates between the same deterministic knots',()=>{
 for(const seed of [1,17,127])for(const n of [0,1,51,12000]){
  const a=randomLfoValue(seed,n),b=randomLfoValue(seed,n+1);
  assert.ok(a>=-1&&a<=1);assert.equal(modulationWave('sample-hold',n+.25,seed),a);
  assert.equal(modulationWave('smooth-random',n+.25,seed),a+(b-a)*.25);
  assert.equal(modulationWave('sample-hold',n+1,seed),b);
 }
 assert.notEqual(randomLfoValue(1,0),randomLfoValue(17,0));
});
test('random sequences survive patch, processing-preset and Beat round trips with source-age tempo',()=>{
 for(const shape of ['sample-hold','smooth-random']){
  const block={version:1,routes:[route(shape)]};assert.deepEqual(validateModulation(block),[]);
  for(const seed of [0,128,.5,NaN])assert.ok(validateModulation({...block,routes:[{...route(shape),source:{...route(shape).source,seed}}]}).length);
  const beat=create(),patch=makePatch();patch.version=2;patch.modulation=block;beat.instruments[0].sounds[0].patch=patch;upgradeBeatFeatures(beat);
  assert.deepEqual(parse(JSON.stringify(beat)),beat);
  assert.deepEqual(processingFromPatch(patch).modulation,block);
  const synced=route(shape).source,free=resolveModulation(block,.25).routes[0].source;
  for(const elapsed of [.1,2.13,23.8])assert.equal(sourceValueAt(synced,{elapsed,unit:.25}).value,sourceValueAt(free,{elapsed}).value);
  const picture=diagram(patch,'modulation',1);
  assert.ok(picture.handles.some(h=>h.axes.some(a=>a.path.join('.').endsWith('source.seed'))));
 }
});
