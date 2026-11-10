import {vocalSeekEvents} from '../src/hosts/web/vocal-seek.js';
import {needsPostProcessing} from '../src/hosts/web/post-processing.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {create,parse,upgradeBeatFeatures} from '../schema.js';import {createSong} from '../songModel.js';import {parseSong} from '../songIO.js';import {validatePatch} from '../synth.js';
import {withInstance,moveProcessor,compileProcessingGraph} from '../src/dsp/processing-graph.js';import {withProcessorRemoved,withProcessorAdded,withProcessorBypass,validateProcessingChain} from '../src/dsp/processing-chain.js';
import {compileDynamics} from '../src/dsp/dynamics.js';import {processingFromPatch,applyProcessingToPatch} from '../recordedAudio.js';
import {runtimeModules} from '../scripts/prepare-pages.mjs';
import {DynamicsKernel} from '../src/dsp/dynamics-kernel.js';
test('dynamics instances share recall and lifecycle while retaining their post-level position',()=>{
 const beat=create(),patch=beat.instruments[0].sounds[0].patch;patch.chain=withInstance(patch,'compressor');patch.chain=withInstance(patch,'limiter');
 const stored=patch.chain.instances[0];stored.parameters.threshold=-24.3;assert.deepEqual(validatePatch(patch),[]);assert.deepEqual(patch.chain.order,['filter','drive']);assert.deepEqual(patch.chain.post,['compressor-1','limiter-1']);assert.equal(compileProcessingGraph(patch,48000),null);assert.equal(needsPostProcessing(beat),true);assert.equal(needsPostProcessing(create()),false);
 upgradeBeatFeatures(beat);assert.deepEqual(parse(JSON.stringify(beat)),beat);const song=createSong(beat);assert.deepEqual(parseSong(JSON.stringify(song)),song);
 const fx=processingFromPatch(patch),other=structuredClone(patch);applyProcessingToPatch(other,fx);assert.deepEqual(other.chain,patch.chain);other.chain.instances[0].parameters.threshold=-12;assert.equal(stored.parameters.threshold,-24.3);
 patch.chain=withProcessorRemoved(patch,'compressor-1');assert.equal(compileDynamics(patch).length,1);patch.chain=withProcessorAdded(patch,'compressor-1');assert.deepEqual(patch.chain.post,['limiter-1','compressor-1']);assert.equal(patch.chain.instances[0].parameters.threshold,-24.3);
 patch.chain=withProcessorBypass(patch,'compressor-1',true);assert.equal(compileDynamics(patch).length,1);patch.chain=withProcessorBypass(patch,'compressor-1',false);patch.chain.mix={'limiter-1':0};assert.equal(compileDynamics(patch)[0].kind,'compressor');
});
test('malformed parameters and routing cannot silently put dynamics before articulation',()=>{
 const patch={};patch.chain=withInstance(patch,'gate');assert.deepEqual(validateProcessingChain(patch.chain),[]);
 assert.throws(()=>moveProcessor(patch.chain,'gate-1','serial'),/after level/);
 for(const value of [-1,NaN,Infinity,9]){const chain=structuredClone(patch.chain);chain.instances[0].parameters.hold=value;assert.ok(validateProcessingChain(chain).length);}
 const wrong=structuredClone(patch.chain);wrong.order.push(wrong.post.pop());assert.ok(validateProcessingChain(wrong).length);
 const reserved=structuredClone(patch.chain);reserved.parallel=[{id:'post',gain:1,order:[]}];assert.ok(validateProcessingChain(reserved).length);
 for(let i=0;i<3;i++)patch.chain=withInstance(patch,'gate');assert.throws(()=>withInstance(patch,'gate'),/four/);
 const old=structuredClone(patch);old.chain=withProcessorRemoved(old,'gate-1');old.chain=withInstance(old,'limiter');assert.throws(()=>withProcessorAdded(old,'gate-1'),/four/);
});
test('published dependency closure includes the worklet and its versioned numerical dependency',async()=>{
 const modules=await runtimeModules(new URL('../',import.meta.url));assert.ok(modules.includes('src/hosts/web/post-worklet.js'));assert.ok(modules.includes('src/dsp/dynamics-kernel.js'));assert.ok(modules.every(path=>!path.startsWith('tests/')));
});

test('dynamics-only vocal seeks restore history and bypassed/zero-mix Clips need no warm-up',()=>{
 const patch={chain:withInstance({},'gate')},song={kind:'song',bpm:120,recordings:[{id:'r',durationSeconds:2,trimSeconds:0}],tracks:[{kind:'vocal',clips:[{id:'c',recordingId:'r',startStep:0,lengthSteps:16,effects:patch}]}]},decoded=new Map([['r',{duration:2}]]);
 assert.equal(vocalSeekEvents(song,4,decoded).length,1);patch.chain.bypass=['gate-1'];assert.equal(vocalSeekEvents(song,4,decoded).length,0);patch.chain.bypass=[];patch.chain.mix={'gate-1':0};assert.equal(vocalSeekEvents(song,4,decoded).length,0);
});
test('de-esser survives shared project/recorded reuse and rejects malformed band controls',()=>{
 const beat=create(),patch=beat.instruments[0].sounds[0].patch;patch.chain=withInstance(patch,'deesser');
 const params=patch.chain.instances[0].parameters;params.frequency=6200;params.bandwidth=.7;params.amount=12;
 assert.deepEqual(validatePatch(patch),[]);upgradeBeatFeatures(beat);assert.deepEqual(parse(JSON.stringify(beat)),beat);
 const fx=processingFromPatch(patch),other=structuredClone(patch);applyProcessingToPatch(other,fx);assert.deepEqual(compileDynamics(other),compileDynamics(patch));
 for(const [key,value]of [['frequency',0],['bandwidth',0],['amount',25]]){const bad=structuredClone(patch);bad.chain.instances[0].parameters[key]=value;assert.ok(validatePatch(bad).length);}
});
test('de-esser cuts a selected tone to the authored amount while retaining bass and stereo linking',()=>{
 const patch={chain:withInstance({},'deesser')},recipe=compileDynamics(patch)[0];
 Object.assign(recipe,{frequency:6000,bandwidth:1,threshold:-96,amount:12,attack:0,release:.1});
 const measure=frequency=>{
  const kernel=new DynamicsKernel(recipe,48000),frame=new Float32Array(2);let real=0,imaginary=0;
  for(let i=0;i<96000;i++){
   const phase=2*Math.PI*frequency*i/48000,input=Math.fround(.5*Math.sin(phase));frame[0]=input;frame[1]=-input*.5;kernel.process(frame);
   assert.ok(frame[1]===-frame[0]*.5);
   if(i>=48000){real+=frame[0]*Math.cos(phase);imaginary+=frame[0]*Math.sin(phase);}
  }
  return 20*Math.log10(2*Math.hypot(real,imaginary)/48000/.5);
 };
 assert.ok(Math.abs(measure(6000)+12)<.02);assert.ok(Math.abs(measure(200))<.02);
 recipe.amount=0;const dry=new DynamicsKernel(recipe,48000),frame=new Float32Array([.37,-.2]),before=frame.slice();dry.process(frame);assert.deepEqual(frame,before);
 for(const rate of [8000,48000,192000])for(const frequency of [1000,14000])for(const bandwidth of [.1,3]){
  const kernel=new DynamicsKernel({...recipe,frequency,bandwidth,amount:24},rate),v=new Float32Array(2);
  for(let i=0;i<4096;i++){v[0]=i===0?1:0;v[1]=-.5*v[0];kernel.process(v);assert.ok(v.every(n=>Number.isFinite(n)&&Math.abs(n)<2));}
 }
});
