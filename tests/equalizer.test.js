import test from 'node:test';import assert from 'node:assert/strict';
import {defaultEq,eqCoefficients,eqMagnitude,EQ_TYPES,validateEq} from '../src/dsp/equalizer.js';
import {makePatch,validatePatch} from '../synth.js';import {processingFromPatch,applyProcessingToPatch} from '../recordedAudio.js';
import {processingFlags,withProcessorAdded,validateProcessingChain} from '../src/dsp/processing-chain.js';
import {create,parse} from '../schema.js';
test('four-band EQ has analytical bell gain, neutral/bypass identity and bounded stable poles',()=>{
 const eq=defaultEq();assert.deepEqual(validateEq(eq),[]);assert.equal(eqMagnitude(eq,1000),1);
 for(const gain of [-24,-6,6,24]){eq.bands[1]={...eq.bands[1],enabled:true,type:'bell',frequency:1000,gain};assert.ok(Math.abs(20*Math.log10(eqMagnitude(eq,1000))-gain)<1e-8);}
 for(const rate of [8000,44100,192000])for(const type of EQ_TYPES)for(const frequency of [20,1000,20000])for(const q of [.1,18]){
  const c=eqCoefficients({enabled:true,type,frequency,q,gain:24},rate);assert.ok(c.every(Number.isFinite));assert.ok(Math.abs(c[4])<1&&1+c[3]+c[4]>0&&1-c[3]+c[4]>0);
 }
 assert.ok(validateEq({...eq,bands:Array(9).fill(eq.bands[0])}).length);
});
test('EQ and filter slopes preserve one shared portable processing configuration',()=>{
 const patch=makePatch();patch.eq=defaultEq();patch.eq.bands[1]={...patch.eq.bands[1],enabled:true,gain:6};patch.chain=withProcessorAdded(patch,'eq');patch.filterStages=4;
 assert.deepEqual(validatePatch(patch),[]);assert.deepEqual(validateProcessingChain(patch.chain),[]);
 const fx=processingFromPatch(patch),copy=applyProcessingToPatch(makePatch(),fx);assert.deepEqual(copy.eq,patch.eq);assert.equal(copy.filterStages,4);
 const beat=create();beat.instruments[0].sounds[0].patch=copy;assert.deepEqual(parse(JSON.stringify(beat)),beat);
 for(const order of [['eq','filter','drive'],['filter','eq','drive'],['filter','drive','eq'],['drive','eq','filter']])assert.equal((processingFlags({chain:{version:1,order,bypass:[]}})>>3)&3,order.indexOf('eq')+1);
});

test('equalizer bands expand and remove without renaming surviving bands',async()=>{
 const {addEqBand,removeEqBand}=await import('../src/dsp/equalizer.js');let eq=defaultEq();const first=structuredClone(eq.bands[0]);for(let i=0;i<4;i++)eq=addEqBand(eq);assert.equal(eq.bands.length,8);assert.deepEqual(validateEq(eq),[]);assert.equal(addEqBand(eq),eq);eq=removeEqBand(eq,eq.bands[2].id);assert.deepEqual(eq.bands[0],first);eq=addEqBand(eq);assert.equal(new Set(eq.bands.map(b=>b.id)).size,8);
});
