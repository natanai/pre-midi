import test from "node:test";
import assert from "node:assert/strict";
import {create,makeSound} from "../schema.js";
import {makePatch} from "../synth.js";
import {createStudioSession} from "../studioSession.js";
import {loadUserSounds,writeUserSounds,presetFromInstrument,validUserSound,USER_SOUNDS_KEY} from "../userSoundLibrary.js";

const storage=()=>{const items=new Map();return {
 getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)
};};

test("phone isolated note effects preserve validator, undo and instrument-default bend reset",()=>{
 const session=createStudioSession(create());
 const inserted=session.dispatch({type:"note.add",note:{pitch:65,start:4,duration:2,velocity:.9}});
 const id=inserted.noteId;
 const bend={shape:"wave",amount:3,rate:5};
 assert.equal(session.dispatch({type:"note.bend",noteId:id,bend}).changed,true);
 assert.deepEqual(session.getChunk().notes[0].bend,bend);
 assert.equal(session.dispatch({type:"note.level",noteId:id,velocity:.45}).changed,true);
 assert.equal(session.dispatch({type:"note.bend",noteId:id,bend:null}).changed,true);
 assert.equal(session.getChunk().notes[0].bend,undefined);
 assert.equal(session.dispatch({type:"note.bend",noteId:id,bend:null}).changed,false);
 assert.equal(session.undo(),true);
 assert.deepEqual(session.getChunk().notes[0].bend,bend);
 assert.equal(session.getChunk().notes[0].velocity,.45);
 assert.equal(session.undo(),true);
 assert.equal(session.getChunk().notes[0].velocity,.9);
 assert.equal(session.getChunk().notes[0].bend.shape,"wave");
 assert.throws(()=>session.dispatch({type:"note.bend",noteId:id,bend:{shape:"broken",amount:10,rate:3}}));
 assert.equal(session.getChunk().notes[0].bend.shape,"wave");
});
test("saved factory-compatible phone Sounds and Racks use desktop key and never embed sample bytes",()=>{
 const beat=create(),inst=beat.instruments[0],store=storage();
 const pitched=presetFromInstrument(inst,beat,{name:"Glass shimmer"});
 assert.equal(pitched.category,"Mine");assert.equal(validUserSound(pitched),true);
 const kick=makeSound("Kick",makePatch("init"),"hit");
 const hat=makeSound("Hat",makePatch("init"),"hit");
 const rack={...inst,layout:"rack",sounds:[kick,hat]};
 const rackPreset=presetFromInstrument(rack,beat,{name:"Two hits",wholeRack:true});
 assert.equal(rackPreset.sounds.length,2);
 assert.equal(validUserSound(rackPreset),true);
 assert.ok(!("bytes" in pitched)&&!("bytes" in rackPreset));
 writeUserSounds([pitched,rackPreset],store);
 assert.equal(JSON.parse(store.getItem(USER_SOUNDS_KEY)).length,2);
 assert.deepEqual(loadUserSounds(store),[pitched,rackPreset]);
 assert.throws(()=>writeUserSounds([pitched,pitched],store),/Invalid saved sound/);
});
test("saved sound reader supports desktop legacy key and ignores invalid entries",()=>{
 const store=storage(),preset=presetFromInstrument(create().instruments[0],create(),{name:"Keys"});
 store.setItem("premidi-user-sounds-v1",JSON.stringify([preset,{id:"broken",name:"Broken"}]));
 assert.deepEqual(loadUserSounds(store),[preset]);
});
