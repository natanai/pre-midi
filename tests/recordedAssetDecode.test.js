import test from 'node:test';import assert from 'node:assert/strict';
import {putAsset,getAsset,getAssetRevision,clearAssets} from '../assetRegistry.js';
import {decodeRecordedAsset} from '../recordedAssetDecode.js';import {decodedWaveformAsset} from '../audioWaveform.js';
test('source inspection shares pending native decodes despite defensive copies and invalidates replaced recordings',async()=>{
 const oldHost=globalThis.__TAURI__,oldStorage=globalThis.localStorage;let calls=0;
 globalThis.localStorage={getItem:()=>null};globalThis.__TAURI__={core:{invoke:async(command,{request})=>{assert.equal(command,'native_decode');calls++;const data=new ArrayBuffer(24),v=new DataView(data);v.setUint32(0,request.rate,true);v.setUint32(4,2,true);v.setUint32(8,1,true);v.setFloat32(16,request.data[15]/100,true);return data;}}};
 try{
  const asset={id:'decode-revision',durationSeconds:1,path:'assets/decode-revision.wav'},bytes=new Uint8Array(16);bytes[15]=20;putAsset(asset.id,bytes);const version=getAssetRevision(asset.id);
  const first=decodeRecordedAsset(asset),second=decodeRecordedAsset(asset);assert.equal(first,second);assert.notEqual(getAsset(asset.id),getAsset(asset.id));assert.ok(Math.abs((await first).getChannelData(0)[0]-.2)<1e-7);assert.equal(calls,1);
  const previous=await decodedWaveformAsset(asset,()=>decodeRecordedAsset(asset));bytes[15]=40;putAsset(asset.id,bytes);assert.ok(getAssetRevision(asset.id)>version);
  const next=await decodedWaveformAsset(asset,()=>decodeRecordedAsset(asset));assert.notEqual(next,previous);assert.ok(Math.abs(next.getChannelData(0)[0]-.4)<1e-7);assert.equal(calls,2);
  clearAssets();assert.throws(()=>decodeRecordedAsset(asset),/unavailable/);putAsset(asset.id,bytes);await decodeRecordedAsset(asset);assert.equal(calls,3);
 }finally{if(oldHost===undefined)delete globalThis.__TAURI__;else globalThis.__TAURI__=oldHost;if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;}
});
