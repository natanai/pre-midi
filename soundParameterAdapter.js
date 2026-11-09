import {processorParameter} from './src/dsp/processing-graph.js';
import {DEFAULT_LFO_STEPS} from "./src/dsp/modulation.js";
import {parameterFor,parameterField,parameterCapability,MODULATION_CONTROLS} from "./src/dsp/parameters.js";
// Context storage is outside the DSP authority. Temporary vocal display patches
// and sampled Sounds retain their current shapes without changing source data.
export function soundParameterId(path,context="synth"){
 const id=Array.isArray(path)?path.join("."):path;
 if(context==="sample"||context==="vocal"){
  if(/^zones\.\d+\.root$/.test(id))return "zones.root";
  if(id==="attack"||id==="release")return "envelope."+id;
  if(["drive","delayMix","delayTime","delayFeedback"].includes(id))return "effects."+id;
 }
 return id;
}
export function soundParameterPath(id,context="synth"){
 if(context!=="synth"){
  if(id==="zones.root")return ["zones",0,"root"];
  if(id==="envelope.attack"||id==="envelope.release")return [id.split(".")[1]];
  if(id.startsWith("effects.")&&(context==="sample"||id==="effects.drive"))return [id.split(".")[1]];
 }
 return id.split(".");
}
export const soundField=(id,context="synth",presentation={})=>parameterField(id,{context,path:soundParameterPath(id,context),...presentation});
export function soundParameter(patch,path){
 if(path[0]==='chain'&&path[1]==='instances'&&path[3]==='parameters'){
  const instance=patch.chain?.instances?.[path[2]];if(instance&&['filter','drive'].includes(instance.kind))return processorParameter(instance.kind,path.at(-1));
 }
 if(patch.type==="automation"&&path[0]==="points"&&path.at(-1)==="value")return parameterFor("filter.cutoff");
 if(path[0]==="zones"&&path.at(-1)==="root")return parameterFor("zones.root",patch.type);
 if(path[0]==="modulation"&&path[1]==="routes"){
  const key=path.includes("steps")?"step":path.at(-1);
  if(path.includes("envelope"))return parameterFor("envelope."+key);
  if(key==="depth"){
   const route=patch.modulation?.routes[path[2]],target=parameterFor(route?.target,patch.type)?.modulation;
   return target?{min:-target.limit,max:target.limit,unit:target.unit,ui:{step:target.unit==="cents"?1:.01}}:null;
  }
  const control=MODULATION_CONTROLS[key];
  return control?{...control,ui:{step:control.step,display:control.display}}:null;
 }
 return parameterFor(soundParameterId(path,patch.type),patch.type);
}
export function soundAxis(patch,path,mode,geometry={}){
 const p=soundParameter(patch,path);
 if(!p||p.values||p.unit==="boolean")throw Error("No numeric sound parameter at "+path.join("."));
 return {path,...geometry,min:p.min,max:p.max,step:p.ui.step,mode};
}

export function readSoundParameter(patch,id){
 const step=/^modulation\.routes\.(\d+)\.source\.steps\.([0-3])$/.exec(id);
 if(step)return patch.modulation?.routes[Number(step[1])]?.source.steps?.[Number(step[2])]??DEFAULT_LFO_STEPS[Number(step[2])];
 if(id==="filter")return patch.filter??null;
 id=soundParameterId(id,patch.type);
 const path=soundParameterPath(id,patch.type),value=path.reduce((owner,key)=>owner?.[key],patch);
 return value??parameterFor(id,patch.type)?.default;
}
export const soundCapability=(patch,path)=>soundParameterId(path,patch.type)==="effects.delayTime"&&patch.delaySync?{state:"inactive",reason:"delay follows tempo; choose seconds in processing order to edit its time"}:parameterCapability(soundParameterId(path,patch.type),patch.type,id=>readSoundParameter(patch,id));
