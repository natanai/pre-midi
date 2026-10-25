import test from "node:test";
import assert from "node:assert/strict";
import {create,makeInstrument,makeSound,makeChunk,id,validate} from "../schema.js";
import {makeSampleAsset} from "../sampler.js";
import {deleteInstrumentFromScore,deleteSoundFromScore,instrumentDeleteLabel,soundDeleteLabel,canMoveRackSoundToPianoRoll,moveRackSoundToPianoRoll} from "../entityActions.js";

function rack(){
 const score=create(),instrument=score.instruments[0];
 instrument.layout="rack";
 instrument.sounds[0].trigger="hit";
 return {score,instrument};
}

test("rack sound deletion preserves other sounds, chunks and steps",()=>{
 const {score,instrument}=rack();
 const first=instrument.sounds[0],second=makeSound("Clap",undefined,"hit");
 instrument.sounds.push(second);
 const otherChunk=makeChunk("Other");
 instrument.chunks.push(otherChunk);
 instrument.chunks[0].notes.push(
  {id:id(),soundId:first.id,start:0,duration:1,velocity:.8},
  {id:id(),soundId:second.id,start:1,duration:1,velocity:.8});
 otherChunk.notes.push({id:id(),soundId:first.id,start:3,duration:1,velocity:.5});
 assert.deepEqual(validate(score),[]);
 assert.equal(soundDeleteLabel(instrument),"Remove sound");
 assert.equal(deleteSoundFromScore(score,instrument.id,first.id),instrument.id);
 assert.deepEqual(instrument.sounds.map(sound=>sound.id),[second.id]);
 assert.deepEqual(instrument.chunks[0].notes.map(note=>note.soundId),[second.id]);
 assert.equal(otherChunk.notes.length,0);
 assert.deepEqual(validate(score),[]);
});

test("deleting the sole rack sound deletes its rack but not its sibling instrument",()=>{
 const {score,instrument}=rack(),second=makeInstrument(2,score.bars);
 score.instruments.push(second);
 assert.equal(instrumentDeleteLabel(instrument),"Delete rack");
 assert.equal(soundDeleteLabel(instrument),"Delete rack");
 assert.equal(deleteSoundFromScore(score,instrument.id,instrument.sounds[0].id),second.id);
 assert.deepEqual(score.instruments.map(entry=>entry.id),[second.id]);
 assert.deepEqual(validate(score),[]);
});

test("deleting the last rack leaves a new empty pitched instrument",()=>{
 const {score,instrument}=rack(),previousId=instrument.id;
 assert.equal(deleteSoundFromScore(score,instrument.id,instrument.sounds[0].id),score.instruments[0].id);
 assert.equal(score.instruments.length,1);
 assert.notEqual(score.instruments[0].id,previousId);
 assert.equal(score.instruments[0].layout,"pitched");
 assert.equal(score.instruments[0].chunks[0].notes.length,0);
 assert.deepEqual(validate(score),[]);
});

test("deleting the last piano-roll instrument also leaves a fresh empty instrument",()=>{
 const score=create(),previousId=score.instruments[0].id;
 assert.equal(instrumentDeleteLabel(score.instruments[0]),"Delete instrument");
 assert.equal(deleteInstrumentFromScore(score,previousId),score.instruments[0].id);
 assert.notEqual(score.instruments[0].id,previousId);
 assert.equal(score.instruments[0].chunks[0].notes.length,0);
 assert.deepEqual(validate(score),[]);
});

test("unknown instrument and sound IDs do not alter the score",()=>{
 const {score,instrument}=rack(),snapshot=JSON.stringify(score);
 assert.equal(deleteInstrumentFromScore(score,"missing"),null);
 assert.equal(deleteSoundFromScore(score,instrument.id,"missing"),null);
 assert.equal(deleteSoundFromScore(score,"missing",instrument.sounds[0].id),null);
 assert.equal(JSON.stringify(score),snapshot);
});

test("moving one rack row to piano roll preserves its chunk placements and remaining hits",()=>{
 const {score,instrument}=rack();
 const first=instrument.sounds[0],second=makeSound("Snare",undefined,"hit");
 instrument.sounds.push(second);
 const other=makeChunk("Verse");
 instrument.chunks.push(other);
 instrument.timeline[1]=other.id;
 const firstHit={id:id(),soundId:first.id,start:2,duration:1,velocity:.7};
 instrument.chunks[0].notes.push(firstHit,{id:id(),soundId:second.id,start:2,duration:1,velocity:.8});
 other.notes.push({id:id(),soundId:first.id,start:9,duration:1,velocity:.6});
 const originalId=instrument.id;
 assert.deepEqual(validate(score),[]);
 assert.equal(canMoveRackSoundToPianoRoll(score,originalId,first.id),true);
 const pitchedId=moveRackSoundToPianoRoll(score,originalId,first.id);
 assert.equal(score.instruments.length,2);
 assert.equal(score.instruments[0].id,originalId);
 assert.equal(instrument.sounds.length,1);
 assert.equal(instrument.sounds[0].id,second.id);
 assert.deepEqual(instrument.chunks[0].notes.map(event=>event.soundId),[second.id]);
 assert.equal(instrument.chunks[1].notes.length,0);
 const pitched=score.instruments[1];
 assert.equal(pitched.id,pitchedId);
 assert.equal(pitched.layout,"pitched");
 assert.equal(pitched.name,first.name);
 assert.equal(pitched.sounds[0].trigger,"pitched");
 assert.equal(pitched.chunks[0].notes[0].pitch,first.referencePitch);
 assert.equal(pitched.chunks[0].notes[0].start,firstHit.start);
 assert.equal(pitched.chunks[1].notes[0].start,9);
 assert.equal(pitched.timeline[1],pitched.chunks[1].id);
 assert.equal(pitched.timeline[0],pitched.chunks[0].id);
 assert.deepEqual(validate(score),[]);
});

test("moving the final rack sound replaces rack with a new pitched instrument",()=>{
 const {score,instrument}=rack(),previousId=instrument.id;
 instrument.chunks[0].notes.push({id:id(),soundId:instrument.sounds[0].id,start:6,duration:1,velocity:.9});
 const newId=moveRackSoundToPianoRoll(score,instrument.id,instrument.sounds[0].id);
 assert.equal(score.instruments.length,1);
 assert.equal(score.instruments[0].id,newId);
 assert.notEqual(newId,previousId);
 assert.equal(score.instruments[0].layout,"pitched");
 assert.equal(score.instruments[0].chunks[0].notes[0].start,6);
 assert.deepEqual(validate(score),[]);
});

test("piano roll extraction respects pitch bounds and 12 instrument capacity",()=>{
 const {score,instrument}=rack(),row=instrument.sounds[0];
 row.referencePitch=12;
 assert.equal(canMoveRackSoundToPianoRoll(score,instrument.id,row.id),false);
 assert.equal(moveRackSoundToPianoRoll(score,instrument.id,row.id),null);
 row.referencePitch=60;
 instrument.sounds.push(makeSound("Other",undefined,"hit"));
 while(score.instruments.length<12)score.instruments.push(makeInstrument(score.instruments.length+1,score.bars));
 assert.equal(canMoveRackSoundToPianoRoll(score,instrument.id,row.id),false);
 assert.equal(moveRackSoundToPianoRoll(score,instrument.id,row.id),null);
 instrument.sounds.pop();
 assert.equal(canMoveRackSoundToPianoRoll(score,instrument.id,row.id),true);
 const next=moveRackSoundToPianoRoll(score,instrument.id,row.id);
 assert.ok(next);
 assert.equal(score.instruments.length,12);
 assert.deepEqual(validate(score),[]);
});

test("moving a recorded hit to piano roll enables audible pitch-following and note lengths",()=>{
 const {score,instrument}=rack(),entry=instrument.sounds[0];
 const wav=new Uint8Array(44);
 wav.set(new TextEncoder().encode("RIFF"),0);
 wav.set(new TextEncoder().encode("WAVE"),8);
 score.samples.push(makeSampleAsset("recorded-fixture","Recorded tap","audio/wav",wav,"user"));
 entry.patch={type:"sample",presetId:"custom",zones:[{assetId:"recorded-fixture",root:60}],
  followPitch:false,oneShot:true,transpose:0,gain:1,attack:.01,release:.1,pan:0};
 assert.deepEqual(validate(score),[]);
 const movedId=moveRackSoundToPianoRoll(score,instrument.id,entry.id);
 const moved=score.instruments.find(item=>item.id===movedId);
 assert.equal(moved.sounds[0].patch.followPitch,true);
 assert.equal(moved.sounds[0].patch.oneShot,false);
 assert.equal(moved.sounds[0].patch.zones[0].assetId,"recorded-fixture");
 assert.deepEqual(validate(score),[]);
});
