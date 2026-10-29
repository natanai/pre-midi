import {prepareSineLfo} from "./oscillator.js";
import {validateModulation,smoothingAlpha} from "../../dsp/modulation.js";
import {scheduleAmplitudeEnvelope} from "../../../envelope.js";
// Audio-rate control signals; no per-note, sample-sized JS arrays or UI timers.
export function attachModulation(context,plan,destinations,owner,{precise=false}={}){
 const definition=plan.modulation;if(!definition)return;
 const errors=validateModulation(definition);if(errors.length)throw Error(errors.join(" "));
 const add=node=>{owner.nodes.push(node);return node;};
 const source=node=>{owner.sources.push(node);node.start(plan.start);node.stop(plan.graphEnd);return node;};
 const constant=value=>{const node=context.createConstantSource();node.offset.value=value;return source(node);};
 const targetInputs=new Map();
 for(const route of [...definition.routes].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
  let input,normal;
  if(route.source.kind==="lfo"){
   if(precise){
    const prepared=prepareSineLfo(context,route.source.rate,plan.start,plan.graphEnd);
    const precise=prepared.source;owner.sources.push(precise);precise.start(prepared.sourceStart);precise.stop(plan.graphEnd);
    const gate=add(context.createGain());gate.gain.value=0;gate.gain.setValueAtTime(1,plan.start);precise.connect(gate);input=gate;
   }else{const oscillator=context.createOscillator();oscillator.type="sine";oscillator.frequency.value=route.source.rate;input=source(oscillator);}
   normal={signed:true};
  }else if(route.source.kind==="envelope"){
   const amp=add(context.createGain());constant(1).connect(amp);
   scheduleAmplitudeEnvelope(amp.gain,{start:plan.start,off:plan.off,peak:1,envelope:route.source.envelope});input=amp;normal={signed:false};
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
  }
  const depth=add(context.createGain());depth.gain.value=route.depth;smoothed.connect(depth);
  if(!targetInputs.has(route.target))targetInputs.set(route.target,[]);targetInputs.get(route.target).push(depth);
 }
 for(const [target,inputs] of targetInputs){
  const destination=destinations.get(target);if(!destination)continue; // inactive zero-level oscillator slot
  const sum=add(context.createGain());inputs.forEach(input=>input.connect(sum));
  if(target.endsWith(".level")){
   constant(destination.value).connect(sum);destination.value=0;
   const clamp=add(context.createWaveShaper());clamp.curve=new Float32Array([0,0,1]);sum.connect(clamp);clamp.connect(destination);
  }else{
   const limit=target==="filter.cutoff"?8:target.endsWith(".detune")?2400:2;
   const normalize=add(context.createGain()),clamp=add(context.createWaveShaper()),scale=add(context.createGain());
   normalize.gain.value=1/limit;clamp.curve=new Float32Array([-1,0,1]);scale.gain.value=limit*(target==="filter.cutoff"?1200:1);
   sum.connect(normalize);normalize.connect(clamp);clamp.connect(scale);scale.connect(destination);
  }
 }
}
