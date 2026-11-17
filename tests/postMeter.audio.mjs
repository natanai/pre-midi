import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {withInstance} from '../src/dsp/processing-graph.js';
import {planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {encodeNativeSession} from '../src/hosts/native/session.js';
import {scheduleVocal} from '../songAudio.js';
import {preparePostProcessing,collectPostMeasurements} from '../src/hosts/web/post-processing.js';
const api=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
class OfflineAudioContext extends api.OfflineAudioContext{
 constructor(...args){super(...args);const add=this.audioWorklet.addModule.bind(this.audioWorklet);this.audioWorklet.addModule=url=>add(String(url).startsWith('file:')?fileURLToPath(url):url);}
}
globalThis.AudioWorkletNode=api.AudioWorkletNode;
const directory=await mkdtemp(join(tmpdir(),'premidi-post-meter-')),binary=join(directory,'render'),rate=24000,frames=4800;
const pcm=new Float32Array(2*frames).fill(.5),handles=new Map([['r',{id:1,duration:.2,normalization:1}]]);
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off','native/session-render.cpp','-o',binary]);
 const chain=withInstance({chain:{version:1,order:[],bypass:[]}},'compressor');
 Object.assign(chain.instances[0].parameters,{threshold:-12,ratio:4,knee:0,attack:0,makeup:6});
 const pureReduction=(20*Math.log10(.5)+12)*.75;
 for(const mix of [0,.5,1]){
  chain.mix={'compressor-1':mix};
  // Keep the processor alive at mix zero to test a bypassed measured interval.
  const automation=[{id:'mix',version:1,target:'processor.compressor-1.mix',unit:'ratio',interpolation:'linear',points:[{id:'a',step:0,value:mix},{id:'b',step:8,value:mix}]}];
  const event={recording:{id:'r',durationSeconds:.2,trimSeconds:0},clip:{gain:1,lengthSteps:1.6,effects:{chain,automation,attack:0,release:0}}};
  const plan=planNativeVocal(event,0,.125,handles),packet=encodeNativeSession([plan],rate,[{rate,channels:2,frames,pcm}]);
  const rendered=spawnSync(binary,[rate,1,0,0,rate,128,0,'post'].map(String),{input:packet,maxBuffer:1000000});
  if(rendered.status)throw Error(rendered.stderr.toString());
  const native=rendered.stdout.readDoubleLE(0);
  const context=new OfflineAudioContext(2,rate,rate);context.soundPreviewMeasurements=[];
  await preparePostProcessing(context);
  const buffer=context.createBuffer(2,frames,rate);buffer.getChannelData(0).fill(.5);buffer.getChannelData(1).fill(.5);
  scheduleVocal(context,context.destination,event,0,.125,new Map([['r',buffer]]));
  await context.startRendering();
  const measured=await collectPostMeasurements(context);
  assert.ok(measured,'The worklet did not return preview measurement');
  const web=measured[0].reduction;
  const expected=-20*Math.log10(1-mix+mix*10**(-pureReduction/20));
  assert.ok(Math.abs(native-expected)<1e-9,'Native detector '+JSON.stringify({mix,native,expected}));
  assert.ok(Math.abs(web-expected)<1e-9,'Worklet detector '+JSON.stringify({mix,web,expected}));
  console.log('PASS measured gain reduction excludes makeup and follows wet/dry',JSON.stringify({mix,native,web,expected}));
 }
}finally{await rm(directory,{recursive:true,force:true});}
