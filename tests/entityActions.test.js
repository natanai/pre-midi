import test from "node:test";
import assert from "node:assert/strict";
import {create,makeInstrument,makeSound,makeChunk,id,validate} from "../schema.js";
import {deleteInstrumentFromScore,deleteSoundFromScore,instrumentDeleteLabel,soundDeleteLabel} from "../entityActions.js";

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
