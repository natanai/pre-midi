import test from "node:test";
import assert from "node:assert/strict";
import {create,makeInstrument,makeSound,makeChunk,id,validate} from "../schema.js";
import {makeSampleAsset} from "../sampler.js";
import {deleteInstrumentFromBeat,deleteSoundFromBeat,instrumentDeleteLabel,soundDeleteLabel,canMoveRackSoundToPianoRoll,moveRackSoundToPianoRoll} from "../entityActions.js";

function rack(){
 const beat=create(),instrument=beat.instruments[0];
 instrument.layout="rack";
 instrument.sounds[0].trigger="hit";
 return {beat,instrument};
}

test("rack sound deletion preserves other sounds, chunks and steps",()=>{
 const {beat,instrument}=rack();
 const first=instrument.sounds[0],second=makeSound("Clap",undefined,"hit");
 instrument.sounds.push(second);
 const otherChunk=makeChunk("Other");
 instrument.chunks.push(otherChunk);
 instrument.chunks[0].notes.push(
  {id:id(),soundId:first.id,start:0,duration:1,velocity:.8},
  {id:id(),soundId:second.id,start:1,duration:1,velocity:.8});
 otherChunk.notes.push({id:id(),soundId:first.id,start:3,duration:1,velocity:.5});
 assert.deepEqual(validate(beat),[]);
 assert.equal(soundDeleteLabel(instrument),"Remove sound");
 assert.equal(deleteSoundFromBeat(beat,instrument.id,first.id),instrument.id);
 assert.deepEqual(instrument.sounds.map(sound=>sound.id),[second.id]);
 assert.deepEqual(instrument.chunks[0].notes.map(note=>note.soundId),[second.id]);
 assert.equal(otherChunk.notes.length,0);
 assert.deepEqual(validate(beat),[]);
});

test("deleting the sole rack sound deletes its rack but not its sibling instrument",()=>{
 const {beat,instrument}=rack(),second=makeInstrument(2,beat.bars);
 beat.instruments.push(second);
 assert.equal(instrumentDeleteLabel(instrument),"Delete rack");
 assert.equal(soundDeleteLabel(instrument),"Delete rack");
 assert.equal(deleteSoundFromBeat(beat,instrument.id,instrument.sounds[0].id),second.id);
 assert.deepEqual(beat.instruments.map(entry=>entry.id),[second.id]);
 assert.deepEqual(validate(beat),[]);
});

test("deleting the last rack leaves a new empty pitched instrument",()=>{
 const {beat,instrument}=rack(),previousId=instrument.id;
 assert.equal(deleteSoundFromBeat(beat,instrument.id,instrument.sounds[0].id),beat.instruments[0].id);
 assert.equal(beat.instruments.length,1);
 assert.notEqual(beat.instruments[0].id,previousId);
 assert.equal(beat.instruments[0].layout,"pitched");
 assert.equal(beat.instruments[0].chunks[0].notes.length,0);
 assert.deepEqual(validate(beat),[]);
});

test("deleting the last piano-roll instrument also leaves a fresh empty instrument",()=>{
 const beat=create(),previousId=beat.instruments[0].id;
 assert.equal(instrumentDeleteLabel(beat.instruments[0]),"Delete instrument");
 assert.equal(deleteInstrumentFromBeat(beat,previousId),beat.instruments[0].id);
 assert.notEqual(beat.instruments[0].id,previousId);
 assert.equal(beat.instruments[0].chunks[0].notes.length,0);
 assert.deepEqual(validate(beat),[]);
});

test("unknown instrument and sound IDs do not alter the beat",()=>{
 const {beat,instrument}=rack(),snapshot=JSON.stringify(beat);
 assert.equal(deleteInstrumentFromBeat(beat,"missing"),null);
 assert.equal(deleteSoundFromBeat(beat,instrument.id,"missing"),null);
 assert.equal(deleteSoundFromBeat(beat,"missing",instrument.sounds[0].id),null);
 assert.equal(JSON.stringify(beat),snapshot);
});

test("moving one rack row to piano roll preserves its chunk placements and remaining hits",()=>{
 const {beat,instrument}=rack();
 const first=instrument.sounds[0],second=makeSound("Snare",undefined,"hit");
 instrument.sounds.push(second);
 const other=makeChunk("Verse");
 instrument.chunks.push(other);
 instrument.timeline[1]=other.id;
 const firstHit={id:id(),soundId:first.id,start:2,duration:1,velocity:.7};
 instrument.chunks[0].notes.push(firstHit,{id:id(),soundId:second.id,start:2,duration:1,velocity:.8});
 other.notes.push({id:id(),soundId:first.id,start:9,duration:1,velocity:.6});
 const originalId=instrument.id;
 assert.deepEqual(validate(beat),[]);
 assert.equal(canMoveRackSoundToPianoRoll(beat,originalId,first.id),true);
 const pitchedId=moveRackSoundToPianoRoll(beat,originalId,first.id);
 assert.equal(beat.instruments.length,2);
 assert.equal(beat.instruments[0].id,originalId);
 assert.equal(instrument.sounds.length,1);
 assert.equal(instrument.sounds[0].id,second.id);
 assert.deepEqual(instrument.chunks[0].notes.map(event=>event.soundId),[second.id]);
 assert.equal(instrument.chunks[1].notes.length,0);
 const pitched=beat.instruments[1];
 assert.equal(pitched.id,pitchedId);
 assert.equal(pitched.layout,"pitched");
 assert.equal(pitched.name,first.name);
 assert.equal(pitched.sounds[0].trigger,"pitched");
 assert.equal(pitched.chunks[0].notes[0].pitch,first.referencePitch);
 assert.equal(pitched.chunks[0].notes[0].start,firstHit.start);
 assert.equal(pitched.chunks[1].notes[0].start,9);
 assert.equal(pitched.timeline[1],pitched.chunks[1].id);
 assert.equal(pitched.timeline[0],pitched.chunks[0].id);
 assert.deepEqual(validate(beat),[]);
});

test("moving the final rack sound replaces rack with a new pitched instrument",()=>{
 const {beat,instrument}=rack(),previousId=instrument.id;
 instrument.chunks[0].notes.push({id:id(),soundId:instrument.sounds[0].id,start:6,duration:1,velocity:.9});
 const newId=moveRackSoundToPianoRoll(beat,instrument.id,instrument.sounds[0].id);
 assert.equal(beat.instruments.length,1);
 assert.equal(beat.instruments[0].id,newId);
 assert.notEqual(newId,previousId);
 assert.equal(beat.instruments[0].layout,"pitched");
 assert.equal(beat.instruments[0].chunks[0].notes[0].start,6);
 assert.deepEqual(validate(beat),[]);
});

test("piano roll extraction respects pitch bounds and 12 instrument capacity",()=>{
 const {beat,instrument}=rack(),row=instrument.sounds[0];
 row.referencePitch=12;
 assert.equal(canMoveRackSoundToPianoRoll(beat,instrument.id,row.id),false);
 assert.equal(moveRackSoundToPianoRoll(beat,instrument.id,row.id),null);
 row.referencePitch=60;
 instrument.sounds.push(makeSound("Other",undefined,"hit"));
 while(beat.instruments.length<12)beat.instruments.push(makeInstrument(beat.instruments.length+1,beat.bars));
 assert.equal(canMoveRackSoundToPianoRoll(beat,instrument.id,row.id),false);
 assert.equal(moveRackSoundToPianoRoll(beat,instrument.id,row.id),null);
 instrument.sounds.pop();
 assert.equal(canMoveRackSoundToPianoRoll(beat,instrument.id,row.id),true);
 const next=moveRackSoundToPianoRoll(beat,instrument.id,row.id);
 assert.ok(next);
 assert.equal(beat.instruments.length,12);
 assert.deepEqual(validate(beat),[]);
});

test("moving a recorded hit to piano roll enables audible pitch-following and note lengths",()=>{
 const {beat,instrument}=rack(),entry=instrument.sounds[0];
 const wav=new Uint8Array(44);
 wav.set(new TextEncoder().encode("RIFF"),0);
 wav.set(new TextEncoder().encode("WAVE"),8);
 beat.samples.push(makeSampleAsset("recorded-fixture","Recorded tap","audio/wav",wav,"user"));
 entry.patch={type:"sample",presetId:"custom",zones:[{assetId:"recorded-fixture",root:60}],
  followPitch:false,oneShot:true,transpose:0,gain:1,attack:.01,release:.1,pan:0};
 assert.deepEqual(validate(beat),[]);
 const movedId=moveRackSoundToPianoRoll(beat,instrument.id,entry.id);
 const moved=beat.instruments.find(item=>item.id===movedId);
 assert.equal(moved.sounds[0].patch.followPitch,true);
 assert.equal(moved.sounds[0].patch.oneShot,false);
 assert.equal(moved.sounds[0].patch.zones[0].assetId,"recorded-fixture");
 assert.deepEqual(validate(beat),[]);
});
