import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRenderedWav,wavExportOptions} from '../src/dsp/wav-export.js';

test('integer WAV saturates with the selected depth and float preserves headroom',async()=>{
 const frames=Float32Array.from([-1.25,-.25,0,.25,1.25]);
 const rendered=await encodeRenderedWav([frames],48000,{bits:24});
 const data=new DataView(await rendered.blob.arrayBuffer());
 assert.equal(data.getUint32(4,true),data.byteLength-8);
 assert.equal(data.getUint16(20,true),1);
 assert.equal(data.getUint32(24,true),48000);
 assert.equal(data.getUint16(34,true),24);
 assert.equal(data.getUint32(40,true),15);
 const sample24=i=>((data.getUint8(46+3*i)<<24)|(data.getUint16(44+3*i,true)<<8))>>8;
 assert.deepEqual([...frames].map((_,i)=>sample24(i)),[-8388608,-2097152,0,2097152,8388607]);
 assert.equal(rendered.metrics.clipped,2);
 assert.equal(rendered.metrics.peak,1.25);
 const float=await encodeRenderedWav([frames,frames],96000,{bits:32});
 const wav=new DataView(await float.blob.arrayBuffer());
 assert.equal(wav.getUint16(20,true),3);
 assert.equal(wav.getUint32(46,true),5);
 assert.equal(wav.getFloat32(58,true),-1.25);
 assert.equal(wav.getFloat32(58+4*8,true),1.25);
 assert.equal(float.metrics.clipped,4);
 assert.equal(wavExportOptions({bits:32,dither:true}).dither,false);
});

test('true peak detects overload between samples and integer dither preserves silence',async()=>{
 const frames=Float32Array.from({length:2048},(_,i)=>1.08*Math.sin(Math.PI/4+i*Math.PI/2));
 const rendered=await encodeRenderedWav([frames],44100,{bits:16});
 assert.ok(rendered.metrics.peak<.77);
 assert.ok(rendered.metrics.truePeak>1);
 assert.equal(rendered.metrics.clipped,0);
 const tiny=Float32Array.from({length:2048},(_,i)=>i<20?0:1e-6);
 const dithered=new DataView(await (await encodeRenderedWav([tiny],44100,{bits:16,dither:true,measure:false})).blob.arrayBuffer());
 const data=Array.from({length:tiny.length},(_,i)=>dithered.getInt16(44+i*2,true));
 assert.ok(data.slice(0,20).every(x=>x===0));
 assert.ok(data.some(x=>x===-1)&&data.some(x=>x===1));
 assert.ok(Math.abs(data.reduce((a,b)=>a+b)/data.length-.032768)<.03);
});
