import test from 'node:test';
import assert from 'node:assert/strict';
import {makePatch} from '../synth.js';
import {create,upgradeBeatFeatures,parse} from '../schema.js';
import {withInstance} from '../src/dsp/processing-graph.js';
import {automationParameters,validateAutomation,planParameterAutomation,automationRecordingStep} from '../src/dsp/automation.js';
import {compilePostProcessing,postTailSeconds} from '../src/dsp/post-processing.js';
import {postAutomationFields} from '../src/dsp/processor-automation.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';

const lane=(target,unit,interpolation='linear',low=0,high=1)=>({
 id:target,version:1,target,unit,interpolation,
 points:[{id:'a',step:0,value:low},{id:'b',step:8,value:high}]
});
test('post effect parameter lanes retain bounds, identities and state through the current project format',()=>{
 for(const kind of ['compressor','gate','limiter','deesser','chorus','flanger','phaser','autopan','ringmod','frequencyshift']){
  const patch=makePatch();patch.chain=withInstance(patch,kind);
  const instance=patch.chain.instances[0],fields=postAutomationFields(kind);
  const parameters=automationParameters(patch);
  for(const [key,field] of Object.entries(fields)){
   const target='processor.'+instance.id+'.'+key;
   assert.equal(parameters.filter(parameter=>parameter.id===target).length,1);
   const automation=[lane(target,field.unit,field.discrete?'step':'linear',field.min,field.max)];
   assert.deepEqual(validateAutomation(automation,patch,1),[],kind+' '+key);
   patch.automation=automation;
   const beat=create();beat.instruments[0].sounds[0].patch=patch;upgradeBeatFeatures(beat);
   assert.deepEqual(parse(JSON.stringify(beat)),beat);
   const plan=planSynthVoice({patch,volume:.5},{pitch:60,velocity:1},0,.75);
   assert.ok(plan.parameterAutomation[0].target===target);
   assert.ok(plan.postProcessing[0].automationMask>0);
   automation[0].points[1].value=field.max+1;
   assert.ok(validateAutomation(automation,patch,1).length,kind+' '+key+' accepted overflow');
  }
 }
});
test('a zero mix processor with a live mix lane stays prepared and its echo tail is retained',()=>{
 const patch=makePatch();patch.chain=withInstance(patch,'flanger');patch.chain.mix={'flanger-1':0};
 patch.automation=[lane('processor.flanger-1.mix','ratio'),lane('processor.flanger-1.feedback','linear_gain','linear',0,.8)];
 const prepared=compilePostProcessing(patch);
 assert.equal(prepared.length,1);
 assert.ok(postTailSeconds(patch)>.35);
 const lanes=planParameterAutomation(patch.automation,patch,{start:0,end:1,unit:.125});
 assert.equal(lanes.length,2);
 patch.chain.bypass=['flanger-1'];
 assert.equal(compilePostProcessing(patch).length,0);
 assert.equal(planParameterAutomation(patch.automation,patch,{start:0,end:1,unit:.125}).length,0);
});
test('gesture recording maps vocal and moved Freeform time into its authored lane and rejects inactive passages',()=>{
 for(const position of [null,NaN,17.5,34,99])
  assert.equal(automationRecordingStep(position,{start:18,length:16}),null);
 assert.equal(automationRecordingStep(21.25,{start:18,length:16}),3.25);
 assert.equal(automationRecordingStep(89.5,{start:80,length:16,sourceStep:32,limitStep:48}),41.5);
 assert.equal(automationRecordingStep(97,{start:80,length:24,sourceStep:32,limitStep:48}),null);
});
