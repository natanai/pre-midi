import test from "node:test";
import assert from "node:assert/strict";
import {VoiceAllocator} from "../src/dsp/voice-allocator.js";
import {delayTailSeconds} from "../src/dsp/effect-tail.js";
test("voice stealing prefers released voices, then oldest held voice with stable ties",()=>{
 const pool=new VoiceAllocator(2);
 const first=pool.admit({start:0,release:3,end:4});
 const released=pool.admit({start:.1,release:.2,end:4});
 const next=pool.admit({start:.5,release:3,end:4});
 assert.deepEqual(next.steals,[{id:released.id,at:.5}]);
 const last=pool.admit({start:.6,release:3,end:4});
 assert.deepEqual(last.steals,[{id:first.id,at:.6}]);
 assert.equal(pool.activeAt(.6),2);
 pool.prune(4);assert.equal(pool.records.length,0);
});
test("future strums and out-of-order requests cannot overbook the voice budget",()=>{
 const pool=new VoiceAllocator(1);
 const later=pool.admit({start:2,release:3,end:4});
 const earlier=pool.admit({start:1,release:2,end:5});
 assert.deepEqual(earlier.steals,[{id:later.id,at:2}]);
 for(const time of [1,1.5,2,3,4])assert.equal(pool.activeAt(time),1);
});
test("vocal priority survives a lower-priority held note under pressure",()=>{
 const pool=new VoiceAllocator(2);
 const vocal=pool.admit({start:0,release:10,end:10,priority:1});
 const synth=pool.admit({start:0,release:10,end:10});
 const incoming=pool.admit({start:1,release:2,end:3});
 assert.deepEqual(incoming.steals,[{id:synth.id,at:1}]);
 assert.equal(pool.records.find(x=>x.id===vocal.id).end,10);
});
test("randomized interval reservations remain deterministic and within budget",()=>{
 const run=()=>{
  const pool=new VoiceAllocator(8);let seed=71;const decisions=[];
  for(let i=0;i<300;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const start=(seed%1000)/100,release=start+.1+(seed%70)/100,end=release+.3;
   decisions.push(pool.admit({start,release,end}));
  }
  for(const record of pool.records)for(const time of [record.start,record.end-.00001])
   assert.ok(pool.activeAt(time)<=8);
  return decisions;
 };
 assert.deepEqual(run(),run());
});
test("tail duration follows feedback rather than a fixed timeout",()=>{
 assert.equal(delayTailSeconds({delayMix:0,delayTime:1,delayFeedback:.8}),0);
 const long=delayTailSeconds({delayMix:1,delayTime:1,delayFeedback:.8});
 assert.ok(long>40&&long<60);
 assert.equal(delayTailSeconds({delayMix:1,delayTime:1,delayFeedback:0}),1.02);
 assert.throws(()=>new VoiceAllocator(0));
});

test("incoming low-priority voice cannot evict a full pool of higher-priority vocals",()=>{
 const pool=new VoiceAllocator(2);
 pool.admit({start:0,release:5,end:5,priority:1});pool.admit({start:0,release:5,end:5,priority:1});
 const before=structuredClone(pool.records),incoming=pool.admit({start:1,release:2,end:3,priority:0});
 assert.equal(incoming.status,"rejected");assert.equal(incoming.id,null);assert.deepEqual(incoming.steals,[]);
 assert.deepEqual(pool.records,before);assert.equal(pool.rejected,1);assert.equal(pool.stolen,0);assert.equal(pool.admitted,2);
});
test("future priority conflict rolls back earlier candidate steals atomically",()=>{
 const pool=new VoiceAllocator(1);
 pool.admit({start:0,release:.5,end:1,priority:0});pool.admit({start:2,release:4,end:5,priority:1});
 const before=structuredClone(pool.records);
 assert.equal(pool.admit({start:.2,release:4,end:6,priority:0}).status,"rejected");
 assert.deepEqual(pool.records,before);assert.equal(pool.stolen,0);
 const high=pool.admit({start:.2,release:4,end:6,priority:2});
 assert.equal(high.status,"admitted");assert.equal(high.steals.length,2);
});
