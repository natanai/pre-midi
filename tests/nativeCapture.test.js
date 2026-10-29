import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '../schema.js';
import {createSong,addVocalTake,upgradeSongFeatures,validateSong} from '../songModel.js';
import {makeRecordingAsset} from '../recordingAssets.js';
import {encodeMonoWav,monoFromAudioBlob} from '../recording.js';
import {exportSongProject,importSongProject,parseSong} from '../songIO.js';
import {clearAssets} from '../assetRegistry.js';
import {prepareNativeTake} from '../src/hosts/native/capture.js';
test('lossless native takes require v14 and retain external WAVs through ZIP import',async()=>{
 clearAssets();const wav=encodeMonoWav(new Float32Array(4410).fill(.2)),song=createSong(create());
 const recording=makeRecordingAsset('native-take','native take','audio/wav',wav,{durationSeconds:.1,trimSeconds:0});addVocalTake(song,recording);
 assert.equal(song.version,14);assert.deepEqual(validateSong(song),[]);upgradeSongFeatures(song);assert.equal(song.version,14);
 const exported=exportSongProject(song),restored=await importSongProject(new File([exported.blob],exported.name));assert.deepEqual(restored,song);
 assert.ok(!JSON.stringify(restored).includes('bytes'));const old=structuredClone(song);old.version=12;assert.throws(()=>parseSong(JSON.stringify(old)),/v14/);
 for(const version of [8,10,12]){const legacy=createSong(create());legacy.version=version;assert.equal(parseSong(JSON.stringify(legacy)).version,version);}
 clearAssets();
});
test('native capture finishes once and native audio import avoids browser contexts',async()=>{
 const prior={tauri:globalThis.__TAURI__,storage:globalThis.localStorage,audio:globalThis.AudioContext};const calls=[],wav=encodeMonoWav(new Float32Array(4410).fill(.2));
 globalThis.localStorage={getItem:()=>null};globalThis.AudioContext=class{constructor(){throw Error('browser audio used');}};
 globalThis.__TAURI__={core:{invoke:async(command,{request}={})=>{
  calls.push({command,request});if(command==='native_audio')return {sampleRate:44100,generation:1,captureOwner:2,capture:{phase:1}};
  if(command==='native_capture_finish')return wav.buffer;
  assert.equal(command,'native_decode');const out=new ArrayBuffer(16+4410*4),view=new DataView(out);view.setUint32(0,44100,true);view.setUint32(4,1,true);view.setUint32(8,4410,true);new Float32Array(out,16).fill(.2);return out;
 }}};
 try{
  const take=await prepareNativeTake({seconds:.1,synchronized:false});take.begin();assert.throws(()=>take.begin(),/twice/);await take.start();
  const result=await take.finish();assert.equal(result.durationSeconds,.1);assert.equal(await take.finish(),null);await take.cancel();
  const pcm=await monoFromAudioBlob(new Blob([wav],{type:'audio/wav'}));assert.equal(pcm.length,4410);assert.ok(Math.abs(pcm[0]-.2)<1e-7);
  assert.equal(calls.filter(c=>c.command==='native_capture_finish').length,1);assert.ok(!calls.some(c=>c.request?.action==='capture_cancel'));
 }finally{for(const[key,value]of [['__TAURI__',prior.tauri],['localStorage',prior.storage],['AudioContext',prior.audio]]){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
