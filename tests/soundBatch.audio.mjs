import assert from 'node:assert/strict';
import {configureDriveShaper} from '../audioEffects.js';
import {connectProcessorMix,prepareProcessorMix} from '../src/hosts/web/processor-mix.js';
import {attachModulation} from '../src/hosts/web/modulation.js';
import {resolveModulation} from '../src/dsp/modulation.js';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');globalThis.OfflineAudioContext=OfflineAudioContext;let latency;
async function render(mix){
 const rate=16000,ctx=new OfflineAudioContext(1,4096,rate),buffer=ctx.createBuffer(1,4096,rate);buffer.getChannelData(0)[256]=.2;
 latency=await prepareProcessorMix(ctx);
 const source=ctx.createBufferSource();source.buffer=buffer;const shaper=ctx.createWaveShaper(),comp=ctx.createGain();configureDriveShaper(shaper,.2);comp.gain.value=1/(1+.2*1.1);shaper.connect(comp);
 connectProcessorMix(ctx,source,{input:shaper,output:comp},{chain:{version:1,order:['drive'],bypass:[],mix:{drive:mix}}},'drive',{nodes:[]}).connect(ctx.destination);source.start();
 return new Float32Array((await ctx.startRendering()).getChannelData(0));
}
const wet=await render(1),dry=await render(0),half=await render(.5);
let peak=0;for(let i=0;i<wet.length;i++)if(Math.abs(wet[i])>Math.abs(wet[peak]))peak=i;
assert.equal(peak-256,latency,'Measured 4x drive latency must match the compensated dry branch');
let error=0;for(let i=0;i<half.length;i++)error=Math.max(error,Math.abs(half[i]-.5*(wet[i]+(i>=latency?dry[i-latency]:0))));assert.ok(error<1e-6);
console.log('PASS Web Audio compensated drive mix',{latency:peak-256,error});
const ctx=new OfflineAudioContext(1,16000,16000),source=ctx.createConstantSource(),gain=ctx.createGain();source.offset.value=1;source.connect(gain);gain.connect(ctx.destination);source.start();source.stop(1);
const definition={version:1,macros:[{id:'m',name:'volume',value:.3,default:.5}],routes:[{id:'a',target:'amplitude',unit:'linear_gain',depth:.5,polarity:'bipolar',smoothing:0,source:{kind:'macro',id:'m'}}]};
attachModulation(ctx,{modulation:resolveModulation(definition),start:0,off:1,graphEnd:1,expression:{pitch:60,velocity:1}},new Map([['amplitude',gain.gain]]),{nodes:[],sources:[]});
const pcm=(await ctx.startRendering()).getChannelData(0);assert.ok(pcm.slice(128).every(v=>Math.abs(v-.8)<1e-6));console.log('PASS Web Audio macro source scaling');
const {scheduleVocal}=await import('../songAudio.js');
for(const bpm of [40,120,240]){
 const unit=60/bpm/4;
 async function echo(sync){
  const rate=8000,c=new OfflineAudioContext(1,rate*3,rate),buffer=c.createBuffer(1,800,rate);buffer.getChannelData(0)[40]=.5;
  const effects={attack:0,release:0,delayMix:.5,delayFeedback:0,delayTime:60/bpm,...(sync?{delaySync:1}:{})};
  scheduleVocal(c,c.destination,{recording:{id:'r',durationSeconds:.1,trimSeconds:0},clip:{gain:1,lengthSteps:16,effects}},0,unit,new Map([['r',buffer]]));
  return (await c.startRendering()).getChannelData(0);
 }
 const a=await echo(true),b=await echo(false);assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-6));
 assert.ok(a.slice(Math.floor((60/bpm)*8000)).some(v=>Math.abs(v)>1e-4));console.log('PASS Web Audio synced delay echoes',{bpm});
}
