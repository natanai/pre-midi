import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '../schema.js';
import {makePatch} from '../synth.js';
import {wav,renderSynthBuffer} from '../audio.js';
test('native WAV and sound analysis use binary native rendering without an AudioContext',async()=>{
 const previous={tauri:globalThis.__TAURI__,storage:globalThis.localStorage,offline:globalThis.OfflineAudioContext};const calls=[];
 globalThis.localStorage={getItem:()=>null};globalThis.OfflineAudioContext=class{constructor(){throw Error('Web Audio used during native rendering');}};
 globalThis.__TAURI__={core:{invoke:async(command,{request})=>{
  calls.push({command,request});if(command==='native_audio')return {sampleRate:0,generation:1};
  assert.equal(command,'native_render');
  if(request.wav){const bytes=new Uint8Array(48);bytes.set(new TextEncoder().encode('RIFF'));return bytes.buffer;}
  return Float32Array.from({length:2*request.frames},(_,i)=>i%2?.3:.1).buffer;
 }}};
 try{
  const doc=create(),blob=await wav(doc);assert.equal(blob.type,'audio/wav');assert.equal(blob.size,48);
  const buffer=await renderSynthBuffer(makePatch('sine-keys'),60,.1,{sampleRate:22050,seconds:.2});
  assert.equal(buffer.length,4410);assert.equal(buffer.numberOfChannels,1);assert.ok(Math.abs(buffer.getChannelData(0)[0]-.2)<1e-7);
  const renders=calls.filter(c=>c.command==='native_render');assert.deepEqual(renders.map(c=>c.request.wav),[true,false]);assert.deepEqual(renders.map(c=>c.request.gain),[.85,1]);
  assert.ok(calls.every(c=>c.request.action!=='configure'));
 }finally{for(const [key,value]of [['__TAURI__',previous.tauri],['localStorage',previous.storage],['OfflineAudioContext',previous.offline]]){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
