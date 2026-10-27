import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '../schema.js';
import {makePatch} from '../synth.js';
import {renderEvents} from '../audio.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';
import {nativePlans,encodeNativeSession,unsupportedNativeFeatures,playNative} from '../src/hosts/native/session.js';

function beat(){const doc=create();doc.bars=1;const inst=doc.instruments[0];inst.timeline=[inst.chunks[0].id];inst.placements=[null];inst.sounds[0].patch=makePatch('touch-keys');inst.volume=.4;inst.sounds[0].gain=.7;inst.chunks[0].notes=[{id:'native-note',pitch:64,start:2,duration:3,velocity:.6}];return doc;}
test('native transport consumes the shared canonical timing, sound gain and modulation plan',()=>{
 const doc=beat(),events=renderEvents(doc),plans=nativePlans(events),event=events[0];
 assert.equal(plans.length,1);assert.equal(plans[0].version,2);assert.equal(plans[0].start,2*.125);
 assert.deepEqual(plans[0],planSynthVoice({patch:doc.instruments[0].sounds[0].patch,volume:.4*.7},event.note,event.at,event.duration,{timeline:event.timeline}));
 const bytes=encodeNativeSession(plans,48000),view=new DataView(bytes.buffer);
 assert.equal(view.getUint32(0,true),0x31534d50);assert.equal(view.getUint32(4,true),1);
 assert.equal(view.getUint32(12,true),0x344e4d50);
});
test('native unsupported features are named without modifying the authored patch',()=>{
 for(const [id,field]of [['glass-keys','effects.delayMix'],['acid-line','effects.drive'],['dust-hat','noise'],['dusk-organ','movement.depth']]){
  const patch=makePatch(id),before=structuredClone(patch);assert.ok(unsupportedNativeFeatures(patch).includes(field));assert.deepEqual(patch,before);
 }
 for(const id of ['init','touch-keys','felt-electric','harmonic-keys','sub-current','rubber-bass'])assert.deepEqual(unsupportedNativeFeatures(makePatch(id)),[]);
});
test('an unsupported session is rejected before device playback and never falls back',async()=>{
 const doc=beat();doc.instruments[0].sounds[0].patch=makePatch('glass-keys');
 let calls=0;globalThis.__TAURI__={core:{invoke:()=>{calls++;throw Error('unexpected device call');}}};
 try{await assert.rejects(playNative(doc,renderEvents(doc)),/effects.delayMix/);assert.equal(calls,0);}
 finally{delete globalThis.__TAURI__;}
});
test('vocal and unresolved sound identities fail explicitly',()=>{
 assert.throws(()=>nativePlans([{kind:'vocal'}]),/recording playback/);
 const doc=beat();doc.instruments[0].layout='rack';
 assert.throws(()=>nativePlans(renderEvents(doc)),/unresolved sound/);
});
test('native session packet enforces its preparation bound',()=>{
 assert.throws(()=>encodeNativeSession(new Array(4097),48000),/4096/);
 const doc=beat(),plans=nativePlans(renderEvents(doc));plans[0].patch.noise=.1;
 assert.throws(()=>encodeNativeSession(plans,48000),/Unsupported native profile/);
});
