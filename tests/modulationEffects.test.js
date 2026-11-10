import test from 'node:test';import assert from 'node:assert/strict';
import {create,parse,upgradeBeatFeatures} from '../schema.js';import {createSong} from '../songModel.js';import {parseSong} from '../songIO.js';
import {validatePatch} from '../synth.js';import {withInstance,moveProcessor} from '../src/dsp/processing-graph.js';
import {validateProcessingChain,withProcessorRemoved,withProcessorAdded,withProcessorBypass} from '../src/dsp/processing-chain.js';
import {MOD_EFFECT_KINDS,ModEffectKernel,modEffectTail} from '../src/dsp/modulation-effects.js';
import {compilePostProcessing,postTailSeconds,songNeedsPostDelay} from '../src/dsp/post-processing.js';
import {processingFromPatch,applyProcessingToPatch} from '../recordedAudio.js';import {vocalSeekEvents} from '../src/hosts/web/vocal-seek.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';import {planNativeVocal} from '../src/hosts/native/sample-plan.js';import {renderEndSeconds} from '../audio.js';
const effect=kind=>({chain:withInstance({},kind)});
test('modulation effects share project recall, bounded post ordering and recorded source reuse',()=>{
 const beat=create(),patch=beat.instruments[0].sounds[0].patch;
 for(const kind of MOD_EFFECT_KINDS)patch.chain=withInstance(patch,kind);
 assert.deepEqual(validatePatch(patch),[]);upgradeBeatFeatures(beat);assert.deepEqual(parse(JSON.stringify(beat)),beat);const song=createSong(beat);assert.deepEqual(parseSong(JSON.stringify(song)),song);
 const copy=structuredClone(patch);applyProcessingToPatch(copy,processingFromPatch(patch));assert.deepEqual(compilePostProcessing(copy),compilePostProcessing(patch));
 assert.throws(()=>withInstance(patch,'compressor'),/four/);assert.throws(()=>moveProcessor(patch.chain,'chorus-1','serial'),/after level/);
 patch.chain.instances[0].parameters.phase=.37;patch.chain=withProcessorRemoved(patch,'chorus-1');patch.chain=withProcessorAdded(patch,'chorus-1');assert.equal(compilePostProcessing(patch).at(-1).phase,.37);
 assert.ok(songNeedsPostDelay(createSong(beat)));patch.chain=withProcessorBypass(patch,'chorus-1',true);patch.chain=withProcessorBypass(patch,'flanger-1',true);assert.equal(songNeedsPostDelay(createSong(beat)),false);
 for(const kind of MOD_EFFECT_KINDS){const fx=effect(kind);for(const [key,bad]of [['rate',0],['depth',-1],['phase',2],['sync',.75],['foreign',1]]){const invalid=structuredClone(fx);invalid.chain.instances[0].parameters[key]=bad;assert.ok(validateProcessingChain(invalid.chain).length,kind+' '+key);}}
});
test('tempo sync resolves at scheduling without changing saved free rate or phase',()=>{
 const beat=create(),patch=beat.instruments[0].sounds[0].patch;patch.chain=withInstance(patch,'chorus');const p=patch.chain.instances[0].parameters;p.sync=2;p.rate=3.71;p.phase=.23;
 const slow=planSynthVoice({patch,volume:.5},{pitch:60,velocity:.8},0,.5,{unit:.25}),fast=planSynthVoice({patch,volume:.5},{pitch:60,velocity:.8},0,.5,{unit:.125});
 assert.equal(slow.postProcessing[0].rate,.5);assert.equal(fast.postProcessing[0].rate,1);assert.equal(fast.patch.chain.instances[0].parameters.rate,3.71);assert.equal(p.sync,2);
 const free=effect('chorus');free.chain.instances[0].parameters.rate=1;free.chain.instances[0].parameters.phase=.23;
 assert.deepEqual(fast.postProcessing,compilePostProcessing(free));
});
test('auto-pan follows an independent equal-power gain oracle and zero depth is transparent',()=>{
 const fx=effect('autopan'),p=fx.chain.instances[0].parameters;p.rate=1;p.phase=0;const recipe=compilePostProcessing(fx)[0],kernel=new ModEffectKernel(recipe,48000),frame=new Float32Array(2);
 for(const t of [0,.25,.5,.75,1]){frame.set([.3,.7]);kernel.process(frame,t);const pan=Math.sin(2*Math.PI*t);assert.ok(Math.abs(frame[0]-.3*Math.SQRT2*Math.cos((pan+1)*Math.PI/4))<4e-8);assert.ok(Math.abs(frame[1]-.7*Math.SQRT2*Math.sin((pan+1)*Math.PI/4))<5e-8);}
 p.depth=0;const neutral=new ModEffectKernel(compilePostProcessing(fx)[0],48000);frame.set([.3,-.7]);const original=frame.slice();neutral.process(frame,.239);assert.deepEqual(frame,original);assert.equal(postTailSeconds(fx),0);
});
test('delay effects have exact impulse timing, signed bounded feedback and correctly exported tails',()=>{
 for(const kind of ['chorus','flanger'])for(const feedback of [0,.8,-.8]){
  const fx=effect(kind),p=fx.chain.instances[0].parameters;Object.assign(p,{depth:0,delay:.01,feedback,stereo:0});fx.chain.mix={[kind+'-1']:1};
  const recipe=compilePostProcessing(fx)[0],kernel=new ModEffectKernel(recipe,8000),frame=new Float32Array(2),length=Math.ceil(modEffectTail(recipe)*8000);let last=0;
  for(let i=0;i<length;i++){frame.fill(i===0?1:0);kernel.process(frame,i/8000);if(i<80)assert.equal(frame[0],0);if(i===80)assert.ok(Math.abs(frame[0]-(1-Math.abs(feedback)))<1e-7);if(i===160)assert.ok(Math.abs(frame[0]-(1-Math.abs(feedback))*feedback)<1e-7);if(i>=length-80)last=Math.max(last,Math.abs(frame[0]));}
  assert.ok(last<1e-7,kind+' tail '+last);
  const event={recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{gain:1,lengthSteps:8,effects:fx}},plan=planNativeVocal(event,0,.125,new Map([['r',{id:1,duration:1}]]));
  assert.ok(plan.graphEnd>plan.end);const song={kind:'song',bpm:120,beats:[],recordings:[event.recording],tracks:[{kind:'vocal',clips:[{...event.clip,id:'c',recordingId:'r',startStep:0}]}]};
  const end=renderEndSeconds(song,[{kind:'vocal',at:0,event}],new Map());assert.ok(end>=plan.graphEnd);
  assert.equal(vocalSeekEvents(song,8.2,new Map([['r',{duration:1}]])).length,1,'seek must retain an ended Clip effect tail');
 }
});

test('stationary phaser matches an independent all-pass and feedback frequency response',()=>{
 const fx=effect('phaser'),p=fx.chain.instances[0].parameters;Object.assign(p,{depth:0,frequency:900,stereo:0,feedback:.6});
 const rate=8000,frequency=700,w=2*Math.PI*frequency/rate,g=Math.tan(Math.PI*p.frequency/rate),a=(g-1)/(g+1),den=1+2*a*Math.cos(w)+a*a;
 const angle=6*Math.atan2(-(1-a*a)*Math.sin(w)/den,(2*a+(1+a*a)*Math.cos(w))/den),fb=p.feedback,d=1-2*fb*Math.cos(angle-w)+fb*fb;
 const hr=(1-Math.abs(fb))*(Math.cos(angle)-fb*Math.cos(w))/d,hi=(1-Math.abs(fb))*(Math.sin(angle)-fb*Math.sin(w))/d;
 const mix=compilePostProcessing(fx)[0].mix,kernel=new ModEffectKernel(compilePostProcessing(fx)[0],rate),frame=new Float32Array(2);let error=0;
 for(let i=0;i<rate;i++){const input=Math.sin(w*i);frame.fill(input);kernel.process(frame,i/rate);if(i>rate/2)error=Math.max(error,Math.abs(frame[0]-((1-mix+mix*hr)*Math.sin(w*i)+mix*hi*Math.cos(w*i))));}
 assert.ok(error<1e-7,'analytic all-pass response '+error);
});
test('extreme modulation/feedback remains finite with a silent bounded tail at low and high rates',()=>{
 for(const rate of [8000,192000])for(const kind of ['chorus','flanger','phaser']){
  const fx=effect(kind),p=fx.chain.instances[0].parameters;
  Object.assign(p,{rate:rate===8000?20:.01,feedback:rate===8000?-.8:.8,phase:.75,stereo:.5});
  if(kind==='phaser'){p.frequency=50;p.depth=4;}else p.depth=kind==='chorus'?.012:.005;
  const recipe=compilePostProcessing(fx)[0],kernel=new ModEffectKernel(recipe,rate),frame=new Float32Array(2),end=Math.ceil(modEffectTail(recipe)*rate);let peak=0,tail=0;
  for(let i=0;i<end;i++){frame.fill(i===0?1:0);kernel.process(frame,i/rate);assert.ok(Number.isFinite(frame[0])&&Number.isFinite(frame[1]));peak=Math.max(peak,Math.abs(frame[0]),Math.abs(frame[1]));if(i>end-128)tail=Math.max(tail,Math.abs(frame[0]),Math.abs(frame[1]));}
  assert.ok(peak<4,kind+' extreme peak '+peak);assert.ok(tail<1e-6,kind+' extreme tail '+tail);
 }
});
