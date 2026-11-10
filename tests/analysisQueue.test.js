import test from 'node:test';import assert from 'node:assert/strict';import {createAnalysisQueue} from '../src/hosts/analysis-queue.js';
test('superseded analysis snapshots never fill native preparation queues and a failed render does not block the latest',async()=>{
 const run=createAnalysisQueue(),calls=[];let release,revision=0;const gate=new Promise(resolve=>release=resolve);
 const first=run(()=>true,async()=>{calls.push('first');await gate;return 1;});await Promise.resolve();
 const stale=Array.from({length:12},(_,i)=>run(()=>revision===i,async()=>{calls.push(i);return i;}));revision=12;
 const latest=run(()=>revision===12,async()=>{calls.push('latest');return 12;});assert.deepEqual(calls,['first']);release();await first;assert.ok((await Promise.all(stale)).every(v=>v===null));assert.equal(await latest,12);assert.deepEqual(calls,['first','latest']);
 await assert.rejects(run(()=>true,()=>{throw Error('failed');}),/failed/);assert.equal(await run(()=>true,()=>13),13);
});
