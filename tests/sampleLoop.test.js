import test from 'node:test';import assert from 'node:assert/strict';
import {sampleLoopRegion,sampleLoopFrames,sampleLife,validateSampleLoop} from '../src/dsp/sample-loop.js';
import {sampleSourceRequest} from '../src/dsp/source-processing.js';
import {sampleZoneWithRegion} from '../sampleSlice.js';
import {validatePatch} from '../synth.js';
import {planNativeSample,encodeNativeSample} from '../src/hosts/native/sample-plan.js';
const zone={assetId:'voice',root:60,startSeconds:2,durationSeconds:3,loop:{start:2.5,end:4.5,crossfade:.2}},patch={type:'sample',presetId:'custom',zones:[zone],followPitch:false,oneShot:false,transpose:0,gain:1,attack:.01,release:.2,pan:0},note={pitch:60,velocity:1};
test('sustain loop extends a held note and preserves a finite key-off release; one-shot retains its source length',()=>{
 assert.deepEqual(validatePatch(patch),[]);const request=sampleSourceRequest(patch,note,zone,10);
 const loop=sampleLoopRegion(zone,request);assert.deepEqual(loop,zone.loop);assert.equal(sampleLife(patch,3,12,loop),12.2);
 assert.equal(sampleLife({...patch,oneShot:true},3,12,null),3);assert.equal(sampleLoopRegion(zone,request,true),null);
 const plan=planNativeSample({patch,volume:1},note,1,12,new Map([['voice',{id:1,duration:10,normalization:1}]]));
 assert.equal(plan.duration,12.2);assert.equal(plan.off,13);assert.deepEqual(plan.loop,zone.loop);
 const wire=new DataView(encodeNativeSample(plan,48000).buffer);assert.equal(wire.getUint32(12,true),23);assert.equal(wire.getUint32(wire.byteLength-28,true),1);
});
test('loop clocks follow crop, time stretch and reverse without changing musical release timing',()=>{
 const changed={...patch,sourceProcessing:{mode:'independent',time:1.5,reverse:true},transpose:7};
 const req=sampleSourceRequest(changed,note,zone,10),loop=sampleLoopRegion(zone,req);
 assert.equal(loop.start,.75);assert.equal(loop.end,3.75);assert.ok(Math.abs(loop.crossfade-.3)<1e-12);
 assert.deepEqual(sampleLoopFrames(loop,24000),{start:18000,end:90000,fade:7200,resume:25200});
 assert.throws(()=>sampleZoneWithRegion(zone,3,5,10),/Loop points/);
});
test('untrusted loop ranges, excessive crossfades and source-overrun fail visibly',()=>{
 for(const value of [null,{start:1,end:2,crossfade:0},{start:3,end:6,crossfade:0},{start:3,end:4,crossfade:.6},{start:3,end:4,crossfade:-1},{start:NaN,end:4,crossfade:0},{start:3,end:4,crossfade:0,unknown:1}])assert.ok(validateSampleLoop({...zone,loop:value}));
 const raw={assetId:'voice',root:60,loop:{start:0,end:2,crossfade:0}},req=sampleSourceRequest({...patch,zones:[raw]},note,raw,1);assert.throws(()=>sampleLoopRegion(raw,req),/beyond/);
});
