// Optional real Web Audio graph check with an externally installed module.
import assert from 'node:assert/strict';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');
globalThis.OfflineAudioContext=OfflineAudioContext;
const {scheduleVocal}=await import('../songAudio.js');
const rate=16000;
async function render(routes=[],resonance=1.7,{unit=.125,automation,lengthSteps=8}={}){
 const ctx=new OfflineAudioContext(2,rate,rate),buffer=ctx.createBuffer(1,rate*.8,rate);
 buffer.getChannelData(0).forEach((_,i,data)=>{data[i]=.15*Math.sin(i/rate*2*Math.PI*220)+.07*Math.sin(i/rate*2*Math.PI*1300);});
 const clip={id:'c',gain:1,lengthSteps,effects:{attack:0,release:0,filter:{type:'lowpass',cutoff:1200,resonance},automation,modulation:{version:1,routes}}};
 scheduleVocal(ctx,ctx.destination,{recording:{id:'r',durationSeconds:.8,trimSeconds:0},clip},.13,unit,new Map([['r',buffer]]));
 return new Float32Array((await ctx.startRendering()).getChannelData(0));
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

for(const bpm of [40,120,240]){
 const unit=60/bpm/4,synced={...route('tempo','amplitude',.5),source:{kind:'lfo',shape:'triangle',rate:7,sync:4}},free=structuredClone(synced);
 delete free.source.sync;free.source.rate=bpm/240;
 const a=await render([synced],1.7,{unit}),b=await render([free],1.7,{unit});
 const difference=a.reduce((max,value,i)=>Math.max(max,Math.abs(value-b[i])),0);
 assert.ok(difference<1e-7);console.log('PASS Web Audio tempo sync',JSON.stringify({bpm,difference}));
}
const curve={version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',points:Array.from({length:32},(_,i)=>({id:'p'+i,step:i,value:i%2?6000:200}))};
const automated=await render([],1.7,{automation:[{...curve,id:"cutoff"}],unit:.025,lengthSteps:32}),plain=await render([],1.7,{unit:.025,lengthSteps:32});
const curveEffect=automated.reduce((max,value,i)=>Math.max(max,Math.abs(value-plain[i])),0);
assert.ok(curveEffect>.01);assert.ok(automated.every(Number.isFinite));console.log('PASS Web Audio multipoint automation',JSON.stringify({curveEffect}));
