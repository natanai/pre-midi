import test from "node:test";
import assert from "node:assert/strict";
import {create,makeSound,validate} from "../schema.js";
import {makePatch} from "../synth.js";
import {createStudioSession} from "../studioSession.js";
import {FACTORY_SOUND_CATALOG} from "../soundCatalog.js";
import {catalogCategories,catalogEntries,factorySpec} from "../phone/views/catalog.js";

test("phone catalog reuses all factory presets and rack categories",()=>{
 assert.ok(FACTORY_SOUND_CATALOG.length>15);
 assert.equal(catalogEntries("All").length,FACTORY_SOUND_CATALOG.length);
 assert.ok(catalogCategories().includes("Drums"));
 assert.ok(catalogEntries("Drums").some(entry=>entry.sounds));
 const init=FACTORY_SOUND_CATALOG.find(entry=>entry.id==="init");
 assert.equal(factorySpec(init).patch.type,"synth");
});
test("phone can add, undo and redo pitched factory instruments",()=>{
 const session=createStudioSession(create()),start=session.getBeat().instruments.length;
 const ok=session.selectCatalogSound({name:"Basic Sine",patch:makePatch("init"),mode:"add"});
 assert.equal(ok,true);
 assert.equal(session.getBeat().instruments.length,start+1);
 assert.equal(session.getInstrument().name,"Basic Sine");
 assert.deepEqual(validate(session.getBeat()),[]);
 assert.equal(session.undo(),true);
 assert.equal(session.getBeat().instruments.length,start);
 assert.equal(session.redo(),true);
 assert.equal(session.getBeat().instruments.length,start+1);
});
test("phone rack catalog uses sound IDs and preserves hits when replacing a row",()=>{
 const session=createStudioSession(create());
 const a=makeSound("Kick",makePatch("init"),"hit"),b=makeSound("Snare",makePatch("init"),"hit");
 assert.equal(session.selectCatalogSound({name:"Kit",patch:a.patch,sounds:[a,b],mode:"add"}),true);
 const rack=session.getInstrument(),row=rack.sounds[0];
 assert.equal(rack.layout,"rack");
 assert.equal(session.dispatch({type:"note.add",note:{soundId:row.id,start:1,duration:1}}).changed,true);
 assert.equal(session.selectCatalogSound({name:"New Kick",patch:makePatch("glass-keys"),mode:"replace-row",soundId:row.id}),true);
 assert.equal(session.getChunk().notes[0].soundId,row.id);
 assert.equal(session.getInstrument().sounds[0].name,"New Kick");
 assert.equal(session.selectCatalogSound({name:"Extra",patch:makePatch("init"),mode:"replace",trigger:"hit"}),true);
 assert.equal(session.getInstrument().sounds.length,3);
 assert.deepEqual(validate(session.getBeat()),[]);
});
