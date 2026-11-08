// Optional focused graph check; install the Web Audio module outside the repo.
import assert from 'node:assert/strict';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
globalThis.OfflineAudioContext=OfflineAudioContext;
const {scheduleVocal}=await import('../songAudio.js');
const {scheduleSample}=await import('../sampler.js');
const {scheduleSynthPlan}=await import('../audio.js');
const {planSynthVoice}=await import('../src/dsp/synth-voice.js');
const {makePatch}=await import('../synth.js');
const rate=24000;
async function render(kind,{chain,filterOff=false,drive=.65,delayMix=.3}={}){
 const ctx=new OfflineAudioContext(2,rate*2,rate),buffer=ctx.createBuffer(1,rate,rate);
 const pcm=buffer.getChannelData(0);for(let i=0;i<pcm.length;i++)pcm[i]=.3*Math.sin(i/rate*2*Math.PI*220)+.12*Math.sin(i/rate*2*Math.PI*1700);
 const fx={chain,drive,delayMix,delayTime:.12,delayFeedback:.3,attack:0,release:0,filter:filterOff?null:{type:'lowpass',cutoff:700,resonance:.7}};
 if(kind==='synth'){
  const patch=makePatch();patch.chain=chain;patch.filter={type:'lowpass',cutoff:700,resonance:.7,sweep:0,sweepTime:.2};patch.effects={drive,delayMix,delayTime:.12,delayFeedback:.3};patch.noise=0;
  if(filterOff)patch.chain={version:1,order:['filter','drive'],bypass:['filter']};
  scheduleSynthPlan(ctx,ctx.destination,planSynthVoice({patch,volume:1},{pitch:60,velocity:1},.03,1));
 }else if(kind==='sample'){
  const patch={type:'sample',presetId:'custom',zones:[{assetId:'r',root:60}],followPitch:false,oneShot:true,audioMode:'clip',transpose:0,gain:1,pan:0,...fx};
  scheduleSample(ctx,ctx.destination,{patch,volume:1},{pitch:60,velocity:1},.03,1,{bpm:120},new Map([['r',buffer]]));
 }else scheduleVocal(ctx,ctx.destination,{recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{id:'c',lengthSteps:8,gain:1,effects:fx}},.03,.125,new Map([['r',buffer]]));
 return new Float32Array((await ctx.startRendering()).getChannelData(0));
}
const diff=(a,b)=>a.reduce((max,v,i)=>Math.max(max,Math.abs(v-b[i])),0);
for(const kind of ['synth','sample','vocal']){
 const standard=await render(kind),reverse=await render(kind,{chain:{version:1,order:['drive','filter'],bypass:[]}});
 const orderEffect=diff(standard,reverse);assert.ok(orderEffect>.001,kind+' order must affect sound');
 for(const [stage,reference] of [['filter',{filterOff:true}],['drive',{drive:0}],['delay',{delayMix:0}]]){
  const bypass=await render(kind,{chain:{version:1,order:['filter','drive'],bypass:[stage]}}),plain=await render(kind,reference);
  const difference=diff(bypass,plain);assert.ok(difference<1e-5,kind+' '+stage+' bypass differs '+difference);
 }
 for(const [order,reference] of [[['drive'],{filterOff:true}],[['filter'],{drive:0}],[[],{filterOff:true,drive:0}]]){
  const removed=await render(kind,{chain:{version:1,order,bypass:[]}}),plain=await render(kind,reference);
  assert.ok(diff(removed,plain)<1e-5,kind+' removal did not exclude its stage');
 }
 console.log('PASS Web Audio processing chain' ,JSON.stringify({kind,orderEffect}));
}
