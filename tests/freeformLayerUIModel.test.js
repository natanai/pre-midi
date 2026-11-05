import test from "node:test";
import assert from "node:assert/strict";
import {layoutFreeformNoteRow,overlappingFreeformNotes} from "../freeformLayerUIModel.js";
import {createFreeform,addFreeformInstrument,addFreeformNote,validateFreeform} from "../freeformModel.js";
import {clone,id,makeInstrument,makeSound} from "../schema.js";
import {makePatch} from "../synth.js";
import {readFileSync} from "node:fs";

test("overlapping notes are exposed without altering intentional polyphony",()=>{
 const layer=createFreeform(),instrument=addFreeformInstrument(layer);
 const a=addFreeformNote(instrument,{id:"a",pitch:60,start:16,duration:28,velocity:.8});
 const b=addFreeformNote(instrument,{id:"b",pitch:60,start:24,duration:6,velocity:.6});
 addFreeformNote(instrument,{id:"c",pitch:62,start:24,duration:6,velocity:.9});
 const snapshot=clone(layer);
 assert.deepEqual(overlappingFreeformNotes(instrument,a).map(n=>n.id),["b"]);
 const layers=layoutFreeformNoteRow(instrument.notes.filter(n=>n.pitch===60));
 assert.equal(layers.get("a").voices,2);
 assert.notEqual(layers.get("a").slot,layers.get("b").slot);
 assert.deepEqual(layer,snapshot);
 assert.deepEqual(validateFreeform(layer),[]);
});

test("touching boundaries do not count as simultaneous notes",()=>{
 const inst=addFreeformInstrument(createFreeform());
 const notes=[
  {id:"a",pitch:60,start:0,duration:16,velocity:.8},
  {id:"b",pitch:60,start:16,duration:8,velocity:.7}
 ];
 for(const note of notes)addFreeformNote(inst,note);
 assert.deepEqual(overlappingFreeformNotes(inst,inst.notes[0]),[]);
 assert.equal(layoutFreeformNoteRow(inst.notes).get("b").voices,1);
});

test("dense overlapping notes remain present and independently addressable",()=>{
 const inst=addFreeformInstrument(createFreeform());
 for(let n=0;n<5;n++)addFreeformNote(inst,{
  id:"n"+n,pitch:60,start:10,duration:16,velocity:.5+n*.1
 });
 const before=clone(inst),layers=layoutFreeformNoteRow(inst.notes);
 assert.equal(layers.size,5);
 assert.ok([...layers.values()].every(x=>x.voices===5&&x.overflow));
 assert.equal(overlappingFreeformNotes(inst,inst.notes[0]).length,4);
 assert.deepEqual(inst,before);
});

test("Rack Sound identity, rather than pitch or simultaneous time, determines overlap",()=>{
 const layer=createFreeform();
 const rack=addFreeformInstrument(layer,makeInstrument(2,1,makeSound("Kick",makePatch(),"hit")));
 const first=rack.sounds[0].id,second=id();
 rack.sounds.push({...clone(rack.sounds[0]),id:second,name:"Snare"});
 const a=addFreeformNote(rack,{soundId:first,start:4,duration:4,velocity:.8});
 addFreeformNote(rack,{soundId:second,start:4,duration:4,velocity:.8});
 addFreeformNote(rack,{soundId:first,start:5,duration:4,velocity:.8});
 assert.equal(overlappingFreeformNotes(rack,a).length,1);
});

test("desktop editor renders clipped sustained tails and selectable layered notes",()=>{
 const ui=readFileSync(new URL("../freeformUI.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../freeform.css",import.meta.url),"utf8");
 assert.match(ui,/layoutFreeformNoteRow\(rowNotes\)/);
 assert.match(ui,/overlappingFreeformNotes\(instrument\(\),note\)/);
 assert.match(ui,/const visibleStart=Math\.max\(note\.start,viewStep\(\)\)/);
 assert.match(ui,/const visibleEnd=Math\.min\(note\.start\+note\.duration/);
 assert.match(ui,/\+ layer note/);
 assert.match(ui,/Choose overlapping freeform note/);
 assert.match(css,/\.freeform-roll-note\.layered/);
 assert.match(css,/\.freeform-layer-choice/);
});
