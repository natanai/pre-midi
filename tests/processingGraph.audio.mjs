import assert from 'node:assert/strict';
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??'node-web-audio-api');globalThis.OfflineAudioContext=OfflineAudioContext;
const {scheduleVocal}=await import('../songAudio.js');
const {prepareProcessorMix}=await import('../src/hosts/web/processor-mix.js');
const {withInstance,withParallelRoute,withRouteShare,moveProcessor}=await import('../src/dsp/processing-graph.js');
const rate=24000;
async function render(chain){
 const c=new OfflineAudioContext(1,rate,rate);await prepareProcessorMix(c);
 const b=c.createBuffer(1,rate,rate),data=b.getChannelData(0);for(let i=0;i<rate;i++)data[i]=.3*Math.sin(2*Math.PI*220*i/rate)+.1*Math.sin(2*Math.PI*1700*i/rate);
 scheduleVocal(c,c.destination,{recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{gain:.8,lengthSteps:8,effects:{attack:0,release:0,chain}}},0,.125,new Map([['r',b]]));
 return {pcm:new Float32Array((await c.startRendering()).getChannelData(0)),latency:c.processorMixLatency};
}
const base={chain:{version:1,order:[],bypass:[]}},plain=await render(base.chain);
const filter={chain:withInstance(base,'filter')};filter.chain.instances[0].parameters.cutoff=300;const one=await render(filter.chain);
filter.chain=withInstance(filter,'filter');filter.chain.instances[1].parameters.cutoff=800;const two=await render(filter.chain);
const diff=(a,b)=>a.reduce((n,v,i)=>Math.max(n,Math.abs(v-b[i])),0);assert.ok(diff(one.pcm,two.pcm)>.001);
for(const count of [1,2]){
 const patch=structuredClone(base);for(let i=0;i<count;i++){patch.chain=withInstance(patch,'drive');patch.chain.instances[i].parameters.amount=i?.3:.5;}
 const wet=await render(patch.chain);patch.chain=withParallelRoute(patch);for(const p of patch.chain.instances)patch.chain=moveProcessor(patch.chain,p.id,'route-1');patch.chain=withRouteShare(patch.chain,'dry',.4);
 const blend=await render(patch.chain),delay=wet.latency*count;let error=0;
 for(let i=delay+256;i<rate*.8;i++)error=Math.max(error,Math.abs(blend.pcm[i]-(plain.pcm[i-delay]*.4+wet.pcm[i]*.6)));
 assert.ok(error<1e-6,'Parallel Web Audio alignment failed '+error);console.log('PASS Web Audio independent stages and compensated parallel routing',JSON.stringify({count,latency:delay,error}));
}
