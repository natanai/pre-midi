import {effectiveDelayEffects} from "./processing-chain.js";
import {resolveModulation} from "./modulation.js";
import {planCutoffAutomation,planParameterAutomation,cutoffLane,validateAutomation} from "./automation.js";
import {movement,planPitch} from "./expression.js";
import {planAmplitudeEnvelope} from "./amplitude-envelope.js";
import {effectTailSeconds} from "./effect-tail.js";
import {planFilterSweep} from "./filter-sweep.js";
export const SYNTH_VOICE_CONTRACT_VERSION=1;
export const noteFrequency=pitch=>440*2**((pitch-69)/12);
// Called after patch validation at the document/preview boundary. Plain musical
// values are copied so an edit cannot mutate a previously scheduled voice.
export function planSynthVoice(instrument,event,start,duration,{automation,timeline,unit=timeline?.unit??.125}={}){
 const patch=JSON.parse(JSON.stringify(instrument.patch));
 if(automation===undefined&&patch.automation){automation=patch.automation;timeline??={step:0,unit,limitStep:duration/unit};}
 const automationErrors=validateAutomation(automation,patch);if(automationErrors.length)throw Error(automationErrors.join(" "));
 const {delayTone,delayPingPong,reverb,...effects}=effectiveDelayEffects(patch,patch.effects,unit);
 patch.effects=effects;delete patch.delaySync;
 if(!Number.isFinite(event.pitch)||event.pitch<0||event.pitch>127||!Number.isFinite(event.velocity)||event.velocity<0||event.velocity>1||
  !Number.isFinite(instrument.volume)||instrument.volume<0||patch.type!=="synth"||!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0)
  throw Error("Invalid synth voice request");
 const off=start+Math.max(.015,duration),end=off+patch.envelope.release+.012;
 const motion=movement(patch),note=JSON.parse(JSON.stringify({...event,bend:event.bend??patch.bend}));
 const sourceLevel=patch.oscillators.reduce((sum,osc,index)=>{
  const routes=patch.modulation?.routes.filter(route=>route.target===`oscillators.${index}.level`)??[];
  const lane=automation?.find(lane=>!lane.bypass&&lane.target===`oscillators.${index}.level`);
  return sum+Math.min(1,Math.max(osc.level,...(lane?.points.map(point=>point.value)??[]))+routes.reduce((value,route)=>value+Math.abs(route.depth),0));
 },0)+Math.max(patch.noise,...(automation?.find(lane=>!lane.bypass&&lane.target==="noise")?.points.map(point=>point.value)??[]));
 const norm=sourceLevel>0?1/Math.max(1,sourceLevel):0;
 const peak=Math.max(.000001,Math.min(.31,instrument.volume*event.velocity*.27)*norm);
 const amplitude=planAmplitudeEnvelope({start,off,peak,envelope:patch.envelope});
 const filter={...patch.filter,...planFilterSweep(patch.filter,start,duration)};
 const result={contract:"pre-midi-synth-voice",version:SYNTH_VOICE_CONTRACT_VERSION,
  patch,presetId:patch.presetId,start,duration,off,end,graphEnd:end+.15,
  audibleEnd:end+.15+effectTailSeconds(effectiveDelayEffects(patch,patch.effects)),peak,amplitude,filter,movement:motion,
  oscillators:patch.oscillators.map(slot=>({...slot,frequency:Math.min(18000,noteFrequency(event.pitch)*2**slot.octave),
   pitch:planPitch(note,motion,start,duration,slot.detune)})),
  routing:["oscillators_and_noise","filter","drive","amplitude","tremolo","pan","dry_and_delay_send"],
  expression:note};
 if(patch.version===2){result.version=2;result.modulation=resolveModulation(patch.modulation,unit);}
 if(automation?.length){if(!timeline)throw Error("Automation requires a timeline position");result.version=3;result.modulation??={version:1,routes:[]};result.parameterAutomation=planParameterAutomation(automation,patch,{...timeline,start,end:result.graphEnd});}
 return result;
}
export {SYNTH_PARAMETERS} from "./parameters.js";
// A common policy for pitch that crosses the representable device band.
export function pitchReachesNyquist(plan,rate){
 return plan.oscillators.some((osc,index)=>{
  const possible=(plan.modulation?.routes??[]).filter(route=>route.target===`oscillators.${index}.detune`).reduce((sum,route)=>sum+Math.abs(route.depth),0);
  return osc.frequency*2**((Math.max(osc.detune,...(osc.pitch.values??[]))+Math.min(2400,possible)+(plan.movement.depth??0))/1200)>=rate/2;
 });
}

export const extendedSynthExecution=(plan,rate)=>!!plan.parameterAutomation?.length||plan.graphEnd-plan.start>30||pitchReachesNyquist(plan,rate)||plan.oscillators.some((_,index)=>
 (plan.modulation?.routes??[]).filter(route=>route.target===`oscillators.${index}.detune`).reduce((sum,route)=>sum+Math.abs(route.depth),0)>=1200);
