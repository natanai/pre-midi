import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {cleanPatch} from './audio-quality/fixtures.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';import {encodeNativeSession} from '../src/hosts/native/session.js';
import {withInstance} from '../src/dsp/processing-graph.js';import {laneValueAt} from '../src/dsp/automation.js';
import {planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {scheduleVocal} from '../songAudio.js';
import {rebaseNativePlansToPage} from '../src/hosts/native/page-plan.js';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');globalThis.OfflineAudioContext=OfflineAudioContext;
const {scheduleSynthPlan}=await import('../audio.js');
const folder=await mkdtemp(join(tmpdir(),'premidi-automation-')),bin=join(folder,'render'),rate=24000,frames=rate;
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off',fileURLToPath(new URL('../native/session-render.cpp',import.meta.url)),'-o',bin]);
 const native=(plan,{seek=0,block=128,asset=null}={})=>{const bytes=encodeNativeSession([plan],rate,asset?[asset]:null),result=spawnSync(bin,[rate,1,seek,0,Math.round((1-seek)*rate),block,0].map(String),{input:bytes,maxBuffer:8*1024*1024});if(result.status)throw Error(result.stderr.toString());return new Float32Array(new Uint8Array(result.stdout).buffer);};
 const web=async plan=>{const c=new OfflineAudioContext(2,frames,rate);const master=c.createGain();master.gain.value=.85;master.connect(c.destination);scheduleSynthPlan(c,master,plan);const b=await c.startRendering(),out=new Float32Array(frames*2);for(let i=0;i<frames;i++){out[2*i]=b.getChannelData(0)[i];out[2*i+1]=b.getChannelData(1)[i];}return out;};
 const lane=(target,unit,values,interpolation='linear')=>({id:target,version:1,target,unit,interpolation,points:values.map(([step,value],i)=>({id:String(i),step,value}))});
 const patch=cleanPatch(),make=(lanes,p=patch,start=.01)=>planSynthVoice({patch:p,volume:.4},{pitch:60,velocity:.8},start,.55,{automation:lanes,timeline:{step:0,unit:.05,limitStep:16}});
 const base=native(make([lane('pan','pan',[[0,0],[16,0]])]));
 const curves=[lane('pan','pan',[[0,-1],[16,1]]),lane('amplitude','linear_gain',[[0,.25],[8,1.5],[16,.5]])],plan=make(curves),audio=native(plan);let oracle=0;
 for(let i=Math.ceil(plan.start*rate);i<frames;i++){
  const step=(i/rate-plan.start)/.05,pan=laneValueAt(curves[0],Math.min(16,step)),gain=laneValueAt(curves[1],Math.min(16,step)),angle=(pan+1)*Math.PI/4;
  oracle=Math.max(oracle,Math.abs(audio[2*i]-base[2*i]*gain*Math.cos(angle)/Math.SQRT1_2),Math.abs(audio[2*i+1]-base[2*i+1]*gain*Math.sin(angle)/Math.SQRT1_2));
 }
 assert.ok(oracle<1e-7,'Independent pan/amplitude oracle '+oracle);
 const difference=(a,b)=>a.reduce((n,v,i)=>Math.max(n,Math.abs(v-b[i])),0);
 assert.equal(difference(audio,native(plan,{block:17})),0);assert.equal(difference(audio.slice(rate*.4*2),native(plan,{seek:.4})),0);
 const rebased=rebaseNativePlansToPage([make(curves,patch,2.01)],rate*2,rate)[0];assert.ok(difference(audio,native(rebased))<1e-7,'Page rebasing changes automation phase');
 const cases=[curves,[lane('amplitude','linear_gain',[[0,0],[8,1],[16,.3]],'step')],[lane('filter.cutoff','hz',[[0,400],[8,6000],[16,900]],'exponential'),lane('filter.resonance','filter_resonance',[[0,.1],[16,5]])],[lane('oscillators.0.detune','cents',[[0,-90],[16,80]]),lane('oscillators.0.level','linear_gain',[[0,.1],[16,.7]])]];
 const filtered=structuredClone(patch);filtered.chain=withInstance(filtered,'filter');cases.push([lane('processor.filter-1.cutoff','hz',[[0,200],[16,5000]],'exponential'),lane('processor.filter-1.resonance','filter_resonance',[[0,.2],[16,3]])]);
 const modulated=structuredClone(patch);modulated.version=2;modulated.modulation={version:1,routes:['amplitude','filter.resonance','oscillators.0.level'].map((target,i)=>({id:'macro'+i,source:{kind:'velocity'},target,unit:i===1?'filter_resonance':'linear_gain',depth:i===1?3:.4,polarity:'unipolar',smoothing:0}))};
 const routed=make([lane('amplitude','linear_gain',[[0,.2],[16,1.8]]),lane('filter.resonance','filter_resonance',[[0,.1],[16,15]]),lane('oscillators.0.level','linear_gain',[[0,.1],[16,.8]])],modulated);
 const mixedError=difference(native(routed),await web(routed));assert.ok(mixedError<1e-4,"Automation/modulation precedence "+mixedError);
 let parity=0;for(let i=0;i<cases.length;i++){const p=make(cases[i],i===cases.length-1?filtered:patch),a=native(p),b=await web(p),error=difference(a,b);assert.ok(error<1e-4,'Native/browser parameter automation '+i+' error '+error);parity=Math.max(parity,error);}
 const stereo=[lane('stereoWidth','ratio',[[0,0],[8,2],[16,.5]]),lane('msBalance','balance',[[0,-1],[8,1],[16,-.5]])];
 const c=new OfflineAudioContext(2,frames,rate),buffer=c.createBuffer(2,frames,rate),pcm=new Float32Array(frames*2);for(let i=0;i<frames;i++){buffer.getChannelData(0)[i]=pcm[2*i]=.2*Math.sin(2*Math.PI*220*i/rate);buffer.getChannelData(1)[i]=pcm[2*i+1]=.3*Math.cos(2*Math.PI*440*i/rate);}
 const event={recording:{id:'voice',durationSeconds:1,trimSeconds:0},clip:{gain:.7,lengthSteps:8,effects:{attack:0,release:0,automation:stereo}}},vocal=planNativeVocal(event,0,.0625,new Map([['voice',{id:1,duration:1}]])),out=c.createGain();out.gain.value=.85;out.connect(c.destination);scheduleVocal(c,out,event,0,.0625,new Map([['voice',buffer]]));const rendered=await c.startRendering(),comparison=new Float32Array(frames*2);for(let i=0;i<frames;i++){comparison[2*i]=rendered.getChannelData(0)[i];comparison[2*i+1]=rendered.getChannelData(1)[i];}
 const stereoError=difference(native(vocal,{asset:{rate,channels:2,frames,pcm}}),comparison);assert.ok(stereoError<1e-6,'Stereo image automation '+stereoError);
 console.log('PASS parameter automation: independent pan/amplitude oracle, linear/exponential/step lanes, oscillator/filter/instance targets, seeks, blocks, page rebasing and native/browser PCM',JSON.stringify({oracle,parity,mixedError,stereoError,cases:cases.length}));
}finally{await rm(folder,{recursive:true,force:true});}
