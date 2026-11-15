import {waveformFadeRange} from "../waveformFades.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleZoneWithRegion,sampleSourceRegion} from '../sampleSlice.js';
test('sample region transaction retains source mapping and rate-independent source bounds',()=>{
 const zone={assetId:'take',root:60,velocity:.7};
 const crop=sampleZoneWithRegion(zone,12.25,15.75,30);
 assert.deepEqual(crop,{...zone,startSeconds:12.25,durationSeconds:3.5});
 assert.deepEqual(zone,{assetId:'take',root:60,velocity:.7});
 assert.deepEqual(sampleSourceRegion(crop,30,2),{offset:12.25,sourceLength:3.5,length:1.75});
 for(const [start,end] of [[-1,2],[3,2],[0,4.01],[29,31],[0,.01],[NaN,3]])assert.throws(()=>sampleZoneWithRegion(zone,start,end,30));
});

test('fades map from playback time to the cropped source in either direction',()=>{
 const config={type:'vocal',attack:.15,release:.8,sourcePerSecond:.5,limit:1};
 const forward=waveformFadeRange(1,3,config);
 assert.deepEqual(forward.attack,{base:1,sign:1,limit:.5,value:.15,lead:0});
 assert.deepEqual(forward.release,{base:1.5,sign:-1,limit:.5,value:.5,lead:0});
 const reverse=waveformFadeRange(1,3,{...config,reverse:true});
 assert.equal(reverse.attack.base,3);
 assert.equal(reverse.attack.sign,-1);
 assert.equal(reverse.release.base,2.5);
 assert.equal(reverse.release.sign,1);
 const oneShot=waveformFadeRange(0,1,{...config,type:'sample',oneShot:true,sourcePerSecond:1});
 assert.equal(oneShot.attack.lead,.001);
 assert.equal(oneShot.release.value,.8);
});
