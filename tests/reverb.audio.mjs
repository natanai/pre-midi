import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {defaultReverb} from '../src/dsp/reverb.js';import {planNativeVocal,planNativeSample} from '../src/hosts/native/sample-plan.js';import {encodeNativeSession} from '../src/hosts/native/session.js';import {planSynthVoice} from '../src/dsp/synth-voice.js';import {cleanPatch} from './audio-quality/fixtures.js';
import {scheduleVocal} from '../songAudio.js';import {scheduleSynthPlan} from '../audio.js';import {VoiceSession} from '../src/hosts/web/voice-session.js';import {prepareProcessorMix} from '../src/hosts/web/processor-mix.js';import {prepareVocalSeek,VocalSeekCache} from '../src/hosts/web/vocal-seek.js';
const api=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
class Offline extends api.OfflineAudioContext{constructor(...args){super(...args);const add=this.audioWorklet.addModule.bind(this.audioWorklet);this.audioWorklet.addModule=url=>add(String(url).startsWith('file:')?fileURLToPath(url):url);}}
globalThis.OfflineAudioContext=Offline;globalThis.AudioWorkletNode=api.AudioWorkletNode;
const rate=24000,seconds=2,frames=rate*seconds,sourceFrames=rate/8,pcm=Float32Array.from({length:sourceFrames*2},(_,i)=>{const n=Math.floor(i/2);return Math.fround(.2*Math.sin(2*Math.PI*(i%2?330:440)*n/rate)+(n===0?.6:0));}),asset={rate,channels:2,frames:sourceFrames,pcm},handles=new Map([['r',{id:1,duration:.125,normalization:1}]]);
const room={...defaultReverb(),mix:.65,decay:.35,preDelay:.025,damping:.3,size:.6,width:.8},fx={attack:0,release:0,reverb:room},event=effects=>({recording:{id:'r',durationSeconds:.125,trimSeconds:0},clip:{id:'clip',gain:.7,lengthSteps:1,effects}});
const folder=await mkdtemp(join(tmpdir(),'premidi-room-')),bin=join(folder,'render');
const difference=(a,b)=>{assert.equal(a.length,b.length);return a.reduce((n,v,i)=>Math.max(n,Math.abs(v-b[i])),0);};
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off',fileURLToPath(new URL('../native/session-render.cpp',import.meta.url)),'-o',bin]);
 const native=(plans,{seek=0,block=128,loop=false,cycle=1,length=seconds,assets=[asset]}={})=>{const out=spawnSync(bin,[rate,cycle,seek,Number(loop),Math.round(length*rate),block,0].map(String),{input:encodeNativeSession(plans,rate,assets),maxBuffer:8e6,timeout:15000});if(out.status)throw Error(out.stderr.toString());return new Float32Array(new Uint8Array(out.stdout).buffer);};
 const buffer=new Offline(2,1,rate).createBuffer(2,sourceFrames,rate);for(let i=0;i<sourceFrames;i++)for(let ch=0;ch<2;ch++)buffer.getChannelData(ch)[i]=pcm[2*i+ch];
 const web=async({effects=fx,hits=[0],synth=null}={})=>{
  const c=new Offline(2,frames,rate);await prepareProcessorMix(c,effects);const master=c.createGain();master.gain.value=.85;master.connect(c.destination);const session=new VoiceSession(c,master);
  if(synth)scheduleSynthPlan(c,master,synth,session);else for(const at of hits)scheduleVocal(c,master,event(effects),at,.125,new Map([['r',buffer]]),{session});
  assert.equal(session.diagnostics.buses,1);const rendered=await c.startRendering(),out=new Float32Array(frames*2);for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)out[2*i+ch]=rendered.getChannelData(ch)[i];return out;
 };
 const plan=planNativeVocal(event(fx),0,.125,handles),audio=native([plan]),browser=await web(),error=difference(audio,browser);assert.ok(error<2e-6,'native/browser room '+error);
 assert.equal(difference(audio,native([plan],{block:17})),0);assert.ok(difference(audio.slice(rate),native([plan],{seek:.5,length:1.5}))<1e-7);
 const doubled=native([plan,plan]);assert.ok(difference(doubled,Float32Array.from(audio,v=>v*2))<2e-7,'shared room is not linear');
 const loop=native([plan],{loop:true,cycle:1});assert.ok(difference(loop,await web({hits:[0,1]}))<2e-6,'continuous loop room history differs');
 const samplePatch={type:'sample',presetId:'custom',zones:[{assetId:'r',root:60}],followPitch:false,oneShot:true,audioMode:'clip',transpose:0,gain:.7,pan:0,...fx},sample=planNativeSample({patch:samplePatch,volume:1},{pitch:60,velocity:1},0,.125,handles);assert.ok(difference(audio,native([sample]))<1e-7);
 const synthPatch=cleanPatch();synthPatch.reverb=room;const synth=planSynthVoice({patch:synthPatch,volume:.5},{pitch:72,velocity:.8},.010123,.2),synthNative=native([synth],{assets:[]});assert.ok(difference(synthNative,await web({synth}))<1e-4,'synth room parity');
 const sourceEvent=event(fx),song={kind:'song',bpm:120,recordings:[sourceEvent.recording],tracks:[{kind:'vocal',clips:[{...sourceEvent.clip,recordingId:'r',startStep:0}]}]},cached=(await prepareVocalSeek(song,4,new Map([['r',buffer]]),rate,{seekCache:new VocalSeekCache()})).get('clip');assert.ok(cached,'completed Clip room tail omitted from seek');let seekError=0;for(let i=rate/2;i<frames&&i<cached.buffer.length;i++)for(let ch=0;ch<2;ch++)seekError=Math.max(seekError,Math.abs(audio[2*i+ch]-Math.fround(cached.buffer.getChannelData(ch)[i]*Math.fround(.85))));assert.ok(seekError<2e-6,'cached room seek '+seekError);
 const bypass={...fx,chain:{version:1,order:[],bypass:['reverb']}},dry=native([planNativeVocal(event(bypass),0,.125,handles)]);assert.ok(audio.slice(rate/2).some(v=>Math.abs(v)>.00001));assert.ok(dry.slice(rate/2).every(v=>v===0));
 const mixed={...fx,delayMix:.3,delayTime:.1,delayFeedback:.3};assert.ok(difference(native([planNativeVocal(event(mixed),0,.125,handles)]),await web({effects:mixed}))<2e-6,'parallel echo and room sends');
 console.log('PASS shared reverb native/worklet, synth/sample/vocal, overlap, echo, continuous loops, block/seek history and completed-Clip continuation',JSON.stringify({error,seekError}));
}finally{await rm(folder,{recursive:true,force:true});}
