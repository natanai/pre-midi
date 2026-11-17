import test from 'node:test';
import assert from 'node:assert/strict';
import {makePatch,validatePatch} from '../synth.js';
import {create,upgradeBeatFeatures,parse} from '../schema.js';
import {withInstance} from '../src/dsp/processing-graph.js';
import {withProcessorRemoved,withProcessorAdded} from '../src/dsp/processing-chain.js';
import {modulationTargets,validateModulation,resolveModulation} from '../src/dsp/modulation.js';
import {compilePostProcessing,postTailSeconds} from '../src/dsp/post-processing.js';
import {soundAxis} from '../soundParameterAdapter.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';
import {encodeNativePlan} from '../src/hosts/native/plan.js';

const route=(target,unit,depth)=>({id:'move',target,unit,depth,polarity:'bipolar',smoothing:.005,source:{kind:'lfo',shape:'sine',rate:.5}});
test('post movement targets use strict instance bounds and retain current project identity',()=>{
 for(const kind of ['compressor','gate','limiter','deesser','chorus','flanger','phaser','autopan','ringmod','frequencyshift']){
  const patch=makePatch();patch.version=2;patch.chain=withInstance(patch,kind);
  const id=patch.chain.post[0],targets=modulationTargets(patch).filter(t=>t.id.startsWith('processor.'));
  assert.ok(targets.length>1);assert.ok(!targets.some(t=>t.id.endsWith('.enabled')));
  for(const target of targets){
   patch.modulation={version:1,routes:[route(target.id,target.unit,target.limit)]};
   assert.deepEqual(validatePatch(patch),[],target.id);
   const beat=create();beat.instruments[0].sounds[0].patch=patch;upgradeBeatFeatures(beat);
   assert.deepEqual(parse(JSON.stringify(beat)),beat);
   assert.equal(soundAxis(patch,['modulation','routes',0,'depth'],'linearY').max,target.limit);
   const plan=planSynthVoice({patch,volume:.5},{pitch:60,velocity:1},0,.5);
   assert.ok(plan.postProcessing[0].automationMask);
   assert.ok(encodeNativePlan(plan,48000,1).length);
   patch.modulation.routes[0].depth+=1;
   assert.ok(validateModulation(patch.modulation,patch).length);
   patch.modulation.routes[0].depth=target.limit;patch.modulation.routes[0].target='processor.missing.mix';
   assert.ok(validateModulation(patch.modulation,patch).length);
  }
  assert.equal(id,patch.chain.post[0]);
 }
});
test('movement can activate a dry instance and reserve bounded echo and carrier history',()=>{
 const patch=makePatch();patch.version=2;patch.chain=withInstance(patch,'flanger');patch.chain.mix={'flanger-1':0};
 patch.modulation={version:1,routes:[route('processor.flanger-1.mix','ratio',1),route('processor.flanger-1.feedback','linear_gain',1.6)]};patch.modulation.routes[1].id='feedback';
 assert.equal(compilePostProcessing(patch).length,1);assert.ok(postTailSeconds(patch)>.35);
 const removed=withProcessorRemoved(patch,'flanger-1');patch.chain=removed;
 assert.equal(resolveModulation(patch.modulation,.125,patch).routes.length,0);
 assert.equal(resolveModulation(patch.modulation,.125,patch,{includeInactive:true}).routes.length,2);
 patch.chain=withProcessorAdded(patch,'flanger-1');
 assert.equal(resolveModulation(patch.modulation,.125,patch).routes.length,2);
 patch.chain.instances[0].parameters.sync=1;
 patch.modulation.routes=[route('processor.flanger-1.rate','hz',10)];
 assert.equal(resolveModulation(patch.modulation,.125,patch).routes.length,0);
 patch.chain=withInstance({},'frequencyshift');
 patch.modulation.routes=[route('processor.frequencyshift-1.frequency','hz',4000)];
 const prepared=compilePostProcessing(patch)[0];assert.equal(prepared.frequencyLow,-2000);assert.equal(prepared.frequencyHigh,2000);
});
