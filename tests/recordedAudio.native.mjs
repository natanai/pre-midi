import {makePatch} from '../synth.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';
// Optional focused native processor check; not part of the routine prototype suite.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {planNativeSample,planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {resolveModulation} from '../src/dsp/modulation.js';
import {planCutoffAutomation} from '../src/dsp/automation.js';
import {encodeNativeSession} from '../src/hosts/native/session.js';
const temp=await mkdtemp(join(tmpdir(),'premidi-vocal-parity-')),binary=join(temp,process.platform==='win32'?'render.exe':'render');
try{
execFileSync(process.env.CXX||'c++',['-std=c++17','-O1',fileURLToPath(new URL('../native/session-render.cpp',import.meta.url)),'-o',binary]);
const rate=22050,frames=rate,pcm=Float32Array.from({length:frames},(_,i)=>.3*Math.sin(i/rate*2*Math.PI*220));
const assets=new Map([['voice',{id:1,duration:1,normalization:1}]]);
const fx={filter:{type:'lowpass',cutoff:2000,resonance:.7,sweep:-3,sweepTime:.6},attack:.01,release:.05,drive:.2,delayMix:.2,delayTime:.1,delayFeedback:.2,movement:{tone:.3,toneRate:2,tremolo:.2,tremoloRate:3},modulation:{version:1,routes:[{id:'pan',source:{kind:'lfo',rate:2,shape:'sine'},target:'pan',unit:'pan',depth:.4,polarity:'bipolar',smoothing:.005}]}};
const patch={type:'sample',presetId:'custom',zones:[{assetId:'voice',root:60}],followPitch:false,oneShot:true,audioMode:'clip',transpose:0,gain:.8,pan:0,...fx};
const sample=planNativeSample({patch,volume:1},{pitch:60,velocity:1},0,1,assets);
const vocal=planNativeVocal({recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:8,effects:fx}},0,.125,assets);
const render=(plan,inputPcm=pcm)=>{const data=encodeNativeSession([plan],rate,[{rate,frames,channels:1,pcm:inputPcm}]);const r=spawnSync(binary,[String(rate),'2','0','0',String(rate*2),'128','0'],{input:data,maxBuffer:4e6});if(r.status)throw Error(r.stderr.toString());return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset,r.stdout.byteOffset+r.stdout.byteLength));};
// EQ, cascaded filters and end-cropped vocal source bounds.
const equalizer={version:1,bands:[220,500,2500,8000].map((frequency,i)=>({id:'b'+i,type:'bell',enabled:i===0,frequency,gain:i===0?6:0,q:.707}))};
const chainEQ={version:1,order:['filter','eq','drive'],bypass:[]};
for(const filterStages of [1,2,4]){
 const eqFx={...fx,eq:equalizer,chain:chainEQ,filterStages};
 const a=planNativeSample({patch:{...patch,...eqFx},volume:1},{pitch:60,velocity:1},0,1,assets);
 const b=planNativeVocal({recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:8,effects:eqFx}},0,.125,assets);
 const x=render(a),y=render(b);if(x.some((v,i)=>Math.abs(v-y[i])>1e-6)||!x.every(Number.isFinite))throw Error('Native EQ/slope sample/vocal mismatch');
 const bypass=render({...b,chain:{...chainEQ,bypass:['eq']}}),neutral=render({...b,eq:undefined});
 if(bypass.some((v,i)=>Math.abs(v-neutral[i])>1e-6))throw Error('Native EQ bypass is not transparent');
 if(y.every((v,i)=>Math.abs(v-bypass[i])<.001))throw Error('Native EQ has no effect');
}
const trimmed=planNativeVocal({recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:1,trimEndSeconds:.25,lengthSteps:8,effects:{transpose:12,attack:0,release:0}}},0,.125,assets);
const tailOnly=Float32Array.from(pcm,(v,i)=>i/rate>.752?v:0);if(render(trimmed,tailOnly).some(v=>Math.abs(v)>1e-7))throw Error('End-trim vocal leaked removed source');
console.log('PASS native EQ/filter slopes, bypass and source-accurate vocal end trim');
// Batch capability checks use the real current packet/renderer.
const peakDifference=(a,b)=>a.reduce((m,v,i)=>Math.max(m,Math.abs(v-b[i])),0);
for(const value of [0,.3,1]){
 const modulation={version:1,macros:[{id:'m',name:'level',value,default:.5}],routes:[{id:'m-route',source:{kind:'macro',id:'m'},target:'amplitude',unit:'linear_gain',depth:.5,polarity:'bipolar',smoothing:0}]};
 const effects={...fx,modulation};
 const a=planNativeVocal({recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:8,effects}},0,.125,assets);
 const b=planNativeSample({patch:{...patch,modulation},volume:1},{pitch:60,velocity:1},0,1,assets);
 const reference=render({...a,modulation:undefined}),actual=render(a),factor=1+.5*(2*value-1);
 if(peakDifference(actual,reference.map(v=>v*factor))>2e-6||peakDifference(actual,render(b))>1e-6)throw Error('Native macro scaling/parity failed');
}
const mixedChain={version:1,order:['drive','filter'],bypass:[],mix:{drive:.37,filter:.61}};
const mixedSample=planNativeSample({patch:{...patch,chain:mixedChain},volume:1},{pitch:60,velocity:1},0,1,assets);
const mixedVocal=planNativeVocal({recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:8,effects:{...fx,chain:mixedChain}}},0,.125,assets);
if(peakDifference(render(mixedSample),render(mixedVocal))>1e-6)throw Error('Native processor mix parity failed');
for(const stage of ['filter','drive']){
 const zero={...mixedVocal,chain:{...mixedChain,mix:{[stage]:0}}};
 const bypass={...zero,chain:{...zero.chain,bypass:[stage]}};
 if(peakDifference(render(zero),render(bypass))>1e-6)throw Error('Native zero mix is not dry');
}
for(const bpm of [40,120,240]){
 const unit=60/bpm/4,effects={...fx,delaySync:1};
 const synced=planNativeVocal({recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:16,effects}},0,unit,assets);
 if(synced.delayTime!==60/bpm||peakDifference(render(synced),render({...synced,delayTime:60/bpm}))!==0)throw Error('Native synced delay failed');
}
console.log('PASS native batch: macro scaling, mixed-chain sample/vocal identity, dry mix endpoints and delay sync at 40/120/240 BPM');
for(const shape of ['sine','triangle','ramp','square','sample-hold','smooth-random','steps']){
 const changed=structuredClone(vocal);changed.modulation={version:1,routes:[{id:'level',source:{kind:'lfo',shape,rate:2,seed:17,...(shape==='steps'?{steps:[.8,-.2,-.6,.1]}:{})},target:'amplitude',unit:'linear_gain',depth:.5,polarity:'bipolar',smoothing:.005},{id:'q',source:{kind:'lfo',shape,rate:3,seed:127},target:'filter.resonance',unit:'filter_resonance',depth:2,polarity:'unipolar',smoothing:.005}]};
 const sound={...sample,modulation:changed.modulation},a=render(sound),b=render(changed);
 let difference=0;for(let i=0;i<a.length;i++)difference=Math.max(difference,Math.abs(a[i]-b[i]));
 if(difference>1e-5)throw Error('Shared modulation parity failed '+shape);
 const mute=structuredClone(changed);mute.modulation.routes=[{id:'mute',source:{kind:'lfo',shape:'square',rate:.05},target:'amplitude',unit:'linear_gain',depth:-1,polarity:'unipolar',smoothing:0}];
 const silent=render(mute);if(silent.some(value=>Math.abs(value)>1e-7))throw Error('Amplitude route did not mute the real native graph');
 const dry=render({...changed,modulation:undefined});let audible=0;for(let i=0;i<b.length;i++)audible=Math.max(audible,Math.abs(b[i]-dry[i]));
 if(audible<.01)throw Error('Modulation route had no audible effect '+shape);
 console.log('PASS shared native modulation',JSON.stringify({shape,difference,audible}));
}
const chainPlans=chain=>({
 sample:planNativeSample({patch:{...patch,chain},volume:1},{pitch:60,velocity:1},0,1,assets),
 vocal:planNativeVocal({recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:8,effects:{...fx,chain}}},0,.125,assets)
});
const difference=(a,b)=>a.reduce((max,value,i)=>Math.max(max,Math.abs(value-b[i])),0);
const reversed=chainPlans({version:1,order:['drive','filter'],bypass:[]});
const reverseA=render(reversed.sample),reverseB=render(reversed.vocal),defaultAudio=render(vocal);
const chainEffect=difference(reverseB,defaultAudio);if(chainEffect<.001||difference(reverseA,reverseB)>1e-5)throw Error('Native chain order/parity failed');
for(const stage of ['filter','drive','delay']){
 const plans=chainPlans({version:1,order:['filter','drive'],bypass:[stage]}),actual=render(plans.vocal);
 const reference=render(stage==='filter'?{...vocal,filter:null}:stage==='drive'?{...vocal,drive:0}:{...vocal,delayMix:0});
 if(difference(actual,reference)>1e-6||difference(actual,render(plans.sample))>1e-5)throw Error('Native processor bypass/parity failed '+stage);
}
for(const order of [[],['filter'],['drive']]){
 const plans=chainPlans({version:1,order,bypass:[]}),actual=render(plans.vocal);
 const reference=render({...vocal,...(!order.includes('filter')?{filter:null}:{}),...(!order.includes('drive')?{drive:0}:{})});
 if(difference(actual,reference)>1e-6||difference(actual,render(plans.sample))>1e-5)throw Error('Native stage removal failed '+order);
}
console.log('PASS native serial processor lifecycle');
console.log('PASS native processing order/bypass',JSON.stringify({chainEffect,maxSampleVocalDifference:difference(reverseA,reverseB)}));
const synthPatch=makePatch();synthPatch.effects={drive:.5,delayMix:.2,delayTime:.12,delayFeedback:.3};synthPatch.filter={type:'lowpass',cutoff:700,resonance:.7,sweep:0,sweepTime:.2};
const synthPlan=patch=>planSynthVoice({patch,volume:1},{pitch:60,velocity:1},0,1);
const synthDefault=render(synthPlan(synthPatch)),synthReverse=render(synthPlan({...synthPatch,chain:{version:1,order:['drive','filter'],bypass:[]}}));
const synthEffect=difference(synthDefault,synthReverse);if(synthEffect<.001)throw Error('Native synth chain order had no effect');
const synthBypass=render(synthPlan({...synthPatch,chain:{version:1,order:['filter','drive'],bypass:['drive']}}));
const synthClean=render(synthPlan({...synthPatch,effects:{...synthPatch.effects,drive:0}}));
if(difference(synthBypass,synthClean)>1e-5)throw Error('Native synth drive bypass differs');
console.log('PASS native synth processing chain',JSON.stringify({synthEffect,bypassDifference:difference(synthBypass,synthClean)}));

const a=render(sample),b=render(vocal);let peak=0,diff=0;for(let i=0;i<a.length;i++){peak=Math.max(peak,Math.abs(a[i]));diff=Math.max(diff,Math.abs(a[i]-b[i]));}if(!(peak>.01)||diff>1e-5)throw Error(JSON.stringify({peak,diff}));console.log('PASS native sampled/vocal processing PCM parity',JSON.stringify({peak,maxDifference:diff}));
const tempoRoute={version:1,routes:[{id:'tempo',source:{kind:'lfo',shape:'triangle',rate:7,sync:4},target:'amplitude',unit:'linear_gain',depth:.5,polarity:'bipolar',smoothing:.005}]};
for(const bpm of [40,120,240]){
 const effective=resolveModulation(tempoRoute,60/bpm/4),free=structuredClone(tempoRoute);delete free.routes[0].source.sync;free.routes[0].source.rate=bpm/240;
 const a=render({...vocal,modulation:effective}),b=render({...vocal,modulation:free});
 let difference=0;for(let i=0;i<a.length;i++)difference=Math.max(difference,Math.abs(a[i]-b[i]));
 if(difference>1e-7)throw Error('Native tempo resolution differs '+bpm);
 console.log('PASS native tempo sync',JSON.stringify({bpm,difference}));
}
const curve={version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',points:Array.from({length:32},(_,i)=>({id:'p'+i,step:i,value:i%2?6000:200}))};
const automation=planCutoffAutomation(curve,{start:0,end:1,step:0,unit:1/31,limitStep:31});
const automated=render({...vocal,automation}),automatedSample=render({...sample,automation});
let curveDifference=0;for(let i=0;i<automated.length;i++)curveDifference=Math.max(curveDifference,Math.abs(automated[i]-automatedSample[i]));
if(curveDifference>1e-5)throw Error('Multipoint sampled/vocal audio differs '+curveDifference);
let curveEffect=0;for(let i=0;i<automated.length;i++)curveEffect=Math.max(curveEffect,Math.abs(automated[i]-b[i]));
if(curveEffect<.01)throw Error('Multipoint curve did not affect native audio');
console.log('PASS native multipoint automation',JSON.stringify({points:automation.points.length,curveDifference,curveEffect}));
const withoutSweep=render({...vocal,sweep:{...vocal.sweep,startCutoff:vocal.filter.cutoff}});
const sweepDifference=b.reduce((peak,value,i)=>Math.max(peak,Math.abs(value-withoutSweep[i])),0);
if(sweepDifference<.01)throw Error('Native recording filter sweep was not audible');
console.log('PASS native recording filter sweep changes PCM',JSON.stringify({sweepDifference}));

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
