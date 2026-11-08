import {parameterFor} from "../../dsp/parameters.js";
import {prepareControlLfo,startControlLfo} from "./oscillator.js";
import {validateModulation,smoothingAlpha,modulationStateBefore,modulationWave} from "../../dsp/modulation.js";
import {planAmplitudeEnvelope} from "../../dsp/amplitude-envelope.js";
import {windowEnvelope} from "../../dsp/envelope-window.js";
import {scheduleAmplitudeEnvelope} from "../../../envelope.js";
// Audio-rate control signals; no per-note, sample-sized JS arrays or UI timers.
export function attachModulation(context,plan,destinations,owner,{precise=false}={}){
 const definition=plan.modulation;if(!definition)return;
 const elapsed=plan.elapsed??0;
 const errors=validateModulation(definition);if(errors.length)throw Error(errors.join(" "));
 const add=node=>{owner.nodes.push(node);return node;};
 const source=node=>{owner.sources.push(node);node.start(plan.start);node.stop(plan.graphEnd);return node;};
 const constant=value=>{const node=context.createConstantSource();node.offset.value=value;return source(node);};
 const targetInputs=new Map();
 for(const route of [...definition.routes].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
  let input,normal;
  if(route.source.kind==="lfo"){
   if(route.source.shape!=="sine"){
    const wave=context.createBuffer(1,4096,context.sampleRate),data=wave.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=modulationWave(route.source.shape,i/data.length);
    const oscillator=context.createBufferSource();oscillator.buffer=wave;oscillator.loop=true;oscillator.playbackRate.value=route.source.rate*4096/context.sampleRate;
    owner.sources.push(oscillator);oscillator.start(plan.start,((elapsed*route.source.rate)%1)*wave.duration);oscillator.stop(plan.graphEnd);input=oscillator;
   }else if(precise||elapsed>0){
    const prepared=prepareControlLfo(context,route.source.rate,plan.start,{precise,elapsed});
    const preciseSource=prepared.source;owner.sources.push(preciseSource);startControlLfo(prepared);preciseSource.stop(plan.graphEnd);
    const gate=add(context.createGain());gate.gain.value=0;gate.gain.setValueAtTime(1,plan.start);preciseSource.connect(gate);input=gate;
   }else{const oscillator=context.createOscillator();oscillator.type="sine";oscillator.frequency.value=route.source.rate;input=source(oscillator);}
   normal={signed:true};
  }else if(route.source.kind==="envelope"){
   const amp=add(context.createGain());constant(1).connect(amp);
   if(elapsed>0){
    const full=planAmplitudeEnvelope({start:0,off:plan.off-plan.start+elapsed,peak:1,envelope:route.source.envelope});
    const events=full.events.map(e=>({...e,kind:e.kind==="linear"?1:0}));
    for(const e of windowEnvelope(events,elapsed,plan.start))amp.gain[e.kind?"linearRampToValueAtTime":"setValueAtTime"](e.value,e.time);
   }else scheduleAmplitudeEnvelope(amp.gain,{start:plan.start,off:plan.off,peak:1,envelope:route.source.envelope});
   input=amp;normal={signed:false};
  }else{
   const value=route.source.kind==="velocity"?plan.expression.velocity:Math.max(-1,Math.min(1,(plan.expression.pitch-route.source.root)/route.source.span));
   input=constant(value);normal={signed:route.source.kind==="keytrack"};
  }
  const range=add(context.createGain());
  range.gain.value=normal.signed?(route.polarity==="unipolar"?.5:1):(route.polarity==="bipolar"?2:1);
  input.connect(range);
  const sum=add(context.createGain());range.connect(sum);
  const offset=normal.signed&&route.polarity==="unipolar"?.5:!normal.signed&&route.polarity==="bipolar"?-1:0;
  if(offset)constant(offset).connect(sum);
  let smoothed=sum;
  if(route.smoothing>0){
   const alpha=smoothingAlpha(route.smoothing,context.sampleRate),filter=add(context.createIIRFilter([alpha],[1,-(1-alpha)]));sum.connect(filter);smoothed=filter;
   if(elapsed>0){
    const initial=(1-alpha)*modulationStateBefore(route,{...plan.expression,elapsed,gate:plan.off-plan.start+elapsed},context.sampleRate);
    const correction=add(context.createGain()),resumed=add(context.createGain());
    correction.gain.setValueAtTime(initial,plan.start);correction.gain.setTargetAtTime(0,plan.start,route.smoothing);
    constant(1).connect(correction);correction.connect(resumed);filter.connect(resumed);smoothed=resumed;
   }
  }
  const depth=add(context.createGain());depth.gain.value=route.depth;smoothed.connect(depth);
  if(!targetInputs.has(route.target))targetInputs.set(route.target,[]);targetInputs.get(route.target).push(depth);
 }
 for(const [target,inputs] of targetInputs){
  const destination=destinations.get(target);if(!destination)continue; // inactive zero-level oscillator slot
  const sum=add(context.createGain());inputs.forEach(input=>input.connect(sum));
  if(target==="filter.resonance"||target==="amplitude"){
   const p=parameterFor(target),half=(p.max-p.min)/2,mid=(p.max+p.min)/2;
   const base=target==="amplitude"?1:plan.patch?.filter?.resonance??plan.resonance??destination.value;
   constant(base-mid).connect(sum);destination.cancelScheduledValues(plan.start);destination.value=0;destination.setValueAtTime(0,plan.start);
   const normalize=add(context.createGain()),clamp=add(context.createWaveShaper()),scale=add(context.createGain());
   normalize.gain.value=1/half;clamp.curve=new Float32Array([-1,0,1]);scale.gain.value=half;
   sum.connect(normalize);normalize.connect(clamp);clamp.connect(scale);scale.connect(destination);constant(mid).connect(destination);
  }else if(target.endsWith(".level")){
   constant(destination.value).connect(sum);destination.value=0;
   const clamp=add(context.createWaveShaper());clamp.curve=new Float32Array([0,0,1]);sum.connect(clamp);clamp.connect(destination);
  }else{
   const limit=parameterFor(target).modulation.limit;
   const normalize=add(context.createGain()),clamp=add(context.createWaveShaper()),scale=add(context.createGain());
   normalize.gain.value=1/limit;clamp.curve=new Float32Array([-1,0,1]);scale.gain.value=limit*(target==="filter.cutoff"?1200:1);
   sum.connect(normalize);normalize.connect(clamp);clamp.connect(scale);scale.connect(destination);
  }
 }
}
