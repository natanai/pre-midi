import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {processSourceChannels} from '../src/hosts/web/source-kernel.js';
const folder=await mkdtemp(join(tmpdir(),'premidi-source-')),binary=join(folder,'source'),rate=24000,length=rate;
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off',fileURLToPath(new URL('../native/source-render.cpp',import.meta.url)),'-o',binary]);
 const render=(input,p)=>{const result=spawnSync(binary,[rate,1,p.start,p.duration,p.time,p.semitones,p.formant,Number(p.preserve),Number(p.reverse),p.tuneAmount??0,p.tuneResponse??.06,p.tuneMask??0].map(String),{input:Buffer.from(input.buffer),maxBuffer:16e6,timeout:30000});if(result.status)throw Error(result.stderr.toString());return new Float32Array(new Uint8Array(result.stdout).buffer);};
 const frequency=data=>{let count=0;const first=Math.round(data.length*.2),last=Math.round(data.length*.8);for(let i=first+1;i<last;i++)if(data[i-1]<=0&&data[i]>0)count++;return count*rate/(last-first);};
 const signal=Float32Array.from({length},(_,i)=>.3*Math.sin(2*Math.PI*440*i/rate)),base={start:0,duration:1,time:1,semitones:0,formant:0,preserve:true,reverse:false};
 for(const changes of [{time:1.5},{semitones:12},{time:.5,semitones:-12},{time:2,semitones:7,formant:3}]){
  const p={...base,...changes},native=render(signal,p),web=(await processSourceChannels([signal],rate,p))[0],expected=440*2**(p.semitones/12);
  assert.equal(native.length,Math.round(length*p.time));assert.equal(web.length,native.length);assert.ok(Math.abs(frequency(native)-expected)<5);assert.ok(Math.abs(frequency(web)-expected)<5);assert.ok(native.every(Number.isFinite)&&web.every(Number.isFinite));assert.ok(native.some(x=>Math.abs(x)>.01)&&web.some(x=>Math.abs(x)>.01));console.log('PASS independent source duration/pitch oracle',JSON.stringify({...changes,nativeHz:frequency(native),webHz:frequency(web)}));
 }
 const sequence=Float32Array.from({length:240},(_,i)=>i/240),p={...base,duration:.01,reverse:true};assert.deepEqual(render(sequence,p),sequence.slice().reverse());assert.deepEqual((await processSourceChannels([sequence],rate,p))[0],sequence.slice().reverse());
 for(const n of [48,480]){const input=new Float32Array(n);input[0]=.5;const p={...base,duration:n/rate,semitones:12};for(const out of [render(input,p),(await processSourceChannels([input],rate,p))[0]]){assert.equal(out.length,n);assert.ok(out.some(x=>Math.abs(x)>1e-5),'short source vanished');assert.ok(out.every(Number.isFinite));}}
 const deterministic={...base,time:2,semitones:7};assert.deepEqual((await processSourceChannels([signal],rate,deterministic))[0],(await processSourceChannels([signal],rate,deterministic))[0]);
 console.log('PASS exact reverse, short-source impulse retention, deterministic WASM preparation and finite source processing');
 const tuned={...base,tuneAmount:1,tuneResponse:.04,tuneMask:1<<9};
 const detuned=Float32Array.from({length},(_,i)=>.3*Math.sin(2*Math.PI*453*i/rate));
 for(const changes of [{},{time:1.4,reverse:true},{semitones:12},{tuneAmount:.5}]){
  const p={...tuned,...changes};
  const expected=453*(440/453)**p.tuneAmount*2**(p.semitones/12);
  const native=render(detuned,p),web=(await processSourceChannels([detuned],rate,p))[0];
  assert.equal(native.length,Math.round(length*p.time));assert.equal(web.length,native.length);
  assert.ok(Math.abs(frequency(native)-expected)<4,JSON.stringify({native:frequency(native),expected}));
  assert.ok(Math.abs(frequency(web)-expected)<4,JSON.stringify({web:frequency(web),expected}));
  assert.ok(native.every(Number.isFinite)&&web.every(Number.isFinite));
  console.log('PASS monophonic source tuning',JSON.stringify({...changes,expected,native:frequency(native),web:frequency(web)}));
 }
 const chord=Float32Array.from({length},(_,i)=>.22*(Math.sin(2*Math.PI*220*i/rate)+Math.sin(2*Math.PI*329.63*i/rate)));
 const noise=Float32Array.from({length},(_,i)=>Math.sin(i*i*.16)*.3);
 for(const input of [chord,noise,new Float32Array(length)]){
  assert.deepEqual(render(input,tuned),input);
  assert.deepEqual((await processSourceChannels([input],rate,tuned))[0],input);
 }
 const differentNotes=Float32Array.from({length},(_,i)=>
  .3*Math.sin(2*Math.PI*(i<length/2?453*i/rate:453*.5+513*(i/rate-.5))));
 const twoNotes={...tuned,tuneMask:(1<<9)|1};
 for(const out of [render(differentNotes,twoNotes),(await processSourceChannels([differentNotes],rate,twoNotes))[0]]){
  assert.ok(Math.abs(frequency(out.subarray(0,length/2))-440)<6);
  assert.ok(Math.abs(frequency(out.subarray(length/2))-523.25)<6);
 }
 console.log('PASS key/scale, moving pitch, unsupported chord, noise and silence fixtures');
}finally{await rm(folder,{recursive:true,force:true});}
