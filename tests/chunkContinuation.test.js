import test from "node:test";
import assert from "node:assert/strict";
import {create,makeChunk,id,validate,SUSTAIN_BEAT_VERSION} from "../schema.js";
import {eventsAtStep} from "../arrangement.js";
import {continueNoteFromEarlierChunk,continuationProposal,incomingChunkSustains,resizeIncomingSustain} from "../chunkContinuation.js";

const setup=()=>{
 const beat=create(),inst=beat.instruments[0],left=inst.chunks[0];
 left.notes=[{id:"origin",pitch:56,start:0,duration:16,velocity:.7}];
 const right=makeChunk("Following");
 right.notes=[{id:"retrigger",pitch:56,start:0,duration:16,velocity:.8}];
 inst.chunks.push(right);
 inst.timeline[1]=right.id;
 return {beat,inst,left,right};
};
test("whole-note drag beyond the keyboard eliminates one attack and extends the original note",()=>{
 const {beat,inst}=setup();
 assert.equal(eventsAtStep(beat,16).length,1);
 assert.deepEqual(continuationProposal(beat,{instrumentId:inst.id,bar:1,noteId:"retrigger",steps:-1}),
  {ok:true,pitch:56,relativeEnd:15,sourceBar:0,sourceNoteId:"origin"});
 const result=continueNoteFromEarlierChunk(beat,{instrumentId:inst.id,bar:1,noteId:"retrigger",steps:-1});
 assert.equal(result.changed,true);
 assert.equal(beat.version,SUSTAIN_BEAT_VERSION);
 assert.equal(inst.chunks[0].notes[0].duration,31);
 assert.equal(inst.chunks[1].notes.length,0);
 assert.equal(eventsAtStep(beat,0).length,1);
 assert.equal(eventsAtStep(beat,16).length,0,"no repeated note-on at the Chunk boundary");
 assert.deepEqual(validate(beat),[]);
 const incoming=incomingChunkSustains(beat,inst.id,1);
 assert.equal(incoming.length,1);
 assert.equal(incoming[0].start,-16);
 assert.equal(incoming[0].duration,31);
 assert.equal(incoming[0].continuation,true);
});
test("leftward move changes the note end but never adds a left-edge resize control",()=>{
 const {beat,inst}=setup();
 const result=continueNoteFromEarlierChunk(beat,{instrumentId:inst.id,bar:1,noteId:"retrigger",steps:-7});
 assert.equal(result.changed,true);
 assert.equal(inst.chunks[0].notes[0].duration,25);
 assert.equal(eventsAtStep(beat,16).length,0);
 assert.deepEqual(validate(beat),[]);
});
test("shared reusable Chunk occurrences are copy-on-written without changing later repeats",()=>{
 const {beat,inst,left,right}=setup();
 inst.timeline[2]=left.id;inst.timeline[3]=right.id;
 const originalLeft=id(),originalRight=id();
 const sourceOnsets=eventsAtStep(beat,32).length,targetOnsets=eventsAtStep(beat,48).length;
 const result=continueNoteFromEarlierChunk(beat,{instrumentId:inst.id,bar:1,noteId:"retrigger",steps:-1});
 assert.equal(result.changed,true);
 assert.notEqual(inst.timeline[0],inst.timeline[2]);
 assert.notEqual(inst.timeline[1],inst.timeline[3]);
 assert.equal(eventsAtStep(beat,32).length,sourceOnsets);
 assert.equal(eventsAtStep(beat,48).length,targetOnsets);
 assert.deepEqual(validate(beat),[]);
});
test("no prior held voice means no ghost sustain or silent note",()=>{
 const {beat,inst}=setup();
 inst.chunks[0].notes=[];
 const result=continueNoteFromEarlierChunk(beat,{instrumentId:inst.id,bar:1,noteId:"retrigger",steps:-1});
 assert.equal(result.changed,false);
 assert.match(result.reason,/No earlier held note/);
 assert.equal(eventsAtStep(beat,16).length,1);
 assert.equal(beat.version,7);
 assert.deepEqual(validate(beat),[]);
});
test("regular in-grid moves and the first bar never acquire continuation semantics",()=>{
 const {beat,inst}=setup();
 assert.equal(continuationProposal(beat,{instrumentId:inst.id,bar:1,noteId:"retrigger",steps:0}).ok,false);
 assert.equal(continuationProposal(beat,{instrumentId:inst.id,bar:0,noteId:"origin",steps:-1}).ok,false);
});
test("advanced placements are left unchanged rather than silently remapped",()=>{
 const {beat,inst}=setup();
 inst.placements[1]={offset:4,length:12,every:12,repeats:2};
 assert.equal(continueNoteFromEarlierChunk(beat,{instrumentId:inst.id,bar:1,noteId:"retrigger",steps:-1}).changed,false);
 assert.equal(eventsAtStep(beat,20).length,1);
 assert.deepEqual(validate(beat),[]);
});
test("a same-pitch new attack inside the tail is not deleted or folded",()=>{
 const {beat,inst,right}=setup();
 right.notes.push({id:"later",pitch:56,start:8,duration:4,velocity:.6});
 assert.equal(continuationProposal(beat,{instrumentId:inst.id,bar:1,noteId:"retrigger",steps:-1}).ok,false);
 assert.equal(right.notes.length,2);
 assert.deepEqual(validate(beat),[]); // The original two notes do not overlap.
});

test("right-edge resize can extend the held source through another Chunk without retrigger",()=>{
 const {beat,inst}=setup();
 const src=inst.chunks[0].notes[0];
 const grown=resizeIncomingSustain(beat,{instrumentId:inst.id,sourceBar:0,sourceNoteId:src.id,duration:37});
 assert.equal(grown.changed,true);
 assert.equal(beat.version,SUSTAIN_BEAT_VERSION);
 assert.equal(src.duration,37);
 assert.equal(incomingChunkSustains(beat,inst.id,1)[0].duration,37);
 assert.equal(eventsAtStep(beat,0).length,1);
 assert.deepEqual(validate(beat),[]);
});
test("tail resizing a reused origin preserves the other occurrence",()=>{
 const {beat,inst,left}=setup();
 inst.timeline[2]=left.id;
 const changed=resizeIncomingSustain(beat,{instrumentId:inst.id,sourceBar:0,sourceNoteId:"origin",duration:28});
 assert.equal(changed.changed,true);
 assert.notEqual(inst.timeline[0],inst.timeline[2]);
 assert.equal(eventsAtStep(beat,32)[0].note.duration,16);
 assert.equal(eventsAtStep(beat,0)[0].note.duration,28);
 assert.deepEqual(validate(beat),[]);
});
test("desktop Beat source permits native v25 sustain via a right edge without a left resize handle",async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 assert.match(source,/duration:\(original\?\.duration\?\?1\)\+steps\},\s*\{allowSustain:true\}/);
 assert.match(source,/upgradeBeatFeatures\(beat\)/);
 assert.match(source,/resizeIncomingSustain\(beat/);
});
