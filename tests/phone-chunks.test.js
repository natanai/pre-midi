import test from "node:test";
import assert from "node:assert/strict";
import {create,validate} from "../schema.js";
import {createStudioSession} from "../studioSession.js";
import {eventsAtStep,phraseInstances,placementFor} from "../arrangement.js";

test("phone new Chunk is assigned to a free bar and plays its notes",()=>{
 const session=createStudioSession(create());
 const first=session.getChunk().id;
 assert.equal(session.addChunk(),true);
 const second=session.getChunk().id,inst=session.getInstrument();
 assert.notEqual(first,second);
 assert.equal(inst.timeline[1],second);
 session.dispatch({type:"note.add",note:{pitch:60,start:0,duration:2}});
 assert.equal(eventsAtStep(session.getBeat(),16).length,1);
 assert.equal(eventsAtStep(session.getBeat(),0).length,0);
 assert.deepEqual(validate(session.getBeat()),[]);
 assert.equal(session.undo(),true); // undo note
 assert.equal(session.undo(),true); // undo new chunk
 assert.equal(session.getInstrument().chunks.length,1);
 assert.equal(session.getInstrument().timeline[1],null);
});
test("phone duplicate Chunk keeps musical notes but uses fresh stable note identities",()=>{
 const session=createStudioSession(create());
 const a=session.dispatch({type:"note.add",note:{pitch:63,start:0,duration:3}}).noteId;
 assert.equal(session.addChunk({duplicate:true}),true);
 const copy=session.getChunk();
 assert.equal(copy.notes.length,1);
 assert.notEqual(copy.notes[0].id,a);
 assert.equal(copy.notes[0].pitch,63);
 assert.equal(session.getInstrument().timeline[1],copy.id);
 assert.deepEqual(validate(session.getBeat()),[]);
 assert.equal(session.renameChunk("New phrase"),true);
 assert.equal(session.getChunk().name,"New phrase");
});
test("Beat placements allow offsets and overlapping polymeter without flattening scores",()=>{
 const session=createStudioSession(create());
 const original=session.getChunk().id;
 assert.equal(session.setBarChunk(1,original),true);
 assert.equal(session.setBarPlacement(1,{offset:3,every:12,repeats:3,length:16}),true);
 session.dispatch({type:"note.add",note:{pitch:64,start:0,duration:1}});
 const beat=session.getBeat(),inst=session.getInstrument();
 assert.deepEqual(placementFor(inst,1),{offset:3,length:16,every:12,repeats:3});
 assert.equal([...phraseInstances(beat,inst)].filter(item=>item.bar===1).length,3);
 assert.equal(eventsAtStep(beat,19).length,1);
 assert.equal(eventsAtStep(beat,31).length,1);
 assert.deepEqual(validate(beat),[]);
 assert.equal(session.setBarChunk(1,null),true);
 assert.equal(inst.timeline[1],null);
 assert.equal(inst.placements[1],null);
 assert.equal(eventsAtStep(beat,19).length,0);
 assert.equal(session.undo(),true);
 assert.equal(session.getInstrument().timeline[1],original);
});
test("Chunk deleting releases assignments but never removes the last Chunk",()=>{
 const session=createStudioSession(create());
 assert.equal(session.removeChunk(),false);
 session.addChunk();
 const id=session.getChunk().id;
 assert.equal(session.removeChunk(),true);
 assert.equal(session.getInstrument().chunks.some(chunk=>chunk.id===id),false);
 assert.equal(session.getInstrument().timeline[1],null);
 assert.deepEqual(validate(session.getBeat()),[]);
});
