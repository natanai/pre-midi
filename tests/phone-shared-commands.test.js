import test from "node:test";
import assert from "node:assert/strict";
import {create,clone,validate} from "../schema.js";
import {createSong,validateSong} from "../songModel.js";
import {applyNoteCommand,NOTE_COMMAND_TYPES} from "../studioCommands.js";
import {createStudioSession} from "../studioSession.js";

const make=()=>{const doc=create();doc.id="beat-fixture";const inst=doc.instruments[0];inst.id="inst-fixture";inst.chunks[0].id="chunk-fixture";return doc;};
const add={type:"note.add",note:{id:"note-fixture",pitch:60,start:2,duration:3,velocity:.9}};
const actions=[add,{type:"note.move",noteId:"note-fixture",start:4,pitch:62},
 {type:"note.resize",noteId:"note-fixture",duration:5},
 {type:"note.level",noteId:"note-fixture",velocity:.7},
 {type:"note.bend",noteId:"note-fixture",bend:{shape:"straight",amount:0,rate:1}}];

test("desktop command seam and headless phone session produce identical Beat documents",()=>{
 const desktop=make(),phone=createStudioSession(desktop);
 for(const command of actions){
  const direct=applyNoteCommand(desktop.instruments[0].chunks[0],command);
  const session=phone.dispatch(command);
  assert.equal(session.changed,direct.changed,command.type);
  assert.deepEqual(phone.getBeat(),desktop);
  assert.deepEqual(validate(desktop),[]);
 }
 const deleted={type:"note.delete",noteId:"note-fixture"};
 assert.equal(applyNoteCommand(desktop.instruments[0].chunks[0],deleted).changed,true);
 assert.equal(phone.dispatch(deleted).changed,true);
 assert.deepEqual(phone.getBeat(),desktop);
 assert.equal(NOTE_COMMAND_TYPES.length,6);
});
test("invalid and colliding commands do not mutate or generate history",()=>{
 const session=createStudioSession(make());
 assert.equal(session.dispatch(add).changed,true);
 assert.equal(session.dispatch({...add,note:{...add.note,id:"collision",start:3}}).changed,false);
 assert.equal(session.dispatch({type:"note.add",note:{pitch:95,start:15,duration:3}}).changed,false);
 assert.equal(session.dispatch({type:"note.move",noteId:"note-fixture",start:NaN,pitch:60}).changed,false);
 assert.equal(session.getChunk().notes.length,1);
 assert.deepEqual(validate(session.getBeat()),[]);
});
test("gesture preview commits exactly once; cancellation and undo restore state",()=>{
 let writes=0;
 const session=createStudioSession(make(),()=>writes++);
 session.beginPreview();session.applyPreview(add);
 session.applyPreview({type:"note.resize",noteId:"note-fixture",duration:7});
 assert.equal(session.finishPreview(),true);assert.equal(writes,1);
 const saved=clone(session.getDocument());
 session.beginPreview();session.applyPreview({type:"note.move",noteId:"note-fixture",start:5,pitch:65});
 session.finishPreview(true);
 assert.deepEqual(session.getDocument(),saved);
 assert.equal(writes,1);
 assert.equal(session.undo(),true);assert.equal(session.getChunk().notes.length,0);
 assert.equal(session.redo(),true);assert.deepEqual(session.getDocument(),saved);
});
test("Rack hit editing uses sound identity and rejects duplicate hits at the same step",()=>{
 const score=make(),inst=score.instruments[0],sound=inst.sounds[0];
 inst.layout="rack";sound.trigger="hit";
 const session=createStudioSession(score);
 const hit={type:"note.add",note:{id:"hit-1",soundId:sound.id,start:4,duration:1}};
 assert.equal(session.dispatch(hit).changed,true);
 assert.equal(session.dispatch({type:"note.add",note:{id:"hit-2",soundId:sound.id,start:4,duration:1}}).changed,false);
 assert.equal(session.dispatch({type:"note.move",noteId:"hit-1",start:6}).changed,true);
 assert.deepEqual(validate(session.getBeat()),[]);
});
test("Song commands retain Song, Track and Clip identity",()=>{
 const original=createSong(make()),session=createStudioSession(original),before=clone(session.getDocument());
 assert.equal(session.dispatch(add).changed,true);
 assert.equal(session.getDocument().kind,"song");
 assert.equal(session.getDocument().id,before.id);
 assert.deepEqual(session.getDocument().tracks,before.tracks);
 assert.deepEqual(validateSong(session.getDocument()),[]);
});
test("new Instrument is a valid undoable cross-host operation",()=>{
 const session=createStudioSession(make());
 assert.equal(session.addInstrument(),true);assert.equal(session.getBeat().instruments.length,2);
 assert.equal(session.undo(),true);assert.equal(session.getBeat().instruments.length,1);
 assert.equal(session.redo(),true);assert.equal(session.getBeat().instruments.length,2);
});
