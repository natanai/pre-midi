import {movement,planPitch} from "./expression.js";
import {planAmplitudeEnvelope,ENVELOPE_PARAMETERS} from "./amplitude-envelope.js";
import {delayTailSeconds} from "./effect-tail.js";
export const SYNTH_VOICE_CONTRACT_VERSION=1;
export const noteFrequency=pitch=>440*2**((pitch-69)/12);
// Called after patch validation at the document/preview boundary. Plain musical
// values are copied so an edit cannot mutate a previously scheduled voice.
export function planSynthVoice(instrument,event,start,duration){
 const patch=JSON.parse(JSON.stringify(instrument.patch));
 if(!Number.isFinite(event.pitch)||event.pitch<0||event.pitch>127||!Number.isFinite(event.velocity)||event.velocity<0||event.velocity>1||
  !Number.isFinite(instrument.volume)||instrument.volume<0||patch.type!=="synth"||!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0)
  throw Error("Invalid synth voice request");
 const off=start+Math.max(.015,duration),end=off+patch.envelope.release+.012;
 const motion=movement(patch),note=JSON.parse(JSON.stringify({...event,bend:event.bend??patch.bend}));
 const sourceLevel=patch.oscillators.reduce((sum,osc)=>sum+osc.level,0)+patch.noise;
 const norm=sourceLevel>0?1/Math.max(1,sourceLevel):0;
 const peak=Math.max(.000001,Math.min(.31,instrument.volume*event.velocity*.27)*norm);
 const amplitude=planAmplitudeEnvelope({start,off,peak,envelope:patch.envelope});
 const sweep=patch.filter.sweep??0;
 const filter={...patch.filter,startCutoff:sweep===0?patch.filter.cutoff:Math.max(50,Math.min(14000,patch.filter.cutoff*2**sweep)),
  sweepEnd:start+Math.min(duration,patch.filter.sweepTime??.2)};
 return {contract:"pre-midi-synth-voice",version:SYNTH_VOICE_CONTRACT_VERSION,
  patch,presetId:patch.presetId,start,duration,off,end,graphEnd:end+.15,
  audibleEnd:end+.15+delayTailSeconds(patch.effects),peak,amplitude,filter,movement:motion,
  oscillators:patch.oscillators.map(slot=>({...slot,frequency:Math.min(18000,noteFrequency(event.pitch)*2**slot.octave),
   pitch:planPitch(note,motion,start,duration,slot.detune)})),
  routing:["oscillators_and_noise","filter","drive","amplitude","tremolo","pan","dry_and_delay_send"],
  expression:note};
}
// Stable identifiers, ranges and units for existing patch v1. Controls are
// snapshotted per note; interpolation describes the future host control contract,
// not a claim that automation has already been implemented.
const parameter=(id,unit,min,max,defaultValue,interpolation="linear")=>({id,unit,min,max,default:defaultValue,interpolation});
export const SYNTH_PARAMETERS=Object.freeze([
 ...ENVELOPE_PARAMETERS,
 ...[0,1].flatMap(i=>[
  {id:`oscillators.${i}.wave`,unit:"enum",values:["sine","triangle","square","sawtooth","harmonic"],default:i?"sine":"triangle",interpolation:"step"},
  parameter(`oscillators.${i}.level`,"linear_gain",0,1,i?.2:.8),
  {...parameter(`oscillators.${i}.octave`,"octaves",-2,2,0,"step"),integer:true},
  parameter(`oscillators.${i}.detune`,"cents",-100,100,0),
  ...Array.from({length:32},(_,n)=>parameter(`oscillators.${i}.harmonics.${n}`,"linear_gain",0,1,n===0?1:0))]),
 {id:"filter.type",unit:"enum",values:["lowpass","highpass","bandpass","notch"],default:"lowpass",interpolation:"step"},
 parameter("filter.cutoff","hz",50,14000,8000,"exponential"),parameter("filter.resonance","Q",.1,16,.7),
 parameter("filter.sweep","octaves",-5,5,0),parameter("filter.sweepTime","seconds",.01,3,.2),
 parameter("noise","linear_gain",0,1,0),parameter("noiseDecay","seconds",0,4,0),parameter("pan","pan",-1,1,0),
 parameter("effects.drive","normalized",0,1,0),parameter("effects.delayMix","normalized",0,1,0),
 parameter("effects.delayTime","seconds",.05,1,.24),parameter("effects.delayFeedback","linear_gain",0,.8,.26),
 ...[["rate","hz",.1,20,5],["depth","cents",0,100,0],["delay","seconds",0,3,0],
  ["glide","semitones",-12,12,0],["glideTime","seconds",.01,3,.18],["tremolo","normalized",0,1,0],
  ["tremoloRate","hz",.1,20,5],["tone","normalized",0,1,0],["toneRate","hz",.1,20,2]].map(([id,...values])=>parameter("movement."+id,...values)),
 {id:"bend.shape",unit:"enum",values:["straight","scoop","rise","fall","dip","wail","wave"],default:"straight",interpolation:"step"},
 parameter("bend.amount","semitones",0,12,2),parameter("bend.rate","hz",.1,12,4)
].map(Object.freeze));
