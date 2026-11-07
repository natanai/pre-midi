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
 if(patch.type==="automation"&&path[0]==="points"&&path.at(-1)==="value")return parameterFor("filter.cutoff");
 if(path[0]==="zones"&&path.at(-1)==="root")return parameterFor("zones.root",patch.type);
 if(path[0]==="modulation"&&path[1]==="routes"){
  const key=path.at(-1);
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
 if(id==="filter")return patch.filter??null;
 id=soundParameterId(id,patch.type);
 const path=soundParameterPath(id,patch.type),value=path.reduce((owner,key)=>owner?.[key],patch);
 return value??parameterFor(id,patch.type)?.default;
}
export const soundCapability=(patch,path)=>parameterCapability(soundParameterId(path,patch.type),patch.type,id=>readSoundParameter(patch,id));
