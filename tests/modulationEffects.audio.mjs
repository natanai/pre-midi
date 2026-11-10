// Focused audio behavior for the newly shared classic modulation processors.
import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {prepareProcessorMix} from '../src/hosts/web/processor-mix.js';
import {defaultReverb} from '../src/dsp/reverb.js';
import {withInstance} from '../src/dsp/processing-graph.js';import {compilePostProcessing} from '../src/dsp/post-processing.js';import {MOD_EFFECT_KINDS,ModEffectKernel,modEffectTail} from '../src/dsp/modulation-effects.js';import {DynamicsKernel} from '../src/dsp/dynamics-kernel.js';
import {planNativeVocal,planNativeSample} from '../src/hosts/native/sample-plan.js';import {encodeNativeSession} from '../src/hosts/native/session.js';import {rebaseNativePlansToPage} from '../src/hosts/native/page-plan.js';import {preparePostProcessing} from '../src/hosts/web/post-processing.js';
import {scheduleVocal} from '../songAudio.js';import {scheduleSynthPlan} from '../audio.js';import {planSynthVoice} from '../src/dsp/synth-voice.js';import {cleanPatch} from './audio-quality/fixtures.js';import {prepareVocalSeek,VocalSeekCache} from '../src/hosts/web/vocal-seek.js';
const api=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
class OfflineAudioContext extends api.OfflineAudioContext{constructor(...args){super(...args);const add=this.audioWorklet.addModule.bind(this.audioWorklet);this.audioWorklet.addModule=url=>add(String(url).startsWith('file:')?fileURLToPath(url):url);}}
globalThis.OfflineAudioContext=OfflineAudioContext;globalThis.AudioWorkletNode=api.AudioWorkletNode;
const folder=await mkdtemp(join(tmpdir(),'premidi-motion-')),bin=join(folder,'render'),rate=24000,sourceSeconds=.3,seconds=1.5,frames=Math.round(seconds*rate),sourceFrames=Math.round(sourceSeconds*rate),pcm=Float32Array.from({length:sourceFrames*2},(_,i)=>{const t=Math.floor(i/2)/rate;return Math.floor(i/2)>=sourceFrames-2?0:.3*(Math.sin(2*Math.PI*220*t)+.5*Math.sin(2*Math.PI*1731*t))*(i%2?.4:1);}),asset={rate,channels:2,frames:sourceFrames,pcm},handles=new Map([['r',{id:1,duration:sourceSeconds,normalization:1}]]);
const difference=(a,b)=>{assert.equal(a.length,b.length);return a.reduce((n,v,i)=>Math.max(n,Math.abs(v-b[i])),0);};
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off',fileURLToPath(new URL('../native/session-render.cpp',import.meta.url)),'-o',bin]);
 const stateBin=join(folder,'state-check');execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off','-Wall','-Wextra','-Werror','-pedantic',fileURLToPath(new URL('../native/modulation-effects-test.cpp',import.meta.url)),'-o',stateBin]);console.log(execFileSync(stateBin,{encoding:'utf8'}).trim());
 const native=(plans,{seek=0,block=128,assets=[asset],loop=false,seconds:duration=seconds,cycle=1.5}={})=>{const result=spawnSync(bin,[rate,cycle,seek,Number(loop),Math.round(duration*rate),block,0].map(String),{input:encodeNativeSession(plans,rate,assets),maxBuffer:12*1024*1024,timeout:10000});if(result.status)throw Error(result.stderr.toString());return new Float32Array(new Uint8Array(result.stdout).buffer);};
 const effect=kind=>({attack:0,release:0,chain:withInstance({},kind)});
 const event=fx=>({recording:{id:'r',durationSeconds:sourceSeconds,trimSeconds:0},clip:{id:'c',gain:1.25,lengthSteps:sourceSeconds/.125,effects:fx}});
 const web=async(fx,{synth=null,start=0,unit=.125}={})=>{
  const c=new OfflineAudioContext(2,frames,rate);await preparePostProcessing(c);await prepareProcessorMix(c,fx??synth?.patch);const master=c.createGain();master.gain.value=.85;master.connect(c.destination);
  if(synth)scheduleSynthPlan(c,master,synth);else{const buffer=c.createBuffer(2,sourceFrames,rate);for(let ch=0;ch<2;ch++)for(let i=0;i<sourceFrames;i++)buffer.getChannelData(ch)[i]=pcm[2*i+ch];scheduleVocal(c,master,event(fx),start,unit,new Map([['r',buffer]]));}
  const b=await c.startRendering(),out=new Float32Array(frames*2);for(let ch=0;ch<2;ch++)for(let i=0;i<frames;i++)out[2*i+ch]=b.getChannelData(ch)[i];return out;
 };
 // Keep two silent source frames at EOF: these fixtures isolate effect clocks
 // from the existing host-specific interpolation of an abruptly cut PCM endpoint.
 const dry=effect('autopan');dry.chain.bypass=['autopan-1'];const dryPlan=planNativeVocal(event(dry),.010123,.125,handles),dryA=native([dryPlan]),dryB=await web(dry,{start:.010123}),dryError=difference(dryA,dryB);assert.ok(dryError<2e-6,'fractional source endpoint '+dryError);
 let worst=0;
 for(const kind of MOD_EFFECT_KINDS){
  const fx=effect(kind);Object.assign(fx.chain.instances[0].parameters,{rate:3,phase:.23,...(kind==='autopan'?{}:{feedback:-.6,stereo:.37})});
  const plan=planNativeVocal(event(fx),0,.125,handles),audio=native([plan]),error=difference(audio,await web(fx));assert.ok(error<2e-6,kind+' native/worklet '+error);worst=Math.max(worst,error);
  const kernels=compilePostProcessing(fx).map(p=>new ModEffectKernel(p,rate)),frame=new Float32Array(2);let oracle=0;
  for(let i=0;i<frames;i++){frame[0]=Math.fround((pcm[2*i]??0)*1.25);frame[1]=Math.fround((pcm[2*i+1]??0)*1.25);if(i<Math.ceil(plan.graphEnd*rate))for(const kernel of kernels)kernel.process(frame,i/rate);else frame.fill(0);for(let ch=0;ch<2;ch++)oracle=Math.max(oracle,Math.abs(audio[2*i+ch]-Math.fround(frame[ch]*Math.fround(.85))));}
  assert.ok(oracle<2e-7,kind+' kernel '+oracle);
  assert.equal(difference(audio,native([plan],{block:17})),0);assert.equal(difference(audio.slice(Math.round(.15*rate)*2),native([plan],{seek:.15,seconds:seconds-.15})),0);
  assert.equal(difference(native([plan,plan]),Float32Array.from(audio,v=>v*2)),0,'overlap shares effect state');
  const repeated=native([plan],{loop:true,seconds:3});assert.ok(difference(audio,repeated.slice(frames*2))<1e-7,'loop phase/history differs');
  const shifted={...plan,start:2,off:plan.off+2,end:plan.end+2,graphEnd:plan.graphEnd+2,events:plan.events.map(e=>({...e,time:e.time+2})),pitch:{...plan.pitch,start:2},sweep:{...plan.sweep,sweepEnd:plan.sweep.sweepEnd+2}};assert.ok(difference(audio,native(rebaseNativePlansToPage([shifted],rate*2,rate)))<1e-7,'page clock phase changed');
  const samplePatch={type:'sample',presetId:'custom',zones:[{assetId:'r',root:60}],followPitch:false,oneShot:true,audioMode:'clip',transpose:0,gain:1.25,pan:0,...fx};const sample=planNativeSample({patch:samplePatch,volume:1},{pitch:60,velocity:1},0,sourceSeconds,handles);assert.ok(difference(audio,native([sample]))<1e-7,'sample/vocal effects differ');
  const patch=cleanPatch();patch.chain=structuredClone(fx.chain);const synth=planSynthVoice({patch,volume:.5},{pitch:60,velocity:.8},.010123,.3),synthError=difference(native([synth],{assets:[]}),await web(null,{synth}));assert.ok(synthError<1e-4,'fractional synth '+synthError);
  const buffer=new OfflineAudioContext(2,1,rate).createBuffer(2,sourceFrames,rate);for(let ch=0;ch<2;ch++)for(let i=0;i<sourceFrames;i++)buffer.getChannelData(ch)[i]=pcm[2*i+ch];
  const e=event(fx),song={kind:'song',bpm:120,recordings:[e.recording],tracks:[{id:'v',kind:'vocal',clips:[{...e.clip,recordingId:'r',startStep:0}]}]},cached=(await prepareVocalSeek(song,1.2,new Map([['r',buffer]]),rate,{seekCache:new VocalSeekCache()})).get('c');assert.ok(cached);let seekError=0;for(let i=Math.round(.15*rate);i<Math.min(frames,cached.buffer.length);i++)for(let ch=0;ch<2;ch++)seekError=Math.max(seekError,Math.abs(audio[2*i+ch]-Math.fround(cached.buffer.getChannelData(ch)[i]*Math.fround(.85))));assert.ok(seekError<2e-7,'browser seek history '+seekError);
  const bypass=structuredClone(fx);bypass.chain.bypass=[kind+'-1'];assert.ok(difference(audio,native([planNativeVocal(event(bypass),0,.125,handles)]))>.001,'inaudible processor');
  console.log('PASS',kind,'native/worklet, synth/sample/vocal, overlap, loop, seek, block, page phase and bypass',JSON.stringify({error,oracle,synthError,seekError}));
 }
 // Changing post order changes the signal; all processors remain per voice.
 const mixed=effect('chorus');mixed.chain=withInstance(mixed,'compressor');mixed.chain.instances[1].parameters.threshold=-30;const forward=native([planNativeVocal(event(mixed),0,.125,handles)]);mixed.chain.post.reverse();assert.ok(difference(forward,native([planNativeVocal(event(mixed),0,.125,handles)]))>.001);assert.ok(difference(native([planNativeVocal(event(mixed),0,.125,handles)]),await web(mixed))<2e-6);
 // Resolve beat sync before encoding, preserving the authored free-Hz setting.
 const synced=effect('chorus');Object.assign(synced.chain.instances[0].parameters,{sync:2,rate:13});const unit=.25,plan=planNativeVocal(event(synced),.010123,unit,handles);const syncedAudio=native([plan]),syncedWeb=await web(synced,{start:.010123,unit}),syncedError=difference(syncedAudio,syncedWeb);assert.ok(syncedError<2e-6,'synced fractional vocal '+syncedError+' at '+syncedAudio.findIndex((v,i)=>Math.abs(v-syncedWeb[i])===syncedError));assert.equal(synced.chain.instances[0].parameters.rate,13);
 const sends=effect('flanger');sends.reverb={...defaultReverb(),mix:.4,decay:.2,preDelay:.012};sends.delayMix=.35;sends.delayTime=.071;sends.delayFeedback=.2;const sendsError=difference(native([planNativeVocal(event(sends),0,.125,handles)]),await web(sends));assert.ok(sendsError<2e-6,'post effect into echo + room '+sendsError);
 console.log('PASS mixed dynamics/effect order, synced fractional Clip onset and echo/room sends',JSON.stringify({worst,sendsError}));
}finally{await rm(folder,{recursive:true,force:true});}
