import {MODULATION_CONTROLS,MODULATION_SOURCE_CONTEXTS,modulationTargetsFor,validateParameterBlock,parameterFor} from "./parameters.js";
import {envelopeLevelAt} from "./amplitude-envelope.js";
export const MODULATION_VERSION=1;
export const MOD_SOURCES=Object.keys(MODULATION_SOURCE_CONTEXTS);
export const LFO_SHAPES=Object.freeze(["sine","triangle","ramp","square","sample-hold","smooth-random","steps"]);
export const LFO_DIVISIONS=Object.freeze([.25,.5,1,2,4,8,16]);
export const modulationRate=(source,unit=.125)=>source.sync?1/(source.sync*4*unit):source.rate;
// Resolve musical divisions at the host boundary. Authored free-Hz values and
// divisions stay untouched; DSP consumes one portable effective Hz value.
export function resolveModulation(block,unit=.125){
 if(!block)return block;
 const errors=validateModulation(block);if(errors.length)throw Error(errors.join(" "));
 if(!Number.isFinite(unit)||unit<=0)throw Error("Invalid modulation tempo");
 return {...block,routes:block.routes.map(route=>{
  if(route.source.kind==="macro")return {...route,source:{...route.source,value:block.macros.find(m=>m.id===route.source.id).value}};
  if(route.source.kind!=="lfo"||!route.source.sync)return route;
  const {sync,...source}=route.source;
  return {...route,source:{...source,rate:modulationRate(route.source,unit)}};
 })};
}
export const nativeModulationSource=source=>{
 if(source.kind==="macro")return 10;
 if(source.kind==="lfo"&&!LFO_SHAPES.includes(source.shape))throw Error("Unsupported modulation waveform");
 return source.kind==="lfo"&&source.shape!=="sine"?3+LFO_SHAPES.indexOf(source.shape):({lfo:0,envelope:1,velocity:2,keytrack:3,macro:10})[source.kind];
};
export const randomLfoShape=shape=>shape==="sample-hold"||shape==="smooth-random";
// Stateless uint32 hash: seed and cycle index define every value, including
// seeks. No global RNG, callback allocation or dependence on other voices.
export function randomLfoValue(seed,index){
 let x=((index>>>0)^Math.imul(seed,0x9e3779b9))>>>0;
 x=Math.imul(x^(x>>>16),0x7feb352d)>>>0;
 x=Math.imul(x^(x>>>15),0x846ca68b)>>>0;
 x=(x^(x>>>16))>>>0;
 return x/4294967295*2-1;
}
export const DEFAULT_LFO_STEPS=Object.freeze([1,0,-1,0]);
export function modulationWave(shape,cycles,seed=1,steps=DEFAULT_LFO_STEPS){
 const phase=((cycles%1)+1)%1;
 if(shape==="steps")return steps[Math.floor(phase*4)];
 if(randomLfoShape(shape)){
  const index=Math.floor(cycles),a=randomLfoValue(seed,index);
  return shape==="sample-hold"?a:a+(randomLfoValue(seed,index+1)-a)*phase;
 }
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
 const macros=modulation.macros??[];
 if(!Array.isArray(macros)||macros.length>4)return ["Invalid performance macros."];
 const macroIds=new Set();
 for(const macro of macros){
  if(!macro||typeof macro.id!=="string"||!macro.id||macroIds.has(macro.id)||typeof macro.name!=="string"||!macro.name.trim()||macro.name.length>32||!finite(macro.value,0,1)||!finite(macro.default,0,1)||Object.keys(macro).some(k=>!["id","name","value","default"].includes(k)))errors.push("Invalid performance macro.");
  macroIds.add(macro?.id);
 }
 if(Object.keys(modulation).some(key=>!["version","routes","macros"].includes(key)))errors.push("Unknown modulation field.");
 for(const route of modulation.routes){
  const target=MOD_TARGETS.find(target=>target.id===route?.target),source=route?.source;
  if(typeof route?.id!=="string"||!route.id||route.id.length>80||ids.has(route.id))errors.push("Invalid modulation route identity.");
  ids.add(route?.id);
  if(route&&Object.keys(route).some(key=>!["id","source","target","unit","depth","polarity","smoothing"].includes(key)))errors.push("Unknown modulation route field.");
  if(!target||route.unit!==target.unit||!finite(route.depth,-(target?.limit??0),target?.limit??0)||
   !["unipolar","bipolar"].includes(route.polarity)||!finite(route.smoothing,MODULATION_CONTROLS.smoothing.min,MODULATION_CONTROLS.smoothing.max))errors.push("Invalid modulation target, depth, range or units.");
  if(!source||!MOD_SOURCES.includes(source.kind)){errors.push("Invalid modulation source.");continue;}
  const keys={macro:["kind","id","value"],lfo:["kind","rate","shape","sync","seed","steps"],velocity:["kind"],keytrack:["kind","root","span"],envelope:["kind","envelope"]}[source.kind];
  if(Object.keys(source).some(key=>!keys.includes(key)))errors.push("Unknown modulation source field.");
  if(source.kind==="macro"&&(!macroIds.has(source.id)||(source.value!==undefined&&!finite(source.value,0,1))))errors.push("Missing or invalid performance macro source.");
  if(source.kind==="lfo"&&(!finite(source.rate,MODULATION_CONTROLS.rate.min,MODULATION_CONTROLS.rate.max)||!LFO_SHAPES.includes(source.shape)))errors.push("Invalid modulation LFO.");
  if(source.steps!==undefined&&(source.kind!=="lfo"||!Array.isArray(source.steps)||source.steps.length!==4||source.steps.some(value=>!finite(value,-1,1))))errors.push("Invalid movement steps.");
  if(source.seed!==undefined&&(source.kind!=="lfo"||!Number.isInteger(source.seed)||!finite(source.seed,1,127)))errors.push("Invalid random movement seed.");
  if(source.kind==="lfo"&&source.sync!==undefined&&!LFO_DIVISIONS.includes(source.sync))errors.push("Invalid modulation tempo division.");
  if(source.kind==="keytrack"&&(!finite(source.root,MODULATION_CONTROLS.root.min,MODULATION_CONTROLS.root.max)||!finite(source.span,MODULATION_CONTROLS.span.min,MODULATION_CONTROLS.span.max)))errors.push("Invalid key tracking.");
  if(source.kind==="envelope"){
   errors.push(...validateParameterBlock(source.envelope,"envelope"));
  }
 }
 return errors;
}
export function defaultSource(kind){
 if(kind==="macro")return {kind,id:"macro-1"};
 if(kind==="lfo")return {kind,shape:"sine",rate:MODULATION_CONTROLS.rate.default};
 if(kind==="envelope")return {kind,envelope:{attack:.8,decay:.5,sustain:.5,release:.5}};
 if(kind==="keytrack")return {kind,root:MODULATION_CONTROLS.root.default,span:MODULATION_CONTROLS.span.default};
 return {kind:"velocity"};
}
export function sourceValueAt(source,{elapsed,gate,velocity,pitch,unit=.125}){
 let value,signed=false;
 if(source.kind==="lfo"){value=modulationWave(source.shape,modulationRate(source,unit)*Math.max(0,elapsed),source.seed??1,source.steps??DEFAULT_LFO_STEPS);signed=true;}
 else if(source.kind==="macro")value=source.value??0;
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
 if(["velocity","keytrack","macro"].includes(route.source.kind))
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
