import test from 'node:test';
import assert from 'node:assert/strict';
import {makePatch,validatePatch} from '../synth.js';
import {resolveModulation,validateModulation,routeValueAt} from '../src/dsp/modulation.js';
import {effectiveDelayEffects,validateProcessingChain} from '../src/dsp/processing-chain.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';
import {processingFromPatch,applyProcessingToPatch} from '../recordedAudio.js';
import {vocalEffects} from '../vocalEffects.js';
import {create,parse,upgradeBeatFeatures} from '../schema.js';
const block={version:1,macros:[{id:'macro-1',name:'motion',value:.3,default:.5}],routes:[{id:'a',target:'amplitude',unit:'linear_gain',depth:.8,polarity:'unipolar',smoothing:0,source:{kind:'macro',id:'macro-1'}},{id:'b',target:'pan',unit:'pan',depth:-1,polarity:'bipolar',smoothing:0,source:{kind:'macro',id:'macro-1'}}]};
test('one macro drives multiple portable routes and keeps authored values through transfer and save',()=>{
 assert.deepEqual(validateModulation(block),[]);
 const resolved=resolveModulation(block),note={elapsed:2};
 assert.equal(routeValueAt(resolved.routes[0],note),.24);assert.equal(routeValueAt(resolved.routes[1],note),.4);
 assert.equal(block.routes[0].source.value,undefined);
 const patch=makePatch();patch.version=2;patch.modulation=structuredClone(block);
 const processed=processingFromPatch(patch),copy=applyProcessingToPatch(makePatch(),processed);assert.deepEqual(copy.modulation,block);
 const beat=create();beat.instruments[0].sounds[0].patch=copy;upgradeBeatFeatures(beat);assert.deepEqual(parse(JSON.stringify(beat)),beat);
 assert.ok(validateModulation({...block,macros:[]}).length);
 assert.ok(validateModulation({...block,macros:[{...block.macros[0],value:2}]}).length);
});
test('serial mixes preserve full precision and tempo delay resolves per voice without rewriting authored seconds',()=>{
 const patch=makePatch();patch.chain={version:1,order:['drive','filter'],bypass:[],mix:{drive:.37,filter:.61}};
 patch.delaySync=1;patch.effects.delayMix=.4;const raw=JSON.stringify(patch);
 assert.deepEqual(validatePatch(patch),[]);assert.ok(validateProcessingChain({...patch.chain,mix:{drive:2}}).length);
 for(const bpm of [40,120,240]){
  const unit=60/bpm/4,plan=planSynthVoice({patch,volume:1},{pitch:60,velocity:1},0,.2,{unit});
  assert.equal(plan.patch.effects.delayTime,60/bpm);assert.equal(JSON.stringify(patch),raw);
  assert.equal(vocalEffects({effects:{delaySync:1,delayMix:.4}},unit).delayTime,60/bpm);
  assert.equal(effectiveDelayEffects(patch,patch.effects,unit).delayTime,60/bpm);
 }
 const fx=processingFromPatch(patch);assert.equal(fx.delaySync,1);assert.deepEqual(fx.chain.mix,patch.chain.mix);
 assert.equal(applyProcessingToPatch(makePatch(),fx).delaySync,1);
});

test('stereo processing survives presets, plans and current project saves with strict bounds',async()=>{
 const {validateStereo,stereoSample}=await import('../src/dsp/stereo.js');const {encodeNativePlan}=await import('../src/hosts/native/plan.js');
 const controls={stereoWidth:1.7,msBalance:-.2,delayTone:800,delayPingPong:true},patch={...makePatch(),...controls};patch.effects.delayMix=.4;
 assert.deepEqual(validatePatch(patch),[]);const processing=processingFromPatch(patch),copy=applyProcessingToPatch(makePatch(),processing);for(const key in controls)assert.equal(copy[key],controls[key]);
 const beat=create();beat.instruments[0].sounds[0].patch=copy;assert.deepEqual(parse(JSON.stringify(beat)),beat);
 const plan=planSynthVoice({patch,volume:1},{pitch:60,velocity:1},0,.2);assert.deepEqual(validatePatch(plan.patch),[]);assert.ok(encodeNativePlan(plan,24000,24000).length);assert.equal(plan.patch.delayPingPong,true);
 assert.deepEqual(stereoSample(.3,.3,2),[.3,.3]);assert.deepEqual(stereoSample(.3,-.3,0),[0,0]);assert.deepEqual(stereoSample(.3,-.3,1,-1),[0,0]);
 for(const controls of [{stereoWidth:2.1},{msBalance:-2},{delayTone:0},{delayPingPong:1}])assert.ok(validateStereo(controls).length);
});
