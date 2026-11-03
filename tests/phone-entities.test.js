import test from "node:test";
import assert from "node:assert/strict";
import {create,validate} from "../schema.js";
import {createStudioSession} from "../studioSession.js";
import {makePatch} from "../synth.js";

test("phone instrument deletion reuses canonical fallback and never leaves an invalid Beat",()=>{
 const session=createStudioSession(create());
 const first=session.getInstrument().id;
 assert.equal(session.addInstrument(),true);
 const second=session.getInstrument().id;
 assert.equal(session.removeInstrument(second),true);
 assert.equal(session.getBeat().instruments.length,1);
 assert.equal(session.getInstrument().id,first);
 assert.equal(session.undo(),true);
 assert.equal(session.getBeat().instruments.length,2);
 assert.equal(session.selectInstrument(first),true);
 assert.equal(session.removeInstrument(second),true);
 assert.equal(session.getInstrument().id,first);
 assert.equal(session.undo(),true);
 assert.equal(session.removeInstrument(second),true);
 assert.equal(session.removeInstrument(first),true);
 assert.equal(session.getBeat().instruments.length,1);
 assert.deepEqual(validate(session.getBeat()),[]);
});
test("phone pitch-to-Rack conversion and Rack-to-piano extraction preserve note events",()=>{
 const session=createStudioSession(create());
 const row=session.getInstrument().sounds[0],note=session.dispatch({type:"note.add",
  note:{pitch:row.referencePitch,start:2,duration:1,velocity:.8}}).noteId;
 assert.equal(session.convertSelectedToRack(),true);
 let inst=session.getInstrument();
 assert.equal(inst.layout,"rack");
 assert.equal(session.getChunk().notes[0].soundId,row.id);
 assert.equal(session.getChunk().notes[0].pitch,undefined);
 assert.equal(session.extractRackSound(row.id),true);
 inst=session.getInstrument();
 assert.equal(inst.layout,"pitched");
 assert.equal(session.getChunk().notes[0].pitch,row.referencePitch);
 assert.equal(session.getChunk().notes[0].soundId,undefined);
 assert.deepEqual(validate(session.getBeat()),[]);
 assert.equal(session.undo(),true);
 assert.equal(session.getInstrument().layout,"rack");
});
test("phone Rack row delete removes only its hits and sound rename is undoable",()=>{
 const session=createStudioSession(create());
 assert.equal(session.selectCatalogSound({name:"Kit",patch:makePatch("init"),mode:"add",
  sounds:[
   {id:"kick",name:"Kick",trigger:"hit",referencePitch:60,gain:1,patch:makePatch("init")},
   {id:"snare",name:"Snare",trigger:"hit",referencePitch:60,gain:1,patch:makePatch("init")}
  ]}),true);
 const rack=session.getInstrument(),kick=rack.sounds[0].id,snare=rack.sounds[1].id;
 session.dispatch({type:"note.add",note:{soundId:kick,start:0,duration:1}});
 session.dispatch({type:"note.add",note:{soundId:snare,start:4,duration:1}});
 assert.equal(session.renameSound(kick,"Deep kick"),true);
 assert.equal(session.getInstrument().sounds[0].name,"Deep kick");
 assert.equal(session.removeRackSound(kick),true);
 assert.equal(session.getInstrument().sounds.length,1);
 assert.equal(session.getChunk().notes.length,1);
 assert.equal(session.getChunk().notes[0].soundId,snare);
 assert.deepEqual(validate(session.getBeat()),[]);
 assert.equal(session.undo(),true);
 assert.equal(session.getInstrument().sounds.length,2);
});

test("phone can rename a Beat and resize its bar timeline across all Instruments",()=>{
 const session=createStudioSession(create());
 session.addInstrument();
 assert.equal(session.renameBeat("Evening Loop"),true);
 assert.equal(session.getBeat().title,"Evening Loop");
 assert.equal(session.setBeatBars(10),true);
 assert.equal(session.getBeat().bars,10);
 assert.ok(session.getBeat().instruments.every(inst=>inst.timeline.length===10&&inst.placements.length===10));
 assert.equal(session.setBeatBars(3),true);
 assert.deepEqual(validate(session.getBeat()),[]);
 assert.ok(session.getBeat().instruments.every(inst=>inst.timeline.length===3));
 assert.equal(session.undo(),true);
 assert.equal(session.getBeat().bars,10);
 assert.equal(session.setBeatBars(0),false);
});
