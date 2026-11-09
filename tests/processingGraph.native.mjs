import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planNativeSample,planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {encodeNativeSession} from '../src/hosts/native/session.js';
import {withInstance,withParallelRoute,withRouteShare,moveProcessor} from '../src/dsp/processing-graph.js';
const folder=await mkdtemp(join(tmpdir(),'premidi-graph-')),bin=join(folder,'render');
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off',fileURLToPath(new URL('../native/session-render.cpp',import.meta.url)),'-o',bin]);
 const rate=24000,frames=rate,pcm=Float32Array.from({length:frames},(_,i)=>.3*Math.sin(2*Math.PI*220*i/rate)+.1*Math.sin(2*Math.PI*1700*i/rate));
 const handles=new Map([['r',{id:1,duration:1,normalization:1}]]),asset={rate,channels:1,frames,pcm};
 const base={type:'sample',presetId:'custom',zones:[{assetId:'r',root:60}],followPitch:false,oneShot:true,audioMode:'clip',transpose:0,gain:.8,attack:0,release:0,pan:0,chain:{version:1,order:[],bypass:[]}};
 const render=(patch,{vocal=false,seek=0,block=128,notes=null}={})=>{
  const plans=notes??[vocal?planNativeVocal({recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:8,effects:{...patch,gain:undefined,type:undefined,presetId:undefined,zones:undefined,followPitch:undefined,oneShot:undefined,audioMode:undefined,transpose:0}}},0,.125,handles):planNativeSample({patch,volume:1},{pitch:60,velocity:1},0,1,handles)];
  const bytes=encodeNativeSession(plans,rate,[asset]),out=spawnSync(bin,[rate,1,seek,0,Math.round((1-seek)*rate),block,0].map(String),{input:bytes,maxBuffer:8*1024*1024});
  if(out.status)throw Error(out.stderr.toString());const copy=new Uint8Array(out.stdout);return new Float32Array(copy.buffer);
 };
 const diff=(a,b)=>{let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;};
 const plain=render(base),empty=structuredClone(base);empty.chain=withParallelRoute(empty);
 assert.equal(diff(render(empty),plain),0,'Empty parallel routes preserve dry signal');empty.chain.parallel[0].gain=0;
 assert.ok(render(empty).every(value=>value===0),'Empty muted routes remain silent');
 const filtered=structuredClone(base);filtered.chain=withInstance(filtered,'filter');filtered.chain.instances[0].parameters.cutoff=300;
 const one=render(filtered);assert.ok(diff(plain,one)>.01);
 filtered.chain=withInstance(filtered,'filter');filtered.chain.instances[1].parameters.cutoff=800;
 const two=render(filtered);assert.ok(diff(one,two)>.001,'A second independent filter must affect PCM');
 const bypass=structuredClone(filtered);bypass.chain.bypass=['filter-2'];assert.ok(diff(render(bypass),one)<1e-7);
 assert.ok(diff(two,render(filtered,{vocal:true}))<1e-7,'Vocal and sample graph parity');
 assert.ok(diff(two,render(filtered,{block:17}))<1e-7,'Graph output depends on block partition');
 const seek=render(filtered,{seek:.4});assert.ok(diff(seek,two.slice(Math.round(.4*rate)*2))<1e-7,'Graph seek history was lost');
 const driven=structuredClone(base);driven.chain=withInstance(driven,'drive');driven.chain.instances[0].parameters.amount=.5;
 const wet=render(driven),parallel=structuredClone(driven);parallel.chain=withParallelRoute(parallel);parallel.chain=moveProcessor(parallel.chain,'drive-1','route-1');parallel.chain=withRouteShare(parallel.chain,'dry',.4);
 const mixed=render(parallel);let error=0;
 for(let i=512;i<rate*.8;i++)for(let ch=0;ch<2;ch++)error=Math.max(error,Math.abs(mixed[2*i+ch]-(plain[2*(i-192)+ch]*.4+wet[2*i+ch]*.6)));
 assert.ok(error<1e-7,'Parallel dry compensation error '+error);
 // Two successive oversampled processors require 384 frames of dry alignment.
 driven.chain=withInstance(driven,'drive');driven.chain.instances[1].parameters.amount=.3;
 const doubleWet=render(driven);driven.chain=withParallelRoute(driven);for(const id of ['drive-1','drive-2'])driven.chain=moveProcessor(driven.chain,id,'route-1');driven.chain=withRouteShare(driven.chain,'dry',.5);
 const doubleMix=render(driven);let doubleError=0;
 for(let i=768;i<rate*.8;i++)doubleError=Math.max(doubleError,Math.abs(doubleMix[2*i]-(plain[2*(i-384)]*.5+doubleWet[2*i]*.5)));
 assert.ok(doubleError<1e-7,'Multi-instance parallel latency error '+doubleError);
 console.log('PASS native independent instances, sample/vocal parity, seek/block continuity and 192/384-frame compensated parallel blends',JSON.stringify({error,doubleError}));
}finally{await rm(folder,{recursive:true,force:true});}
