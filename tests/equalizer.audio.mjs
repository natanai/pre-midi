import assert from 'node:assert/strict';
import {scheduleVocal} from '../songAudio.js';
import {defaultEq} from '../src/dsp/equalizer.js';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
const rate=16000;
async function render({eq,filterStages=1,filter=null}={}){
 const c=new OfflineAudioContext(1,rate,rate),buffer=c.createBuffer(1,rate,rate);
 buffer.getChannelData(0).forEach((_,i,a)=>a[i]=.15*Math.sin(2*Math.PI*220*i/rate)+.15*Math.sin(2*Math.PI*5000*i/rate));
 scheduleVocal(c,c.destination,{recording:{id:'v',durationSeconds:1,trimSeconds:0},clip:{gain:1,lengthSteps:8,effects:{eq,filterStages,chain:{version:1,order:['eq','filter'],bypass:[]},filter,attack:0,release:0}}},0,.125,new Map([['v',buffer]]));
 return new Float32Array((await c.startRendering()).getChannelData(0));
}
function amplitude(pcm,f){let real=0,imag=0;for(let i=3200;i<12800;i++){real+=pcm[i]*Math.cos(2*Math.PI*f*i/rate);imag+=pcm[i]*Math.sin(2*Math.PI*f*i/rate);}return Math.hypot(real,imag)*2/9600;}
const eq=defaultEq();eq.bands[0]={...eq.bands[0],enabled:true,type:'bell',frequency:220,gain:6,q:.707};
const plain=await render(),boosted=await render({eq});const gain=20*Math.log10(amplitude(boosted,220)/amplitude(plain,220));assert.ok(Math.abs(gain-6)<.001);
const filter={type:'lowpass',cutoff:1000,resonance:1,sweep:0,sweepTime:.2};const single=await render({filter}),steep=await render({filter,filterStages:4});const ratio=amplitude(steep,5000)/amplitude(single,5000);assert.ok(ratio<.02);assert.ok(steep.every(Number.isFinite));
console.log('PASS real Web Audio EQ bell gain and cascaded slope',{gainDb:gain,stopBandRatio:ratio});
const c=new OfflineAudioContext(1,rate,rate),tail=c.createBuffer(1,rate,rate);tail.getChannelData(0).fill(.8,Math.floor(.76*rate));scheduleVocal(c,c.destination,{recording:{id:'v',durationSeconds:1,trimSeconds:0},clip:{gain:1,lengthSteps:8,trimEndSeconds:.25,effects:{attack:0,release:0,transpose:12}}},0,.125,new Map([['v',tail]]));
assert.ok((await c.startRendering()).getChannelData(0).every(v=>Math.abs(v)<1e-7));console.log('PASS Web Audio vocal end trim excludes removed source under rate transpose');

const eightEq={version:1,bands:Array.from({length:8},(_,i)=>({...eq.bands[0],id:'b'+i,enabled:i===7}))};const eight=await render({eq:eightEq});assert.ok(Math.abs(20*Math.log10(amplitude(eight,220)/amplitude(plain,220))-6)<.001);console.log('PASS Web Audio eighth EQ band');
