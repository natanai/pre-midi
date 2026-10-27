import {SYNTH_PARAMETERS} from "./parameters.js";
import {envelopeLevelAt} from "./amplitude-envelope.js";
export const MODULATION_VERSION=1;
export const MOD_SOURCES=["lfo","envelope","velocity","keytrack"];
const parameters=new Map(SYNTH_PARAMETERS.map(parameter=>[parameter.id,parameter]));
export const MOD_TARGETS=[
 ...[0,1].flatMap(index=>[
  {id:`oscillators.${index}.detune`,name:`oscillator ${index+1} pitch`,unit:"cents",limit:2400},
  {id:`oscillators.${index}.level`,name:`oscillator ${index+1} level`,unit:"linear_gain",limit:1}]),
 {id:"filter.cutoff",name:"brightness",unit:"octaves",limit:8},
 {id:"pan",name:"pan",unit:"pan",limit:2}
].map(target=>Object.freeze({...target,parameter:parameters.get(target.id)}));
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
   !["unipolar","bipolar"].includes(route.polarity)||!finite(route.smoothing,0,.1))errors.push("Invalid modulation target, depth, range or units.");
  if(!source||!MOD_SOURCES.includes(source.kind)){errors.push("Invalid modulation source.");continue;}
  const keys={lfo:["kind","rate","shape"],velocity:["kind"],keytrack:["kind","root","span"],envelope:["kind","envelope"]}[source.kind];
  if(Object.keys(source).some(key=>!keys.includes(key)))errors.push("Unknown modulation source field.");
  if(source.kind==="lfo"&&(!finite(source.rate,.05,20)||source.shape!=="sine"))errors.push("Invalid modulation LFO.");
  if(source.kind==="keytrack"&&(!finite(source.root,0,127)||!finite(source.span,1,127)))errors.push("Invalid key tracking.");
  if(source.kind==="envelope"){
   const e=source.envelope;if(e&&Object.keys(e).some(key=>!["attack","decay","sustain","release"].includes(key)))errors.push("Unknown modulation envelope field.");
   if(!e||!finite(e.attack,0,3)||!finite(e.decay,0,3)||!finite(e.sustain,0,1)||!finite(e.release,.01,4))errors.push("Invalid modulation envelope.");
  }
 }
 return errors;
}
export function defaultSource(kind){
 if(kind==="lfo")return {kind,shape:"sine",rate:.5};
 if(kind==="envelope")return {kind,envelope:{attack:.8,decay:.5,sustain:.5,release:.5}};
 if(kind==="keytrack")return {kind,root:60,span:24};
 return {kind:"velocity"};
}
export function sourceValueAt(source,{elapsed,gate,velocity,pitch}){
 let value,signed=false;
 if(source.kind==="lfo"){value=Math.sin(2*Math.PI*source.rate*Math.max(0,elapsed));signed=true;}
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
// Same recurrence is executed by a Web Audio IIR control filter. Future native
// renderers evaluate one bounded route state per sample; no authored script.
export const smoothingAlpha=(seconds,sampleRate)=>seconds>0?1-Math.exp(-1/(seconds*sampleRate)):1;
export function combineParameter(target,base,offset){
 if(target==="filter.cutoff")return base*2**Math.max(-8,Math.min(8,offset));
 if(target.endsWith(".detune"))return base+Math.max(-2400,Math.min(2400,offset));
 if(target==="pan")return Math.max(-1,Math.min(1,base+offset));
 return Math.max(0,Math.min(1,base+offset));
}
