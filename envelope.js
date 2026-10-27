import {planAmplitudeEnvelope} from "./src/dsp/amplitude-envelope.js";
export {envelopeLevelAt} from "./src/dsp/amplitude-envelope.js";
// Web Audio adapter. Live transport, preview and export execute the same plan.
export function scheduleAmplitudeEnvelope(param,options){
 const plan=planAmplitudeEnvelope(options);
 return applyAmplitudePlan(param,plan);
}
export function applyAmplitudePlan(param,plan){
 if(plan.contract!=="pre-midi-amplitude-envelope"||plan.version!==1)throw Error("Unsupported amplitude plan");
 for(const event of plan.events){
  if(event.kind==="set")param.setValueAtTime(event.value,event.time);
  else param.linearRampToValueAtTime(event.value,event.time);
 }
 return plan.releaseLevel;
}
