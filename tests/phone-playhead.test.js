import test from "node:test";
import assert from "node:assert/strict";
import {create,makeChunk} from "../schema.js";
import {phonePlayheadX} from "../phone/rollPlayback.js";

test("phone cursor follows audio-clock fractions of the selected active Chunk",()=>{
 const beat=create(),inst=beat.instruments[0],chunk=inst.chunks[0];
 assert.equal(phonePlayheadX(beat,inst.id,chunk.id,{bar:0,step:0},42),62);
 assert.equal(phonePlayheadX(beat,inst.id,chunk.id,{bar:0,step:1.5},42),125);
 assert.equal(phonePlayheadX(beat,inst.id,chunk.id,{bar:0,step:8.25},30),309.5);
 assert.equal(phonePlayheadX(beat,inst.id,chunk.id,{bar:1,step:1},42),null,
  "Do not show a cursor over notes belonging to a different bar");
 assert.equal(phonePlayheadX(beat,inst.id,chunk.id,null,42),null);
 assert.equal(phonePlayheadX(beat,inst.id,chunk.id,{bar:0,step:0},0),null);
});

test("phone playback cursor accounts for placed phrases and alternate Chunks",()=>{
 const beat=create(),inst=beat.instruments[0],current=inst.chunks[0],other=makeChunk("Second");
 inst.chunks.push(other);
 inst.timeline[1]=other.id;
 assert.equal(phonePlayheadX(beat,inst.id,current.id,{bar:1,step:2},42),null);
 assert.equal(phonePlayheadX(beat,inst.id,other.id,{bar:1,step:2},42),146);
 // An offset placement should advance the cursor only when that Chunk is actually playing.
 inst.placements[1]={offset:4,length:10,every:16,repeats:1};
 assert.equal(phonePlayheadX(beat,inst.id,other.id,{bar:1,step:3.5},42),null);
 assert.equal(phonePlayheadX(beat,inst.id,other.id,{bar:1,step:5},42),104);
 assert.equal(phonePlayheadX(beat,inst.id,other.id,{bar:1,step:14.1},42),null);
});
