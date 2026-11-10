import test from 'node:test';import assert from 'node:assert/strict';import {withInstance} from '../src/dsp/processing-graph.js';import {compilePostProcessing,postTailSeconds} from '../src/dsp/post-processing.js';import {ModEffectKernel} from '../src/dsp/modulation-effects.js';
const level=(data,frequency,rate)=>{let re=0,im=0;for(let n=rate/4;n<rate*3/4;n++){const phase=2*Math.PI*frequency*n/rate;re+=data[n]*Math.cos(phase);im-=data[n]*Math.sin(phase);}return Math.hypot(re,im)*4/rate;};
test('ring modulation produces two sidebands; frequency shifting translates Hz without the mirror',()=>{
 const rate=24000;
 for(const kind of ['ringmod','frequencyshift'])for(const frequency of kind==='ringmod'?[100]:[-100,100]){
  const fx={chain:withInstance({},kind)};fx.chain.mix={[kind+'-1']:1};fx.chain.instances[0].parameters.frequency=frequency;fx.chain.instances[0].parameters.stereo=0;
  const recipe=compilePostProcessing(fx)[0],kernel=new ModEffectKernel(recipe,rate),frame=new Float32Array(2),output=new Float32Array(rate);
  for(let n=0;n<rate;n++){frame.fill(Math.sin(2*Math.PI*1000*n/rate));kernel.process(frame,n/rate);output[n]=frame[0];}
  const upper=level(output,1000+Math.abs(frequency),rate),lower=level(output,1000-Math.abs(frequency),rate);if(kind==='ringmod'){assert.ok(Math.abs(upper-.5)<.001);assert.ok(Math.abs(lower-.5)<.001);}else {const desired=frequency>0?upper:lower,mirror=frequency>0?lower:upper;assert.ok(Math.abs(desired-1)<.002);assert.ok(mirror/desired<.001,'translation mirror '+mirror);}
  assert.equal(postTailSeconds(fx),.03);
 }
});
test('frequency processors align dry and wet to their declared 64-frame delay and reject pitch-style data',()=>{
 for(const kind of ['ringmod','frequencyshift']){
  const fx={chain:withInstance({},kind)},p=fx.chain.instances[0].parameters;p.frequency=0;p.stereo=0;fx.chain.mix={[kind+'-1']:0.000001};const kernel=new ModEffectKernel(compilePostProcessing(fx)[0],8000),frame=new Float32Array(2);
  for(let n=0;n<150;n++){frame.fill(n===0?1:0);kernel.process(frame,n/8000);if(n===64)assert.ok(frame[0]>.99999);else assert.ok(Math.abs(frame[0])<1e-6);}
  p.frequency=3000;assert.throws(()=>compilePostProcessing(fx),/Invalid/);
 }
});
test('frequency processors suppress shifted Nyquist wrap and downward DC crossing',()=>{
 const rate=24000;
 for(const [kind,carrier,input,fold]of [['ringmod',2000,11500,10500],['frequencyshift',2000,11500,10500],['frequencyshift',-2000,500,1500]]){
  const fx={chain:withInstance({},kind)};fx.chain.mix={[kind+'-1']:1};fx.chain.instances[0].parameters.frequency=carrier;fx.chain.instances[0].parameters.stereo=0;const kernel=new ModEffectKernel(compilePostProcessing(fx)[0],rate),frame=new Float32Array(2),output=new Float32Array(rate);
  for(let i=0;i<rate;i++){frame.fill(Math.sin(2*Math.PI*input*i/rate));kernel.process(frame,i/rate);output[i]=frame[0];}assert.ok(level(output,fold,rate)<.001,'frequency boundary leakage');
 }
});
