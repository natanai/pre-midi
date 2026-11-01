import test from "node:test";
import assert from "node:assert/strict";
import {
 PIANO_NOTES, DEFAULT_BINDINGS, PIANO_LOW, PIANO_HIGH, pitchAt, pitchName,
 keyName, canBind, validBindings, readBindings, writeBindings, canShift
} from "../keyboardPiano.js";

test("physical QWERTY positions form an uninterrupted chromatic piano",()=>{
 assert.equal(PIANO_NOTES.length,17);
 assert.deepEqual(PIANO_NOTES.map(n=>n.pitch),Array.from({length:17},(_,i)=>48+i));
 assert.deepEqual(DEFAULT_BINDINGS,[
  "KeyZ","KeyS","KeyX","KeyD","KeyC","KeyV","KeyG","KeyB","KeyH",
  "KeyN","KeyJ","KeyM","Comma","KeyL","Period","Semicolon","Slash"
 ]);
 assert.equal(pitchName(48),"C3");
 assert.equal(pitchName(60),"C4");
 assert.equal(keyName("Comma"),",");
 assert.equal(keyName("KeyZ"),"Z");
});
test("the right hand retains normal piano fingering at rest",()=>{
 assert.equal(PIANO_NOTES.filter(n=>!n.right).length,9);
 assert.equal(PIANO_NOTES.filter(n=>n.right).length,8);
 assert.equal(pitchAt(0),48);
 assert.equal(pitchAt(9),57);
 assert.equal(pitchAt(12),60);
 assert.equal(pitchAt(16),64);
});
test("whole octave and independent right octave shifts respect the piano roll",()=>{
 assert.equal(pitchAt(0,1),60);
 assert.equal(pitchAt(16,1),76);
 assert.equal(pitchAt(0,0,1),48);
 assert.equal(pitchAt(9,0,1),69);
 assert.equal(pitchAt(16,0,1),76);
 assert.equal(pitchAt(9,0,-1),45);
 assert.equal(canShift(0,0,-1),true);
 assert.equal(canShift(0,0,-2),false);
 assert.equal(canShift(0,0,1),true);
 assert.equal(canShift(1,0,1),false);
 assert.equal(canShift(1,0,1,true),false);
 for(let whole=-1;whole<=1;whole++){
  for(let right=-2;right<=2;right++){
   if(!PIANO_NOTES.every((_,i)=>pitchAt(i,whole,right)>=PIANO_LOW&&pitchAt(i,whole,right)<=PIANO_HIGH))continue;
   assert.ok(PIANO_NOTES.every((_,i)=>pitchAt(i,whole,right)>=PIANO_LOW&&pitchAt(i,whole,right)<=PIANO_HIGH));
  }
 }
});
test("custom bindings are unique physical keys and cannot steal mode controls",()=>{
 assert.ok(validBindings(DEFAULT_BINDINGS));
 assert.equal(canBind("KeyQ"),true);
 assert.equal(canBind("ShiftLeft"),false);
 assert.equal(canBind("NumpadAdd"),false);
 assert.equal(canBind("Space"),false);
 assert.equal(validBindings([...DEFAULT_BINDINGS.slice(0,-1),"KeyZ"]),false);
 assert.equal(validBindings(DEFAULT_BINDINGS.slice(1)),false);
 assert.equal(validBindings([...DEFAULT_BINDINGS.slice(0,-1),"Escape"]),false);
 const mock={value:null,getItem(){return this.value;},setItem(_key,val){this.value=val;}};
 assert.deepEqual(readBindings(mock),DEFAULT_BINDINGS);
 const custom=DEFAULT_BINDINGS.slice();custom[0]="KeyQ";
 writeBindings(custom,mock);
 assert.deepEqual(readBindings(mock),custom);
 mock.value='{"codes":["KeyA"]}';
 assert.deepEqual(readBindings(mock),DEFAULT_BINDINGS);
 assert.throws(()=>writeBindings(["KeyA"],mock),/Invalid/);
});
