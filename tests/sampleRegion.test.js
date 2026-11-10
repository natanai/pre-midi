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
