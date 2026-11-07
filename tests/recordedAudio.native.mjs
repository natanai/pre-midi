// Optional focused native processor check; not part of the routine prototype suite.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {planNativeSample,planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {encodeNativeSession} from '../src/hosts/native/session.js';
const temp=await mkdtemp(join(tmpdir(),'premidi-vocal-parity-')),binary=join(temp,process.platform==='win32'?'render.exe':'render');
try{
execFileSync(process.env.CXX||'c++',['-std=c++17','-O1',fileURLToPath(new URL('../native/session-render.cpp',import.meta.url)),'-o',binary]);
const rate=22050,frames=rate,pcm=Float32Array.from({length:frames},(_,i)=>.3*Math.sin(i/rate*2*Math.PI*220));
const assets=new Map([['voice',{id:1,duration:1,normalization:1}]]);
const fx={filter:{type:'lowpass',cutoff:2000,resonance:.7},attack:.01,release:.05,drive:.2,delayMix:.2,delayTime:.1,delayFeedback:.2,movement:{tone:.3,toneRate:2,tremolo:.2,tremoloRate:3},modulation:{version:1,routes:[{id:'pan',source:{kind:'lfo',rate:2,shape:'sine'},target:'pan',unit:'pan',depth:.4,polarity:'bipolar',smoothing:.005}]}};
const patch={type:'sample',presetId:'custom',zones:[{assetId:'voice',root:60}],followPitch:false,oneShot:true,audioMode:'clip',transpose:0,gain:.8,pan:0,...fx};
const sample=planNativeSample({patch,volume:1},{pitch:60,velocity:1},0,1,assets);
const vocal=planNativeVocal({recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:8,effects:fx}},0,.125,assets);
const render=plan=>{const data=encodeNativeSession([plan],rate,[{rate,frames,channels:1,pcm}]);const r=spawnSync(binary,[String(rate),'2','0','0',String(rate*2),'128','0'],{input:data,maxBuffer:4e6});if(r.status)throw Error(r.stderr.toString());return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset,r.stdout.byteOffset+r.stdout.byteLength));};
const a=render(sample),b=render(vocal);let peak=0,diff=0;for(let i=0;i<a.length;i++){peak=Math.max(peak,Math.abs(a[i]));diff=Math.max(diff,Math.abs(a[i]-b[i]));}if(!(peak>.01)||diff>1e-5)throw Error(JSON.stringify({peak,diff}));console.log('PASS native sampled/vocal processing PCM parity',JSON.stringify({peak,maxDifference:diff}));

// A half-second excerpt starts in silence and ends immediately before a loud
// out-of-region signal. A 10 ms gap excludes normal interpolation across the
// final source frame; pitch motion must never pull the later signal in.
const outside=Float32Array.from({length:rate},(_,i)=>i/rate>=.76?.8:0);
const cropped={type:'sample',presetId:'custom',zones:[{assetId:'voice',root:60,startSeconds:.25,durationSeconds:.5}],followPitch:false,oneShot:true,audioMode:'clip',transpose:0,gain:1,pan:0,attack:0,release:0,movement:{glide:12,glideTime:1}};
const bounded=planNativeSample({patch:cropped,volume:1},{pitch:60,velocity:1},0,.5,assets);
const packet=encodeNativeSession([bounded],rate,[{rate,frames,channels:1,pcm:outside}]);
const boundedResult=spawnSync(binary,[String(rate),'2','0','0',String(rate),'128','0'],{input:packet,maxBuffer:4e6});
if(boundedResult.status)throw Error(boundedResult.stderr.toString());
const boundedPcm=new Float32Array(boundedResult.stdout.buffer.slice(boundedResult.stdout.byteOffset,boundedResult.stdout.byteOffset+boundedResult.stdout.byteLength));
const outsidePeak=boundedPcm.reduce((peak,value)=>Math.max(peak,Math.abs(value)),0);
if(outsidePeak>1e-7)throw Error('Native source excerpt leaked '+outsidePeak);
console.log('PASS native pitch movement respects excerpt end',JSON.stringify({sourceLimit:bounded.sourceLimit,outsidePeak}));

}finally{await rm(temp,{recursive:true,force:true});}
