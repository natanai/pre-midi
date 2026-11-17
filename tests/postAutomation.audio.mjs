import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {withInstance} from '../src/dsp/processing-graph.js';
import {postAutomationFields} from '../src/dsp/processor-automation.js';
import {laneValueAt} from '../src/dsp/automation.js';
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
const folder=await mkdtemp(join(tmpdir(),'premidi-post-automation-')),binary=join(folder,'render');
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
  if(kind==='gate')parameters.threshold=-18;
  if(kind==='limiter')parameters.threshold=-18;
  const variations={threshold:[-40,-10],ratio:[1,12],knee:[0,16],attack:[.002,.03],release:[.02,.2],makeup:[-3,3],range:[12,72],hold:[0,.05],frequency:kind==='deesser'?[3200,7000]:kind==='phaser'?[100,2300]:[20,120],bandwidth:[.4,2],amount:[2,15],rate:[.2,4],depth:kind==='phaser'?[.1,3]:kind==='autopan'?[.1,1]:[0,kind==='chorus'?.008:.004],phase:[0,.4],stereo:[.1,.5],feedback:[-.4,.7],delay:kind==='chorus'?[.006,.035]:[.0005,.008]};
  // Exercise each field separately so a missing assignment cannot be concealed
  // by another active lane. Keep a wet interval through each curve.
  for(const [field,definition] of Object.entries(fields)){
   let values=field==='mix'?[[0,0],[2,1],[4,0],[6,1],[8,.5]]:field==='enabled'?[[0,1],[2,0],[4,1],[8,1]]:[[0,variations[field][0]],[8,variations[field][1]]];
   const automation=[lane(id,field,definition.unit,values,field==='enabled'?'step':'linear')];
   const event={recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{gain:1,lengthSteps:8,effects:{attack:0,release:0,chain,automation}}};
   const start=.010123,plan=planNativeVocal(event,start,.125,handles),audio=native(plan),browser=await web(event,start),error=difference(audio,browser);
   assert.ok(error<2e-6,kind+' '+field+' host error '+error);worst=Math.max(worst,error);
   assert.equal(difference(audio.slice(Math.round(.45*rate)*2),native(plan,.45)),0,kind+' '+field+' seek changed history');
   const base={...event,clip:{...event.clip,effects:{...event.clip.effects,automation:undefined}}};
   if(field!=='hold')assert.ok(difference(audio,native(planNativeVocal(base,start,.125,handles)))>1e-6,kind+' '+field+' automation is inaudible');
   if(field==='enabled'&&kind==='compressor'){
    const dry={...base,clip:{...base.clip,effects:{...base.clip.effects,chain:{...chain,bypass:[id]}}}};
    const dryAudio=native(planNativeVocal(dry,start,.125,handles));
    for(let i=Math.ceil((start+.25)*rate);i<Math.floor((start+.5)*rate);i++)
     assert.ok(Math.abs(audio[2*i]-dryAudio[2*i])<1e-7,'Disabled compressor changed dry gain');
   }
  }
  console.log('PASS',kind,'all parameter lanes, native/worklet PCM and seek continuity');
 }
 console.log('PASS post processor automation',JSON.stringify({worst}));
}finally{await rm(folder,{recursive:true,force:true});}
