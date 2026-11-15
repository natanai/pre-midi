import assert from 'node:assert/strict';
import {createExportAssetDecoder} from '../src/hosts/web/export-decode.js';
import {encodeRenderedWav} from '../src/dsp/wav-export.js';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
globalThis.OfflineAudioContext=OfflineAudioContext;
for(const rate of [44100,48000]){
 const decode=createExportAssetDecoder(new OfflineAudioContext(2,1,rate));
 const level=async frequency=>{
  const input=Float32Array.from({length:9600},(_,i)=>Math.sin(2*Math.PI*frequency*i/96000));
  const {blob}=await encodeRenderedWav([input],96000,{bits:32,measure:false});
  const output=(await decode(await blob.arrayBuffer())).getChannelData(0).slice(128,-128);
  return 20*Math.log10(Math.sqrt(2*output.reduce((sum,x)=>sum+x*x,0)/output.length));
 };
 const passband=await level(4000),stopband=await level(32000);
 assert.ok(Math.abs(passband)<.05,'passband '+passband);
 assert.ok(stopband< -65,'stopband '+stopband);
 console.log(JSON.stringify({rate,passband,stopband}));
}
