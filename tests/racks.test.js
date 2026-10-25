import test from "node:test";
import assert from "node:assert/strict";
import {create,makeInstrument,makeSound,makeChunk,id,clone,parse,validate} from "../schema.js";
import {selectionOperation,resolveEvent,referencedSampleIds,canConvertToRack,MAX_SOUNDS,MAX_EVENTS} from "../soundModel.js";
import {makePatch,PRESETS} from "../synth.js";
import {SAMPLE_LIBRARY,makeSamplerPatch} from "../samples.js";
import {usedSampleIds,makeSampleAsset} from "../sampler.js";
import {stepEvents} from "../audio.js";
import {exportProject,importProject} from "../packageIO.js";
import {encodeMonoWav} from "../recording.js";
const hit=(sound,start=0)=>({id:id(),soundId:sound.id,start,duration:1,velocity:.8});
const rackScore=()=>{
 const score=create();
 const rack=makeInstrument(1,score.bars,makeSound("Kick",makePatch("pulse-kick"),"hit"));
 rack.sounds.push(makeSound("Snare",makePatch("static-snare"),"hit"));
 rack.chunks[0].notes=rack.sounds.map(sound=>hit(sound));score.instruments=[rack];return score;
};
const legacy=score=>{
 const old=clone(score);old.version=5;
 for(const inst of old.instruments){inst.patch=inst.sounds[0].patch;delete inst.sounds;delete inst.layout;}
 return old;
};
test("one selection resolver covers all context rules and Add Instrument overrides",()=>{
 for(const [layout,trigger,add,expected] of [
  ["pitched","pitched",false,"replace-pitched"],["pitched","hit",false,"create-rack"],
  ["rack","hit",false,"append-rack"],["rack","pitched",false,"create-pitched"],
  ["rack","hit",true,"create-rack"],["pitched","pitched",true,"create-pitched"],
  ["rack","pitched",true,"create-pitched"],["pitched","hit",true,"create-rack"]
 ])assert.equal(selectionOperation(layout,trigger,add),expected);
 assert.throws(()=>selectionOperation("rack","unknown"),/note or a hit/);
 // Bell is pitched even though it shares the percussion category with synth hits.
 assert.equal(PRESETS.find(item=>item.id==="signal-bell").trigger,"pitched");
 assert.equal(PRESETS.find(item=>item.id==="pulse-kick").trigger,"hit");
 for(const item of [...PRESETS,...SAMPLE_LIBRARY])assert.ok(["hit","pitched"].includes(item.trigger));
});
test("rack sound identity survives renaming, reordering, inserted rows, and JSON roundtrip",()=>{
 const score=rackScore(),rack=score.instruments[0],original=rack.sounds[0];
 const notes=clone(rack.chunks[0].notes);
 rack.sounds.reverse();rack.sounds.unshift(makeSound("Hat",makePatch("dust-hat"),"hit"));original.name="Big kick";
 assert.deepEqual(rack.chunks[0].notes,notes);
 assert.equal(resolveEvent(rack,notes[0]).sound,original);
 assert.equal(resolveEvent(rack,notes[0]).note.pitch,original.referencePitch);
 assert.deepEqual(validate(score),[]);
 assert.deepEqual(parse(JSON.stringify(score)),score);
 assert.equal(stepEvents(score,0).length,2);
 assert.equal(stepEvents(score,score.bars*16).length,2);
});
test("each sound retains its complete independent patch, level, and rack master gain",()=>{
 const score=rackScore(),rack=score.instruments[0];
 rack.volume=.5;rack.sounds[0].gain=.4;
 rack.sounds[0].patch.envelope.attack=.2;
 rack.sounds[0].patch.pan=-.7;rack.sounds[1].patch.pan=.8;
 assert.notEqual(rack.sounds[1].patch.envelope.attack,.2);
 assert.equal(resolveEvent(rack,rack.chunks[0].notes[0]).voice.volume,.2);
 assert.equal(resolveEvent(rack,rack.chunks[0].notes[1]).voice.patch.pan,.8);
 assert.deepEqual(validate(score),[]);
});
test("rack schema rejects missing sound references, duplicate steps, fake MIDI rows, and invalid bounds",()=>{
 for(const mutate of [
  rack=>{rack.chunks[0].notes[0].soundId="missing";},
  rack=>{rack.chunks[0].notes[0].pitch=60;},
  rack=>{rack.chunks[0].notes.push({...rack.chunks[0].notes[0],id:id()});},
  rack=>{rack.sounds[1].id=rack.sounds[0].id;},
  rack=>{rack.sounds[0].gain=2;},rack=>{rack.sounds[0].referencePitch=128;},
  rack=>{rack.sounds[0].trigger="pitched";},rack=>{rack.sounds=[];},
  rack=>{rack.chunks[0].notes[0].start=16;}
 ]){const score=rackScore();mutate(score.instruments[0]);assert.ok(validate(score).length);}
 const score=rackScore(),rack=score.instruments[0];
 rack.sounds=Array.from({length:MAX_SOUNDS},(_,i)=>makeSound("Sound "+i,makePatch("dust-hat"),"hit"));
 rack.chunks[0].notes=rack.sounds.flatMap(sound=>Array.from({length:16},(_,step)=>hit(sound,step)));
 assert.ok(rack.chunks[0].notes.length<=MAX_EVENTS);assert.deepEqual(validate(score),[]);
 rack.sounds.push(makeSound("Too many",makePatch(),"hit"));assert.ok(validate(score).length);
});
test("v5 pitched work migrates deterministically with notes, chunks, expression, and timeline intact",()=>{
 const score=create(),inst=score.instruments[0];
 inst.chunks.push(makeChunk("Second"));inst.timeline[2]=inst.chunks[1].id;
 inst.chunks[0].notes=[{id:id(),pitch:71,start:2,duration:3,velocity:.6,bend:{shape:"fall",amount:2,rate:4}}];
 const old=legacy(score),before=clone(old),next=parse(JSON.stringify(old));
 assert.equal(next.version,6);assert.deepEqual(next.instruments[0].chunks,inst.chunks);
 assert.deepEqual(next.instruments[0].timeline,inst.timeline);
 assert.deepEqual(next.instruments[0].sounds[0].patch,inst.sounds[0].patch);
 assert.deepEqual(parse(JSON.stringify(old)),next);assert.deepEqual(old,before);
});
test("v5 single-zone hits migrate safely, while multiple zones and simultaneous notes stay pitched",()=>{
 const score=create(),inst=score.instruments[0];
 const asset={id:"test",name:"Test",mime:"audio/wav",path:"assets/test.wav",source:"Test"};score.samples=[asset];
 inst.sounds[0].patch={...makeSamplerPatch(SAMPLE_LIBRARY.find(item=>item.id==="acoustic-kick")),zones:[{assetId:"test",root:60}]};
 delete inst.sounds[0].patch.oneShot;
 inst.chunks[0].notes=[{id:id(),pitch:48,start:0,duration:4,velocity:.8}];
 const old=legacy(score),migrated=parse(JSON.stringify(old)),rack=migrated.instruments[0];
 assert.equal(rack.layout,"rack");assert.equal(rack.chunks[0].notes[0].duration,4);
 assert.equal(rack.sounds[0].patch.oneShot,undefined); // Preserve old gated release.
 assert.equal(rack.chunks[0].notes[0].pitch,undefined);
 old.instruments[0].patch.zones.push({assetId:"test",root:72});
 const zoned=parse(JSON.stringify(old)).instruments[0];
 assert.equal(zoned.layout,"pitched");assert.equal(canConvertToRack(zoned),false);
 old.instruments[0].patch.zones.pop();old.instruments[0].chunks[0].notes.push({...old.instruments[0].chunks[0].notes[0],id:id(),pitch:67});
 const conflicting=parse(JSON.stringify(old)).instruments[0];
 assert.equal(conflicting.layout,"pitched");assert.equal(conflicting.chunks[0].notes.length,2);
 assert.throws(()=>parse(JSON.stringify({...old,instruments:{}})),/instrument/);
});
test("sample discovery resolves every row reference and preserves velocity layers without pitch-follow guessing",()=>{
 const score=rackScore(),rack=score.instruments[0];
 const patch={...makeSamplerPatch(SAMPLE_LIBRARY[0]),followPitch:false,zones:[
  {assetId:"low-soft",root:48,velocity:.2},{assetId:"low-hard",root:48,velocity:.9},{assetId:"high",root:72,velocity:.9}
 ]};
 rack.sounds[0].patch=patch;rack.sounds[0].referencePitch=48;
 rack.sounds[1].patch=clone(patch);rack.sounds[1].referencePitch=72;
 assert.deepEqual([...usedSampleIds(score)].sort(),["high","low-hard"]);
 rack.chunks[0].notes[0].velocity=.2;
 assert.deepEqual([...usedSampleIds(score)].sort(),["high","low-soft"]);
 assert.equal(referencedSampleIds(score.instruments).size,3);
});
test("sampled racks export each shared audio file once and roundtrip every row and event",async()=>{
 const bytes=encodeMonoWav(new Float32Array(4000).map((_,i)=>Math.sin(i/14)*.5),44100);
 const asset=makeSampleAsset("rack-test","Test hit","audio/wav",bytes,"Author recording");
 const score=rackScore(),rack=score.instruments[0];score.samples=[asset];
 for(const sound of rack.sounds)sound.patch={...makeSamplerPatch(SAMPLE_LIBRARY[0]),zones:[{assetId:asset.id,root:60}],oneShot:true};
 const exported=exportProject(score);
 const file=new File([exported.blob],exported.name);
 const imported=await importProject(file);
 assert.deepEqual(imported,score);assert.equal(imported.samples.length,1);
 assert.deepEqual(validate(imported),[]);
});
