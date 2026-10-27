import {planCutoffAutomation} from "./automation.js";
import {movement,planPitch} from "./expression.js";
import {planAmplitudeEnvelope} from "./amplitude-envelope.js";
import {delayTailSeconds} from "./effect-tail.js";
export const SYNTH_VOICE_CONTRACT_VERSION=1;
export const noteFrequency=pitch=>440*2**((pitch-69)/12);
// Called after patch validation at the document/preview boundary. Plain musical
// values are copied so an edit cannot mutate a previously scheduled voice.
export function planSynthVoice(instrument,event,start,duration,{automation,timeline}={}){
 const patch=JSON.parse(JSON.stringify(instrument.patch));
 if(!Number.isFinite(event.pitch)||event.pitch<0||event.pitch>127||!Number.isFinite(event.velocity)||event.velocity<0||event.velocity>1||
  !Number.isFinite(instrument.volume)||instrument.volume<0||patch.type!=="synth"||!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0)
  throw Error("Invalid synth voice request");
 const off=start+Math.max(.015,duration),end=off+patch.envelope.release+.012;
 const motion=movement(patch),note=JSON.parse(JSON.stringify({...event,bend:event.bend??patch.bend}));
 const sourceLevel=patch.oscillators.reduce((sum,osc,index)=>{
  const routes=patch.modulation?.routes.filter(route=>route.target===`oscillators.${index}.level`)??[];
  return sum+Math.min(1,osc.level+routes.reduce((value,route)=>value+Math.abs(route.depth),0));
 },0)+patch.noise;
 const norm=sourceLevel>0?1/Math.max(1,sourceLevel):0;
 const peak=Math.max(.000001,Math.min(.31,instrument.volume*event.velocity*.27)*norm);
 const amplitude=planAmplitudeEnvelope({start,off,peak,envelope:patch.envelope});
 const sweep=patch.filter.sweep??0;
 const filter={...patch.filter,startCutoff:sweep===0?patch.filter.cutoff:Math.max(50,Math.min(14000,patch.filter.cutoff*2**sweep)),
  sweepEnd:start+Math.min(duration,patch.filter.sweepTime??.2)};
 const result={contract:"pre-midi-synth-voice",version:SYNTH_VOICE_CONTRACT_VERSION,
  patch,presetId:patch.presetId,start,duration,off,end,graphEnd:end+.15,
  audibleEnd:end+.15+delayTailSeconds(patch.effects),peak,amplitude,filter,movement:motion,
  oscillators:patch.oscillators.map(slot=>({...slot,frequency:Math.min(18000,noteFrequency(event.pitch)*2**slot.octave),
   pitch:planPitch(note,motion,start,duration,slot.detune)})),
  routing:["oscillators_and_noise","filter","drive","amplitude","tremolo","pan","dry_and_delay_send"],
  expression:note};
 if(patch.version===2){result.version=2;result.modulation=patch.modulation;}
 if(automation){if(!timeline)throw Error("Automation requires a timeline position");result.version=3;result.modulation??={version:1,routes:[]};result.automation=planCutoffAutomation(automation,{...timeline,start,end:result.graphEnd});}
 return result;
}
export {SYNTH_PARAMETERS} from "./parameters.js";
