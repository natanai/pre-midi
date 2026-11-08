import {MODULATION_CONTROLS,MODULATION_SOURCE_CONTEXTS,modulationTargetsFor,validateParameterBlock,parameterFor} from "./parameters.js";
import {envelopeLevelAt} from "./amplitude-envelope.js";
export const MODULATION_VERSION=1;
export const MOD_SOURCES=Object.keys(MODULATION_SOURCE_CONTEXTS);
export const LFO_SHAPES=Object.freeze(["sine","triangle","ramp","square"]);
export const nativeModulationSource=source=>{
 if(source.kind==="lfo"&&!LFO_SHAPES.includes(source.shape))throw Error("Unsupported modulation waveform");
 return source.kind==="lfo"&&source.shape!=="sine"?3+LFO_SHAPES.indexOf(source.shape):MOD_SOURCES.indexOf(source.kind);
};
export function modulationWave(shape,cycles){
 const phase=((cycles%1)+1)%1;
 if(shape==="triangle")return 1-4*Math.abs(phase-.5);
 if(shape==="ramp")return 2*phase-1;
 if(shape==="square")return phase<.5?1:-1;
 return Math.sin(2*Math.PI*cycles);
}
export const MOD_TARGETS=modulationTargetsFor("synth");
const finite=(n,min,max)=>typeof n==="number"&&Number.isFinite(n)&&n>=min&&n<=max;
export function validateModulation(modulation){
 if(modulation?.version!==MODULATION_VERSION||!Array.isArray(modulation.routes)||modulation.routes.length>16)return ["Unsupported modulation definition."];
 const errors=[],ids=new Set();
 if(Object.keys(modulation).some(key=>!["version","routes"].includes(key)))errors.push("Unknown modulation field.");
 for(const route of modulation.routes){
  const target=MOD_TARGETS.find(target=>target.id===route?.target),source=route?.source;
  if(typeof route?.id!=="string"||!route.id||route.id.length>80||ids.has(route.id))errors.push("Invalid modulation route identity.");
  ids.add(route?.id);
  if(route&&Object.keys(route).some(key=>!["id","source","target","unit","depth","polarity","smoothing"].includes(key)))errors.push("Unknown modulation route field.");
  if(!target||route.unit!==target.unit||!finite(route.depth,-(target?.limit??0),target?.limit??0)||
   !["unipolar","bipolar"].includes(route.polarity)||!finite(route.smoothing,MODULATION_CONTROLS.smoothing.min,MODULATION_CONTROLS.smoothing.max))errors.push("Invalid modulation target, depth, range or units.");
  if(!source||!MOD_SOURCES.includes(source.kind)){errors.push("Invalid modulation source.");continue;}
  const keys={lfo:["kind","rate","shape"],velocity:["kind"],keytrack:["kind","root","span"],envelope:["kind","envelope"]}[source.kind];
  if(Object.keys(source).some(key=>!keys.includes(key)))errors.push("Unknown modulation source field.");
  if(source.kind==="lfo"&&(!finite(source.rate,MODULATION_CONTROLS.rate.min,MODULATION_CONTROLS.rate.max)||!LFO_SHAPES.includes(source.shape)))errors.push("Invalid modulation LFO.");
  if(source.kind==="keytrack"&&(!finite(source.root,MODULATION_CONTROLS.root.min,MODULATION_CONTROLS.root.max)||!finite(source.span,MODULATION_CONTROLS.span.min,MODULATION_CONTROLS.span.max)))errors.push("Invalid key tracking.");
  if(source.kind==="envelope"){
   errors.push(...validateParameterBlock(source.envelope,"envelope"));
  }
 }
 return errors;
}
export function defaultSource(kind){
 if(kind==="lfo")return {kind,shape:"sine",rate:MODULATION_CONTROLS.rate.default};
 if(kind==="envelope")return {kind,envelope:{attack:.8,decay:.5,sustain:.5,release:.5}};
 if(kind==="keytrack")return {kind,root:MODULATION_CONTROLS.root.default,span:MODULATION_CONTROLS.span.default};
 return {kind:"velocity"};
}
export function sourceValueAt(source,{elapsed,gate,velocity,pitch}){
 let value,signed=false;
 if(source.kind==="lfo"){value=modulationWave(source.shape,source.rate*Math.max(0,elapsed));signed=true;}
 else if(source.kind==="velocity")value=velocity;
 else if(source.kind==="keytrack"){value=Math.max(-1,Math.min(1,(pitch-source.root)/source.span));signed=true;}
 else{
  const e=source.envelope;
  value=elapsed<=gate?envelopeLevelAt(e,1,elapsed):elapsed<=gate+e.release?
   envelopeLevelAt(e,1,gate)+(1e-6-envelopeLevelAt(e,1,gate))*(elapsed-gate)/e.release:1e-6;
 }
 return {value,signed};
}
export function routeValueAt(route,note){
 if(note.elapsed<0)return 0;
 const {value,signed}=sourceValueAt(route.source,note);
 return route.depth*(route.polarity==="unipolar"?(signed?(value+1)/2:value):(signed?value:2*value-1));
}
// Reconstruct only the decaying control history on a seek. Fourteen time
// constants bound omitted history below 1e-6 of full scale, independently of
// Clip length. No sample-sized arrays or work in an audio callback.
export function modulationStateBefore(route,note,sampleRate){
 if(!(note.elapsed>0)||!(route.smoothing>0))return 0;
 const alpha=smoothingAlpha(route.smoothing,sampleRate),decay=1-alpha;
 const count=Math.min(Math.floor(note.elapsed*sampleRate),Math.ceil(14*route.smoothing*sampleRate));
 const normalized={...route,depth:1},at={...note};let state=0;
 if(["velocity","keytrack"].includes(route.source.kind))
  return routeValueAt(normalized,note)*(1-decay**count);
 for(let i=count;i>0;i--){
  at.elapsed=note.elapsed-i/sampleRate;const value=routeValueAt(normalized,at);
  state=alpha*value+decay*state;
 }
 return state;
}
// Same recurrence is executed by a Web Audio IIR control filter. Future native
// renderers evaluate one bounded route state per sample; no authored script.
export const smoothingAlpha=(seconds,sampleRate)=>seconds>0?1-Math.exp(-1/(seconds*sampleRate)):1;
export function combineParameter(target,base,offset){
 const p=parameterFor(target),limit=p?.modulation?.limit;
 if(limit===undefined)throw Error("Unsupported modulation target: "+target);
 const bounded=Math.max(-limit,Math.min(limit,offset));
 if(target==="filter.cutoff")return base*2**bounded;
 if(target.endsWith(".detune"))return base+bounded;
 return Math.max(p.min,Math.min(p.max,base+offset));
}
