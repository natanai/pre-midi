// Patch edits from knobs and illustration handles share the same path rules.
// In particular, legacy sampled sounds may not carry a filter definition.
import {DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";
export function assignSoundEdit(patch,path,value){
 const changes=Array.isArray(path[0])?path.map((keys,i)=>[keys,value[i]]):[[path,value]];
 for(const [keys,nextValue] of changes){
  let owner=patch;
  for(const key of keys.slice(0,-1)){
   if(owner[key]===undefined||owner[key]===null)
    owner[key]=patch.type==="sample"&&owner===patch&&key==="filter"?
     {...DEFAULT_SAMPLE_FILTER}:{};
   owner=owner[key];
  }
  owner[keys.at(-1)]=nextValue;
 }
 return patch;
}
