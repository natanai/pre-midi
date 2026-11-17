import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {withInstance} from '../src/dsp/processing-graph.js';
import {postAutomationFields} from '../src/dsp/processor-automation.js';
import {planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {encodeNativeSession} from '../src/hosts/native/session.js';
import {scheduleVocal} from '../songAudio.js';
import {preparePostProcessing} from '../src/hosts/web/post-processing.js';
const api=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
class OfflineAudioContext extends api.OfflineAudioContext{
 constructor(...args){super(...args);const add=this.audioWorklet.addModule.bind(this.audioWorklet);this.audioWorklet.addModule=url=>add(String(url).startsWith('file:')?fileURLToPath(url):url);}
}
globalThis.OfflineAudioContext=OfflineAudioContext;globalThis.AudioWorkletNode=api.AudioWorkletNode;
const rate=24000,frames=rate,pcm=Float32Array.from({length:2*frames},(_,i)=>{
 const t=Math.floor(i/2)/rate;
 const level=t>.2&&t<.4||t>.65&&t<.8?.0001:1;
 return level*(i%2?.5:1)*(.3*Math.sin(2*Math.PI*220*t)+.12*Math.sin(2*Math.PI*5400*t));
});
const folder=await mkdtemp(join(tmpdir(),'premidi-post-movement-')),binary=join(folder,'render');
const asset={rate,channels:2,frames,pcm},handles=new Map([['r',{id:1,duration:1,normalization:1}]]);
const lane=(id,field,unit,values,interpolation='linear')=>({id:field,version:1,target:'processor.'+id+'.'+field,unit,interpolation,
 points:values.map(([step,value],i)=>({id:field+i,step,value}))});
const difference=(a,b)=>{assert.equal(a.length,b.length);return a.reduce((n,v,i)=>Math.max(n,Math.abs(v-b[i])),0);};
try{
 execFileSync(process.env.CXX??'c++',['-std=c++17','-O2','-ffp-contract=off','native/session-render.cpp','-o',binary]);
 const native=(plan,seek=0)=>{
  const input=encodeNativeSession([plan],rate,[asset]);
  const result=spawnSync(binary,[rate,1,seek,0,Math.round((1-seek)*rate),17,0].map(String),{input,maxBuffer:8000000,timeout:15000});
  if(result.status)throw Error(result.stderr.toString());
  return new Float32Array(new Uint8Array(result.stdout).buffer);
 };
 const web=async(event,start)=>{
  const context=new OfflineAudioContext(2,frames,rate);await preparePostProcessing(context);
  const master=context.createGain();master.gain.value=.85;master.connect(context.destination);
  const buffer=context.createBuffer(2,frames,rate);
  for(let i=0;i<frames;i++){buffer.getChannelData(0)[i]=pcm[2*i];buffer.getChannelData(1)[i]=pcm[2*i+1];}
  scheduleVocal(context,master,event,start,.125,new Map([['r',buffer]]));
  const output=await context.startRendering(),interleaved=new Float32Array(2*frames);
  for(let i=0;i<frames;i++){interleaved[2*i]=output.getChannelData(0)[i];interleaved[2*i+1]=output.getChannelData(1)[i];}
  return interleaved;
 };
 let worst=0;
 for(const kind of ['compressor','gate','limiter','deesser','chorus','flanger','phaser','autopan','ringmod','frequencyshift']){
  const chain=withInstance({chain:{version:1,order:[],bypass:[]}},kind),id=chain.post[0];
  const fields=postAutomationFields(kind),parameters=chain.instances[0].parameters;
  if(kind==='gate'||kind==='limiter')parameters.threshold=-18;
  for(const [field,definition] of Object.entries(fields)){
   if(field==='enabled')continue;
   const depth=(definition.max-definition.min)*.12;
   const movement={id:'motion',source:{kind:'lfo',shape:'sine',rate:1.37,phase:.27},
    target:'processor.'+id+'.'+field,unit:definition.unit,depth,polarity:'bipolar',smoothing:.005};
   const automation=field==='mix'?undefined:[lane(id,field,definition.unit,[[0,definition.min],[8,definition.max]])];
   const event={recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{startStep:0,gain:1,lengthSteps:8,
    effects:{attack:0,release:0,chain,automation,modulation:{version:1,routes:[movement]}}}};
   const start=.010123,plan=planNativeVocal(event,start,.125,handles),audio=native(plan),browser=await web(event,start),error=difference(audio,browser);
   assert.ok(error<2e-6,kind+' '+field+' host error '+error);worst=Math.max(worst,error);
   assert.equal(difference(audio.slice(Math.round(.45*rate)*2),native(plan,.45)),0,kind+' '+field+' seek changed history');
   const plain={...event,clip:{...event.clip,effects:{...event.clip.effects,modulation:undefined}}};
   if(field!=='hold')assert.ok(difference(audio,native(planNativeVocal(plain,start,.125,handles)))>1e-7,kind+' '+field+' movement is inaudible');
  }
  console.log('PASS',kind,'all continuous movement targets with automation, native/worklet PCM and seek history');
 }
 // A macro above the upper bound must equal an independently authored fully
 // wet reference, while a zero-mix starting patch must not discard its graph.
 const chain=withInstance({chain:{version:1,order:[],bypass:[]}},'compressor');chain.mix={'compressor-1':0};
 const route={id:'macro',target:'processor.compressor-1.mix',unit:'ratio',depth:1,polarity:'unipolar',smoothing:0,source:{kind:'macro',id:'wet'}};
 const event={recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{gain:1,lengthSteps:8,effects:{chain,attack:0,release:0,
  automation:[lane('compressor-1','mix','ratio',[[0,.7],[8,.7]])],
  modulation:{version:1,macros:[{id:'wet',name:'wet',value:1,default:1}],routes:[route]}}}};
 const plan=planNativeVocal(event,0,.125,handles),wet=native(plan);
 const ref={...event,clip:{...event.clip,effects:{chain:{...chain,mix:{'compressor-1':1}},attack:0,release:0}}};
 assert.equal(difference(wet,native(planNativeVocal(ref,0,.125,handles))),0,'Base, automation, modulation and bounds precedence changed');
 assert.ok(difference(wet,await web(event,0))<1e-7);
 console.log('PASS bounded macro composition and zero-mix activation',JSON.stringify({worst}));
}finally{await rm(folder,{recursive:true,force:true});}
