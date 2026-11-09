import test from 'node:test';
import assert from 'node:assert/strict';
import {create,parse,upgradeBeatFeatures} from '../schema.js';
import {createSong} from '../songModel.js';
import {parseSong} from '../songIO.js';
import {processingFromPatch,applyProcessingToPatch} from '../recordedAudio.js';
import {validatePatch} from '../synth.js';
import {soundCapability} from '../soundParameterAdapter.js';
import {withInstance,withParallelRoute,withRouteShare,moveProcessor,compileProcessingGraph} from '../src/dsp/processing-graph.js';
import {validateProcessingChain,withProcessorRemoved} from '../src/dsp/processing-chain.js';

test('processor instances retain independent values through presets, projects and vocal reuse',()=>{
 const beat=create(),patch=beat.instruments[0].sounds[0].patch;
 patch.chain=withInstance(patch,'filter');patch.chain=withInstance(patch,'filter');
 const [a,b]=patch.chain.instances;a.parameters.cutoff=200;b.parameters.cutoff=3000;
 assert.deepEqual(validatePatch(patch),[]);upgradeBeatFeatures(beat);
 assert.deepEqual(parse(JSON.stringify(beat)),beat);
 const song=createSong(beat);assert.deepEqual(parseSong(JSON.stringify(song)),song);
 const fx=processingFromPatch(patch),copy=structuredClone(patch);applyProcessingToPatch(copy,fx);
 assert.deepEqual(copy.chain,patch.chain);assert.equal(copy.chain.instances[0].parameters.cutoff,200);
 const changed=structuredClone(copy);changed.chain.instances[0].parameters.cutoff=700;
 assert.equal(changed.chain.instances[1].parameters.cutoff,3000);assert.equal(patch.chain.instances[0].parameters.cutoff,200);
});
test('parallel paths have unique processors and bounded editable shares',()=>{
 const patch={chain:{version:1,order:[],bypass:[]}};
 patch.chain=withInstance(patch,'drive');patch.chain=withParallelRoute(patch);
 patch.chain=moveProcessor(patch.chain,'drive-1','route-1');patch.chain=withRouteShare(patch.chain,'dry',.4);
 assert.deepEqual(validateProcessingChain(patch.chain),[]);
 const compiled=compileProcessingGraph(patch,48000);
 assert.equal(compiled.latency,192);assert.equal(compiled.dry,.4);assert.equal(compiled.branches[0].gain,.6);
 assert.deepEqual(compiled.order,[]);assert.deepEqual(compiled.branches[0].order,[0]);
 const repeated=structuredClone(patch.chain);repeated.order.push('drive-1');assert.ok(validateProcessingChain(repeated).length);
 const excessive=structuredClone(patch.chain);excessive.dry=.8;assert.ok(validateProcessingChain(excessive).length);
 const removed=withProcessorRemoved(patch,'drive-1');assert.deepEqual(removed.parallel[0].order,[]);assert.equal(removed.instances.length,1);
});
test('muted parallel routes can be rebalanced without overshooting unity',()=>{
 let chain={version:1,order:[],bypass:[],parallel:[{id:'a',gain:0,order:[]},{id:'b',gain:0,order:[]}],dry:1};
 chain=withRouteShare(chain,'dry',.2);assert.deepEqual(validateProcessingChain(chain),[]);
 assert.equal(chain.parallel[0].gain,.4);assert.equal(chain.parallel[1].gain,.4);
});
test('primary processor controls remain active when moved into parallel routes',()=>{
 const patch={type:'synth',filter:{type:'lowpass',cutoff:2000,resonance:.7},chain:{version:1,order:[],bypass:[],parallel:[{id:'a',gain:1,order:['filter']}]}};
 assert.equal(soundCapability(patch,['filter','cutoff']).state,'implemented');
 patch.chain.parallel[0].gain=0;assert.equal(soundCapability(patch,['filter','cutoff']).state,'inactive');
});
test('processor topology rejects invalid types, poles, dangling routes and unknown data',()=>{
 const patch={};const chain=withInstance(patch,'eq');
 const invalid=structuredClone(chain);delete invalid.instances[0].parameters;assert.ok(validateProcessingChain(invalid).length);
 const dangling=structuredClone(chain);dangling.order.push('missing');assert.ok(validateProcessingChain(dangling).length);
 const extra=structuredClone(chain);extra.instances[0].parameters.noise=1;assert.ok(validateProcessingChain(extra).length);
});
