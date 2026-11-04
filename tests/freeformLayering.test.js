import test from "node:test";
import assert from "node:assert/strict";
import {clone,id,makeInstrument,makeSound} from "../schema.js";
import {makePatch} from "../synth.js";
import {createFreeform,addFreeformInstrument,addFreeformNote,addFreeformChunkPlacement,
 previewFreeformPassageLayering,moveFreeformPassage} from "../freeformModel.js";

const fixture=()=>{
 const layer=createFreeform(),inst=addFreeformInstrument(layer);
 const passage={id:id(),startStep:16,lengthSteps:16};
 layer.passages.push(passage);
 return {layer,inst,passage};
};

test("preview warns on matching pitched overlaps without preventing intentional layering",()=>{
 const {layer,inst,passage}=fixture();
 addFreeformNote(inst,{pitch:60,start:16,duration:8,velocity:.9,passageId:passage.id});
 addFreeformNote(inst,{pitch:60,start:24,duration:8,velocity:.8});
 addFreeformNote(inst,{pitch:64,start:24,duration:8,velocity:.8});
 const before=clone(layer);
 const noMove=previewFreeformPassageLayering(layer,passage.id,16);
 assert.equal(noMove.noteOverlapCount,0);
 const moved=previewFreeformPassageLayering(layer,passage.id,24,{
  beatClips:[{startStep:28,lengthSteps:16},{startStep:80,lengthSteps:16}]
 });
 assert.equal(moved.noteOverlapCount,1);
 assert.equal(moved.beatClipOverlapCount,1);
 assert.equal(moved.examples[0].startStep,24);
 assert.equal(moved.examples[0].endStep,32);
 assert.equal(moved.incomplete,false);
 assert.deepEqual(layer,before,"Preview is read-only and must not move the passage");
 moveFreeformPassage(layer,passage.id,24);
 assert.equal(inst.notes[0].start,24);
 assert.equal(inst.notes[1].start,24,"Stationary note remains independent");
});

test("overlaps with another pitch or different Instrument are not collisions",()=>{
 const {layer,inst,passage}=fixture();
 addFreeformNote(inst,{pitch:60,start:16,duration:6,velocity:.8,passageId:passage.id});
 addFreeformNote(inst,{pitch:64,start:24,duration:6,velocity:.8});
 const second=addFreeformInstrument(layer);
 addFreeformNote(second,{pitch:60,start:24,duration:6,velocity:.8});
 const result=previewFreeformPassageLayering(layer,passage.id,24);
 assert.equal(result.noteOverlapCount,0);
});

test("Chunk repetitions count sounding-note overlap, not just passage ranges",()=>{
 const {layer,inst,passage}=fixture();
 inst.chunks[0].notes=[{id:id(),pitch:72,start:12,duration:4,velocity:.8}];
 addFreeformChunkPlacement(inst,inst.chunks[0].id,16,{
  passageId:passage.id,length:16,repeats:2,every:16
 });
 addFreeformNote(inst,{pitch:72,start:36,duration:6,velocity:.8});
 // Move first onset to 36 and second to 52: overlap stationary 36–42 once.
 const result=previewFreeformPassageLayering(layer,passage.id,24);
 assert.equal(result.noteOverlapCount,1);
 assert.equal(result.examples[0].startStep,36);
 assert.equal(result.examples[0].endStep,40);
});

test("a rack collision requires the same Sound ID, not a coincident hit on another row",()=>{
 const layer=createFreeform();
 const rack=addFreeformInstrument(layer,
  makeInstrument(2,1,makeSound("Kick",makePatch(),"hit")));
 const soundId=rack.sounds[0].id,otherId=id();
 rack.sounds.push({...clone(rack.sounds[0]),id:otherId,name:"Snare"});
 const passage={id:id(),startStep:0,lengthSteps:16};layer.passages.push(passage);
 addFreeformNote(rack,{soundId,start:2,duration:2,velocity:.8,passageId:passage.id});
 addFreeformNote(rack,{soundId,start:18,duration:4,velocity:.8});
 addFreeformNote(rack,{soundId:otherId,start:18,duration:4,velocity:.8});
 assert.equal(previewFreeformPassageLayering(layer,passage.id,16).noteOverlapCount,1);
});

test("two notes moving together do not spuriously collide with one another",()=>{
 const {layer,inst,passage}=fixture();
 addFreeformNote(inst,{pitch:60,start:16,duration:9,velocity:.8,passageId:passage.id});
 addFreeformNote(inst,{pitch:60,start:20,duration:5,velocity:.8,passageId:passage.id});
 const result=previewFreeformPassageLayering(layer,passage.id,40);
 assert.equal(result.noteOverlapCount,0);
});

test("dense or invalid preview never asserts no overlap without a complete scan",()=>{
 const {layer,inst,passage}=fixture();
 for(let i=0;i<12;i++)addFreeformNote(inst,{
  pitch:60,start:16+i,duration:4,velocity:.8,passageId:passage.id
 });
 const limited=previewFreeformPassageLayering(layer,passage.id,32,{maxEvents:5});
 assert.equal(limited.incomplete,true);
 assert.throws(()=>previewFreeformPassageLayering(layer,"missing",32),/Missing freeform passage/);
 assert.throws(()=>previewFreeformPassageLayering(layer,passage.id,-1),/outside freeform/);
});
