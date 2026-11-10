import test from 'node:test';import assert from 'node:assert/strict';import {createPreparedDocument} from '../src/hosts/web/prepared-document.js';
test('live source edits retain the last playable snapshot and publish only the latest ready document',async()=>{
 let value={pitch:1},release,active=true;const gate=new Promise(resolve=>release=resolve),state=createPreparedDocument(()=>value,async snapshot=>{if(snapshot.pitch===2)await gate;},()=>active);
 await state.refresh();value.pitch=2;const slow=state.refresh();assert.equal(state.read().pitch,1);value.pitch=3;await state.refresh();assert.equal(state.read().pitch,3);release();assert.equal(await slow,false);assert.equal(state.read().pitch,3);assert.equal(state.revision,2);
 active=false;value.pitch=4;assert.equal(await state.refresh(),false);assert.equal(state.read().pitch,3);
});
