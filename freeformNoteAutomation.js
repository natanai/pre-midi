// One captured cutoff curve belongs to one independent freeform note.
// The source-phase metadata is immutable while editing its points; moving
// the note in Song time must not reset the original automation shape.
import {id,clone} from "./schema.js";
import {validateCapturedCutoffAutomation} from "./src/dsp/automation.js";
import {assignSoundEdit} from "./soundEditPath.js";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createFreeformNoteCutoff(note,patch){
 if(!Number.isSafeInteger(note?.duration)||note.duration<1||patch?.type!=="synth"||
  !Number.isFinite(patch.filter?.cutoff))
  throw Error("Note cutoff movement needs a pitched synthesizer and a valid note.");
 const limitStep=Math.min(1024,note.duration);
 const cutoff=clamp(patch.filter.cutoff,50,14000);
 const captured={version:1,step:0,limitStep,block:{
  version:1,target:"filter.cutoff",unit:"hz",interpolation:"exponential",
  points:[{id:id(),step:0,value:cutoff},
   {id:id(),step:limitStep,value:clamp(cutoff/4,50,14000)}]
 }};
 const errors=validateCapturedCutoffAutomation(captured);
 if(errors.length)throw Error(errors[0]);
 return captured;
}

// The shared interactive cutoff illustration and the numeric fields both
// write the exact same curve points. Keep strict increasing order and preserve
// source phase and endpoint IDs on every edit.
export function editFreeformNoteCutoff(captured,path,value){
 const multiple=Array.isArray(path?.[0]);
 const paths=multiple?path:[path],values=multiple?value:[value];
 if(!captured||!Array.isArray(paths)||!paths.length||
  !Array.isArray(values)||values.length!==paths.length||
  paths.some(keys=>!Array.isArray(keys)||keys.length!==3||
   keys[0]!=="points"||!Number.isInteger(keys[1])||keys[1]<0||keys[1]>=captured.block.points.length||
   !["step","value"].includes(keys[2]))||
  values.some(number=>!Number.isFinite(number)))
  throw Error("Invalid cutoff movement edit.");
 const changed=clone(captured);
 assignSoundEdit(changed.block,path,value);
 for(const keys of paths)if(keys[2]==="step"){
  const i=keys[1],points=changed.block.points;
  points[i].step=clamp(Math.round(points[i].step),i?points[i-1].step+1:0,i<points.length-1?points[i+1].step-1:1024);
 }
 const issues=validateCapturedCutoffAutomation(changed);
 if(issues.length)throw Error(issues[0]);
 return changed;
}
