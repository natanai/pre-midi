import {vocalSeekEvents} from '../src/hosts/web/vocal-seek.js';
import {needsDynamics} from '../src/hosts/web/dynamics.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {create,parse,upgradeBeatFeatures} from '../schema.js';import {createSong} from '../songModel.js';import {parseSong} from '../songIO.js';import {validatePatch} from '../synth.js';
import {withInstance,moveProcessor,compileProcessingGraph} from '../src/dsp/processing-graph.js';import {withProcessorRemoved,withProcessorAdded,withProcessorBypass,validateProcessingChain} from '../src/dsp/processing-chain.js';
import {compileDynamics} from '../src/dsp/dynamics.js';import {processingFromPatch,applyProcessingToPatch} from '../recordedAudio.js';
import {runtimeModules} from '../scripts/prepare-pages.mjs';
test('dynamics instances share recall and lifecycle while retaining their post-level position',()=>{
 const beat=create(),patch=beat.instruments[0].sounds[0].patch;patch.chain=withInstance(patch,'compressor');patch.chain=withInstance(patch,'limiter');
 const stored=patch.chain.instances[0];stored.parameters.threshold=-24.3;assert.deepEqual(validatePatch(patch),[]);assert.deepEqual(patch.chain.order,['filter','drive']);assert.deepEqual(patch.chain.post,['compressor-1','limiter-1']);assert.equal(compileProcessingGraph(patch,48000),null);assert.equal(needsDynamics(beat),true);assert.equal(needsDynamics(create()),false);
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
 const modules=await runtimeModules(new URL('../',import.meta.url));assert.ok(modules.includes('src/hosts/web/dynamics-worklet.js'));assert.ok(modules.includes('src/dsp/dynamics-kernel.js'));assert.ok(modules.every(path=>!path.startsWith('tests/')));
});

test('dynamics-only vocal seeks restore history and bypassed/zero-mix Clips need no warm-up',()=>{
 const patch={chain:withInstance({},'gate')},song={kind:'song',bpm:120,recordings:[{id:'r',durationSeconds:2,trimSeconds:0}],tracks:[{kind:'vocal',clips:[{id:'c',recordingId:'r',startStep:0,lengthSteps:16,effects:patch}]}]},decoded=new Map([['r',{duration:2}]]);
 assert.equal(vocalSeekEvents(song,4,decoded).length,1);patch.chain.bypass=['gate-1'];assert.equal(vocalSeekEvents(song,4,decoded).length,0);patch.chain.bypass=[];patch.chain.mix={'gate-1':0};assert.equal(vocalSeekEvents(song,4,decoded).length,0);
});
