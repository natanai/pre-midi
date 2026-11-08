// Optional real Web Audio graph check with an externally installed module.
import assert from 'node:assert/strict';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
globalThis.OfflineAudioContext=OfflineAudioContext;
const {scheduleVocal}=await import('../songAudio.js');
const rate=16000;
async function render(routes=[],resonance=1.7){
 const ctx=new OfflineAudioContext(2,rate,rate),buffer=ctx.createBuffer(1,rate*.8,rate);
 buffer.getChannelData(0).forEach((_,i,data)=>{data[i]=.15*Math.sin(i/rate*2*Math.PI*220)+.07*Math.sin(i/rate*2*Math.PI*1300);});
 const clip={id:'c',gain:1,lengthSteps:8,effects:{attack:0,release:0,filter:{type:'lowpass',cutoff:1200,resonance},modulation:{version:1,routes}}};
 scheduleVocal(ctx,ctx.destination,{recording:{id:'r',durationSeconds:.8,trimSeconds:0},clip},.13,.125,new Map([['r',buffer]]));
 return (await ctx.startRendering()).getChannelData(0);
}
const route=(id,target,depth,unit='linear_gain')=>({id,target,depth,unit,polarity:'unipolar',smoothing:0,source:{kind:'lfo',shape:'square',rate:.05}});
const base=await render();
for(const depth of [-1,1]){
 const data=await render([route('a','amplitude',depth),route('b','amplitude',depth)]),factor=depth<0?0:2;
 const difference=data.reduce((max,value,i)=>Math.max(max,Math.abs(value-factor*base[i])),0);
 assert.ok(difference<1e-6,`Amplitude bound failed ${difference}`);
 console.log('PASS Web Audio amplitude bound',JSON.stringify({factor,maxDifference:difference}));
}
const low=await render([],.1),routed=await render([route('q','filter.resonance',-15.9,'filter_resonance')]);
const difference=routed.reduce((max,value,i)=>Math.max(max,Math.abs(value-low[i])),0);
assert.ok(difference<1e-5,`Resonance base/bound failed ${difference}`);
console.log('PASS Web Audio resonance bound at delayed onset',JSON.stringify({maxDifference:difference}));
