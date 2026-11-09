import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '../schema.js';
import {makePatch,PRESETS} from '../synth.js';
import {renderEvents} from '../audio.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';
import {nativePlans,encodeNativeSession,unsupportedNativeFeatures,playNative,cancelNativeTransport} from '../src/hosts/native/session.js';

function beat(){const doc=create();doc.bars=1;const inst=doc.instruments[0];inst.timeline=[inst.chunks[0].id];inst.placements=[null];inst.sounds[0].patch=makePatch('touch-keys');inst.volume=.4;inst.sounds[0].gain=.7;inst.chunks[0].notes=[{id:'native-note',pitch:64,start:2,duration:3,velocity:.6}];return doc;}
async function responds(promise){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Transport intent waited for preparation')),1000);})]);}finally{clearTimeout(timer);}
}
test('native transport consumes the shared canonical timing, sound gain and modulation plan',()=>{
 const doc=beat(),events=renderEvents(doc),plans=nativePlans(events),event=events[0];
 assert.equal(plans.length,1);assert.equal(plans[0].version,2);assert.equal(plans[0].start,2*.125);
 assert.deepEqual(plans[0],planSynthVoice({patch:doc.instruments[0].sounds[0].patch,volume:.4*.7},event.note,event.at,event.duration,{timeline:event.timeline}));
 const bytes=encodeNativeSession(plans,48000),view=new DataView(bytes.buffer);
 assert.equal(view.getUint32(0,true),0x31534d50);assert.equal(view.getUint32(4,true),1);
 assert.equal(view.getUint32(12,true),0x344e4d50);
});
test('native synth features preserve every authored patch',()=>{
 for(const {id} of PRESETS){
  const patch=makePatch(id),before=structuredClone(patch);assert.deepEqual(unsupportedNativeFeatures(patch),[]);assert.deepEqual(patch,before);
  assert.ok(encodeNativeSession([planSynthVoice({patch,volume:.3},{pitch:60,velocity:.8},0,.2)],48000).length);
 }
});
test('malformed sample sessions reject before device playback',async()=>{
 const doc=beat();doc.instruments[0].sounds[0].patch={type:'sample'};
 let calls=0;globalThis.__TAURI__={core:{invoke:()=>{calls++;throw Error('unexpected device call');}}};
 try{await assert.rejects(playNative(doc,renderEvents(doc)),/sample/);assert.equal(calls,0);}
 finally{delete globalThis.__TAURI__;}
});
test('native live edits serialize tempo changes, preserve pause and cancel stopped updates',async()=>{
 const calls=[];let issued=0,current=0,release;
 globalThis.__TAURI__={core:{invoke:async(_,{request})=>{
  calls.push(request);
  if(request.action==='begin')return {owner:++issued};
  if(request.action==='play')current=request.owner;
  if(request.action==='update'&&release)await new Promise(resolve=>{release.resolve=resolve;});
  return {sampleRate:48000,generation:1,owner:current,state:1,positionSeconds:.3};
 }}};
 const doc=beat();let handle;
 try{
  handle=await playNative(doc,renderEvents(doc));await handle.pause();assert.equal(handle.paused,true);
  const first=structuredClone(doc);first.bpm=60;await handle.update(first,renderEvents(first));assert.equal(handle.paused,true);
  const second=structuredClone(doc);second.bpm=240;await handle.update(second,renderEvents(second));
  assert.deepEqual(calls.filter(c=>c.action==='update').map(c=>c.tempo_ratio),[2,.25]);
  release={};const pending=handle.update(doc,renderEvents(doc));
  while(!release.resolve)await new Promise(resolve=>setImmediate(resolve));
  const latest=handle.update(first,renderEvents(first));await handle.stop();release.resolve();await Promise.all([pending,latest]);
  assert.equal(calls.filter(c=>c.action==='update').length,3);
  assert.equal(calls.at(-1).action,'control');assert.equal(calls.at(-1).command,1);
 }finally{await handle?.stop();delete globalThis.__TAURI__;}
});
test('a native Song stopped during preparation never starts late',async()=>{
 const doc=beat(),events=renderEvents(doc),calls=[];
 let releaseStatus,notifyStatus;
 const waiting=new Promise(resolve=>{notifyStatus=resolve;});
 const prior=globalThis.__TAURI__;
 globalThis.__TAURI__={core:{invoke:async(_,{request})=>{
  calls.push(request);
  if(request.action==='status'){
   notifyStatus();
   await new Promise(resolve=>{releaseStatus=resolve;});
   return {sampleRate:48000,generation:1};
  }
  if(request.action==='begin')return {owner:1};
  return {sampleRate:48000,generation:1};
 }}};
 try{
  const pending=playNative(doc,events);
  await waiting;
  await cancelNativeTransport();
  releaseStatus();
  await assert.rejects(pending,/cancelled/);
  assert.equal(calls.filter(request=>request.action==='play').length,0);
 }finally{if(prior===undefined)delete globalThis.__TAURI__;else globalThis.__TAURI__=prior;}
});
test('pause/resume bypass a pending native edit and seek keeps the transport lease and pause intent',async()=>{
 const prior=globalThis.__TAURI__,calls=[];
 let owner=0,entered,release,handle;
 const editing=new Promise(resolve=>{entered=resolve;});
 globalThis.__TAURI__={core:{invoke:async(_,{request})=>{
  calls.push(request);
  if(request.action==='begin')return {owner:++owner};
  if(request.action==='update'){entered();await new Promise(resolve=>{release=resolve;});}
  return {sampleRate:48000,generation:1,owner,state:1,positionSeconds:.3};
 }}};
 try{
  const doc=beat();handle=await playNative(doc,renderEvents(doc));
  const edit=handle.update(doc,renderEvents(doc));await editing;
  // Awaiting these while the edit is deliberately blocked would deadlock the
  // old implementation. Intent must reach the bridge before release().
  await responds(handle.pause());assert.equal(handle.paused,true);
  await handle.resume();assert.equal(handle.paused,false);
  const p=handle.pause(),r=handle.resume();await Promise.all([p,r]);
  assert.deepEqual(calls.filter(c=>c.action==='control').map(c=>c.command),[2,3,2,3]);
  release();await edit;
  await handle.pause();await handle.seek(6);
  assert.equal(handle.paused,true);
  assert.equal(calls.filter(c=>c.action==='begin').length,1);
  assert.ok(calls.filter(c=>c.action==='play').every(c=>c.owner===owner));
 }finally{release?.();await handle?.stop();if(prior===undefined)delete globalThis.__TAURI__;else globalThis.__TAURI__=prior;}
});
test('vocal and unresolved sound identities fail explicitly',()=>{
 assert.throws(()=>nativePlans([{kind:'vocal'}]),/missing its recording/);
 const doc=beat();doc.instruments[0].layout='rack';
 assert.throws(()=>nativePlans(renderEvents(doc)),/unresolved sound/);
});
test('native filter sweep can be prepared for the device without changing the patch',()=>{
 const doc=beat(),patch=doc.instruments[0].sounds[0].patch;patch.filter.sweep=1.5;patch.filter.sweepTime=.12;
 const before=structuredClone(patch),plans=nativePlans(renderEvents(doc));
 const packet=encodeNativeSession(plans,48000);
 assert.equal(new DataView(packet.buffer).getUint32(24,true),4);
 assert.deepEqual(patch,before);
});
test('native session packet enforces its preparation bound',()=>{
 assert.throws(()=>encodeNativeSession(new Array(4097),48000),/4096/);
 const doc=beat(),plans=nativePlans(renderEvents(doc));plans[0].patch.effects.drive=2;
 assert.throws(()=>encodeNativeSession(plans,48000),/Invalid effects/);
});
test('native modulated pitch uses v9 to clamp at device Nyquist',()=>{
 const patch=makePatch('breath-lead');patch.modulation.routes.find(route=>route.target==='oscillators.0.detune').depth=2400;
 const plan=planSynthVoice({patch,volume:.2},{pitch:127,velocity:.8},0,.1);
 assert.equal(new DataView(encodeNativeSession([plan],44100).buffer).getUint32(24,true),9);
});
