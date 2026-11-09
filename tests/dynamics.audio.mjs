import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {withInstance} from '../src/dsp/processing-graph.js';import {compileDynamics} from '../src/dsp/dynamics.js';import {DynamicsKernel} from '../src/dsp/dynamics-kernel.js';
import {planNativeVocal,planNativeSample} from '../src/hosts/native/sample-plan.js';import {encodeNativeSession} from '../src/hosts/native/session.js';import {rebaseNativePlansToPage} from '../src/hosts/native/page-plan.js';
import {scheduleVocal} from '../songAudio.js';import {prepareVocalSeek,VocalSeekCache} from '../src/hosts/web/vocal-seek.js';import {prepareDynamics} from '../src/hosts/web/dynamics.js';import {planSynthVoice} from '../src/dsp/synth-voice.js';import {scheduleSynthPlan} from '../audio.js';import {cleanPatch} from './audio-quality/fixtures.js';
const api=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
// Node's worklet adapter accepts filesystem paths rather than file: URLs.
class OfflineAudioContext extends api.OfflineAudioContext{constructor(...args){super(...args);const add=this.audioWorklet.addModule.bind(this.audioWorklet);this.audioWorklet.addModule=url=>add(String(url).startsWith('file:')?fileURLToPath(url):url);}}
globalThis.OfflineAudioContext=OfflineAudioContext;globalThis.AudioWorkletNode=api.AudioWorkletNode;
const folder=await mkdtemp(join(tmpdir(),'premidi-dynamics-')),bin=join(folder,'render'),rate=24000,frames=rate,pcm=Float32Array.from({length:frames*2},(_,i)=>{const t=Math.floor(i/2)/rate,level=t<.2?.7:t<.4?.04:t<.6?.6:.00002,sibilance=t>=.2&&t<.6?.2*Math.sin(2*Math.PI*6500*t):0;return (level*Math.sin(2*Math.PI*220*t)+sibilance)*(i%2?.5:1);}),asset={rate,channels:2,frames,pcm},handles=new Map([['r',{id:1,duration:1,normalization:1}]]);
const difference=(a,b)=>{assert.equal(a.length,b.length);return a.reduce((n,v,i)=>Math.max(n,Math.abs(v-b[i])),0);};
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off',fileURLToPath(new URL('../native/session-render.cpp',import.meta.url)),'-o',bin]);
 const native=(plans,{seek=0,block=128,assets=[asset],loop=false,seconds=1}={})=>{const bytes=encodeNativeSession(plans,rate,assets),out=spawnSync(bin,[rate,1,seek,Number(loop),Math.round(seconds*rate),block,0].map(String),{input:bytes,maxBuffer:8*1024*1024,timeout:10000});if(out.status)throw Error(out.stderr.toString());return new Float32Array(new Uint8Array(out.stdout).buffer);};
 const rejectPacket=(input,pattern)=>{const out=spawnSync(bin,[rate,1,0,0,128,128,0].map(String),{input,maxBuffer:1024*1024,timeout:10000});assert.equal(out.status,1);assert.match(out.stderr.toString(),pattern);};
 const effects=kind=>{const patch={chain:{version:1,order:[],bypass:[]}};patch.chain=withInstance(patch,kind);return {attack:0,release:0,...patch};};
 const event=fx=>({recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{gain:1.25,lengthSteps:8,effects:fx}});
 const web=async(fx,{synth=null}={})=>{
  const c=new OfflineAudioContext(2,frames,rate);await prepareDynamics(c);
  const master=c.createGain();master.gain.value=.85;master.connect(c.destination);
  if(synth)scheduleSynthPlan(c,master,synth);else{const buffer=c.createBuffer(2,frames,rate);for(let i=0;i<frames;i++){buffer.getChannelData(0)[i]=pcm[2*i];buffer.getChannelData(1)[i]=pcm[2*i+1];}scheduleVocal(c,master,event(fx),0,.125,new Map([['r',buffer]]));}
  const rendered=await c.startRendering(),output=new Float32Array(frames*2);for(let i=0;i<frames;i++){output[2*i]=rendered.getChannelData(0)[i];output[2*i+1]=rendered.getChannelData(1)[i];}return output;
 };
 let worst=0;
 for(const kind of ['compressor','gate','limiter','deesser']){
  const fx=effects(kind);if(kind==='limiter')fx.chain.instances[0].parameters.threshold=-15;
  const plan=planNativeVocal(event(fx),0,.125,handles),audio=native([plan]),browser=await web(fx),error=difference(audio,browser);assert.ok(error<2e-6,kind+' native/worklet '+error);worst=Math.max(worst,error);
  if(kind==='compressor'){
   const bytes=encodeNativeSession([plan],rate,[asset]),at=bytes.length-80,tooMany=bytes.slice(),invalid=bytes.slice();new DataView(tooMany.buffer).setUint32(at,5,true);rejectPacket(tooMany,/Too many post-level/);new DataView(invalid.buffer).setFloat64(at+16,0,true);rejectPacket(invalid,/Invalid dynamics recipe/);
  }
  if(kind==='deesser'){
   const invalid=encodeNativeSession([plan],rate,[asset]);new DataView(invalid.buffer).setFloat64(invalid.length-24,0,true);rejectPacket(invalid,/Invalid dynamics recipe/);
  }
  const doubled=native([plan,plan]);assert.equal(difference(doubled,Float32Array.from(audio,v=>v*2)),0,'Overlapping voices share a detector');
  const repeated=native([plan],{loop:true,seconds:2});assert.equal(difference(audio,repeated.slice(frames*2)),0,'Loop did not reset note-owned dynamics');
  const recipe=compileDynamics(fx)[0],kernel=new DynamicsKernel(recipe,rate);let oracle=0;
  const frame=new Float32Array(2);
  for(let i=0;i<frames;i++){frame[0]=Math.fround(pcm[2*i]*1.25);frame[1]=Math.fround(pcm[2*i+1]*1.25);kernel.process(frame);oracle=Math.max(oracle,Math.abs(audio[2*i]-Math.fround(frame[0]*Math.fround(.85))),Math.abs(audio[2*i+1]-Math.fround(frame[1]*Math.fround(.85))));}
  assert.ok(oracle<2e-7,kind+' prepared gain/linked oracle '+oracle);
  assert.equal(difference(audio,native([plan],{block:17})),0);assert.equal(difference(audio.slice(Math.round(.45*rate)*2),native([plan],{seek:.45,seconds:.55})),0);
  const buffer=new OfflineAudioContext(2,1,rate).createBuffer(2,frames,rate);for(let i=0;i<frames;i++){buffer.getChannelData(0)[i]=pcm[2*i];buffer.getChannelData(1)[i]=pcm[2*i+1];}
  const sourceEvent=event(fx),song={kind:'song',bpm:120,recordings:[sourceEvent.recording],tracks:[{id:'v',kind:'vocal',clips:[{...sourceEvent.clip,id:'c',recordingId:'r',startStep:0}]}]},cached=(await prepareVocalSeek(song,3.6,new Map([['r',buffer]]),rate,{seekCache:new VocalSeekCache()})).get('c');
  assert.ok(cached,'Dynamics-only Clip was omitted from seek reconstruction');let seekError=0;for(let i=Math.round(.45*rate);i<frames;i++)for(let ch=0;ch<2;ch++)seekError=Math.max(seekError,Math.abs(audio[2*i+ch]-Math.fround(cached.buffer.getChannelData(ch)[i]*Math.fround(.85))));assert.ok(seekError<2e-7,'Browser dynamics history was reset on seek '+seekError);
  const samplePatch={type:'sample',presetId:'custom',zones:[{assetId:'r',root:60}],followPitch:false,oneShot:true,audioMode:'clip',transpose:0,gain:1.25,pan:0,...fx},sample=planNativeSample({patch:samplePatch,volume:1},{pitch:60,velocity:1},0,1,handles);
  assert.equal(difference(audio,native([sample])),0,'Sample/vocal processing differs');
  const shifted={...plan,start:2,off:3,end:3,graphEnd:3,events:plan.events.map(e=>({...e,time:e.time+2})),pitch:{...plan.pitch,start:2},sweep:{...plan.sweep,sweepEnd:plan.sweep.sweepEnd+2}};
  assert.ok(difference(audio,native(rebaseNativePlansToPage([shifted],rate*2,rate)))<1e-7,'Page-local dynamics changed');
  const bypass=structuredClone(fx);bypass.chain.bypass=[kind+'-1'];const dry=native([planNativeVocal(event(bypass),0,.125,handles)]);assert.ok(difference(audio,dry)>.001,kind+' has no audible effect');
  console.log('PASS',kind,'native/worklet, linked oracle, sample/vocal, seek/block and page clocks',JSON.stringify({error,oracle,seekError}));
 }
 // The compressor must respond to articulation gain, not raw oscillator level.
 const patch=cleanPatch();patch.chain=withInstance(patch,'compressor');patch.chain.instances[0].parameters.threshold=-30;
 const synth=planSynthVoice({patch,volume:.5},{pitch:60,velocity:.8},.010123,.5),synthAudio=native([synth],{assets:[]}),synthError=difference(synthAudio,await web(null,{synth}));assert.ok(synthError<1e-4,'Synth post-articulation dynamics '+synthError);
 const bright=cleanPatch();bright.chain=withInstance(bright,'deesser');Object.assign(bright.chain.instances[0].parameters,{frequency:4000,threshold:-45,amount:12});
 const brightPlan=planSynthVoice({patch:bright,volume:.5},{pitch:108,velocity:.8},.010123,.5),brightAudio=native([brightPlan],{assets:[]});assert.ok(difference(brightAudio,await web(null,{synth:brightPlan}))<1e-4,'Synth de-esser native/worklet');
 bright.chain.bypass=['deesser-1'];assert.ok(difference(brightAudio,native([planSynthVoice({patch:bright,volume:.5},{pitch:108,velocity:.8},.010123,.5)],{assets:[]}))>.001,'Synth de-esser does not process the sound');
 const fx=effects('compressor');fx.chain=withInstance(fx,'limiter');fx.chain.instances[1].parameters.threshold=-20;const forward=native([planNativeVocal(event(fx),0,.125,handles)]);fx.chain.post.reverse();const reverse=native([planNativeVocal(event(fx),0,.125,handles)]);assert.ok(difference(forward,reverse)>.001,'Post-level order has no effect');
 console.log('PASS post-level ordering, fractional synth onset and independent voice ownership',JSON.stringify({worst,synthError}));
}finally{await rm(folder,{recursive:true,force:true});}
