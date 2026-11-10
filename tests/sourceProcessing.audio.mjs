import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {processSourceChannels} from '../src/hosts/web/source-kernel.js';
const folder=await mkdtemp(join(tmpdir(),'premidi-source-')),binary=join(folder,'source'),rate=24000,length=rate;
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off',fileURLToPath(new URL('../native/source-render.cpp',import.meta.url)),'-o',binary]);
 const render=(input,p)=>{const result=spawnSync(binary,[rate,1,p.start,p.duration,p.time,p.semitones,p.formant,Number(p.preserve),Number(p.reverse)].map(String),{input:Buffer.from(input.buffer),maxBuffer:16e6,timeout:30000});if(result.status)throw Error(result.stderr.toString());return new Float32Array(new Uint8Array(result.stdout).buffer);};
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
}finally{await rm(folder,{recursive:true,force:true});}
