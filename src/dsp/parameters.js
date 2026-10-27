import {ENVELOPE_PARAMETERS} from "./amplitude-envelope.js";
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
 parameter("filter.cutoff","hz",50,14000,8000,"exponential"),{...parameter("filter.resonance","filter_resonance",.1,16,.7),interpretation:{lowpass:"db",highpass:"db",bandpass:"linear_q",notch:"linear_q"}},
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
