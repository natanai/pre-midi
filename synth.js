import { validateSamplerPatch } from "./sampler.js";
// Original parameter-only instrument library. No samples, soundfonts, external DSP or runtime packages.
// A patch is the single canonical definition used by the editor, live synth and WAV export.
export const WAVES = ["sine", "triangle", "square", "sawtooth"];
export const FILTERS = ["lowpass", "highpass", "bandpass", "notch"];
export const PATCH_FORMAT = "pre-midi-patch";
export const PATCH_VERSION = 1;
const copy = value => JSON.parse(JSON.stringify(value));
const base = {
  oscillators: [
    {wave:"triangle",level:.8,octave:0,detune:0},
    {wave:"sine",level:.2,octave:0,detune:0}
  ],
  noise:0,
  filter:{type:"lowpass",cutoff:8000,resonance:.7},
  envelope:{attack:.01,decay:.16,sustain:.65,release:.2},
  movement:{rate:5,depth:0},
  effects:{drive:0,delayMix:0,delayTime:.24,delayFeedback:.26},
  pan:0
};
const presets = [
 ["init","Init","Basic","A clean starting sound.",{}],
 ["sub-current","Sub Current","Bass","Round low-frequency sine body.",{oscillators:[{wave:"sine",level:1,octave:-1,detune:0},{wave:"triangle",level:.23,octave:0,detune:0}],filter:{cutoff:520},envelope:{attack:.012,decay:.2,sustain:.83,release:.13}}],
 ["acid-line","Acid Line","Bass","Sharp saw with a biting filter.",{oscillators:[{wave:"sawtooth",level:.9,octave:0,detune:0},{wave:"square",level:.22,octave:-1,detune:5}],filter:{cutoff:1450,resonance:9},envelope:{attack:.004,decay:.2,sustain:.39,release:.1},effects:{drive:.29}}],
 ["rubber-bass","Rubber Bass","Bass","Rounded pulse with a short tail.",{oscillators:[{wave:"square",level:.8,octave:-1,detune:0},{wave:"triangle",level:.48,octave:0,detune:0}],filter:{cutoff:930,resonance:3.4},envelope:{attack:.005,decay:.13,sustain:.48,release:.15}}],
 ["neon-lead","Neon Lead","Lead","Bright two-oscillator signal.",{oscillators:[{wave:"sawtooth",level:.78,octave:0,detune:-5},{wave:"sawtooth",level:.72,octave:0,detune:5}],filter:{cutoff:3900,resonance:1.3},envelope:{attack:.008,decay:.1,sustain:.74,release:.16},movement:{rate:5.7,depth:9},effects:{drive:.13,delayMix:.22,delayTime:.21,delayFeedback:.32}}],
 ["square-circuit","Square Circuit","Lead","Hard-edged retro pulses.",{oscillators:[{wave:"square",level:.86,octave:0,detune:0},{wave:"square",level:.18,octave:1,detune:0}],filter:{cutoff:5300},envelope:{attack:.002,decay:.08,sustain:.67,release:.075}}],
 ["glass-keys","Glass Keys","Keys","Clean, shimmering struck tones.",{oscillators:[{wave:"sine",level:.83,octave:0,detune:0},{wave:"triangle",level:.38,octave:1,detune:3}],filter:{cutoff:10500},envelope:{attack:.004,decay:.58,sustain:.17,release:.82},effects:{delayMix:.16,delayTime:.28,delayFeedback:.22}}],
 ["felt-electric","Felt Electric","Keys","Warm, soft-edged electric keys.",{oscillators:[{wave:"triangle",level:.94,octave:0,detune:0},{wave:"sine",level:.31,octave:1,detune:0}],filter:{cutoff:2050,resonance:.8},envelope:{attack:.013,decay:.47,sustain:.33,release:.44}}],
 ["dusk-organ","Dusk Organ","Keys","Sustained harmonic organ.",{oscillators:[{wave:"sine",level:.95,octave:0,detune:0},{wave:"sine",level:.41,octave:1,detune:0}],filter:{cutoff:6700},envelope:{attack:.018,decay:.08,sustain:.94,release:.19},movement:{rate:5.8,depth:6}}],
 ["violet-pad","Violet Pad","Pads","Slow mauve-colored drifting chords.",{oscillators:[{wave:"sawtooth",level:.58,octave:0,detune:-11},{wave:"triangle",level:.77,octave:0,detune:11}],filter:{cutoff:1430,resonance:1.1},envelope:{attack:.75,decay:.8,sustain:.71,release:1.7},movement:{rate:.35,depth:14},effects:{delayMix:.19,delayTime:.43,delayFeedback:.38}}],
 ["tape-strings","Tape Strings","Pads","Soft sustained ensemble texture.",{oscillators:[{wave:"sawtooth",level:.61,octave:0,detune:-7},{wave:"sawtooth",level:.58,octave:0,detune:7}],filter:{cutoff:1900},envelope:{attack:.31,decay:.38,sustain:.85,release:1.15},movement:{rate:4.8,depth:13}}],
 ["air-flute","Air Flute","Winds","Gentle breath and fundamental.",{oscillators:[{wave:"sine",level:.96,octave:0,detune:0},{wave:"triangle",level:.12,octave:1,detune:0}],noise:.04,filter:{cutoff:4300},envelope:{attack:.075,decay:.2,sustain:.82,release:.32},movement:{rate:5.2,depth:14}}],
 ["copper-horn","Copper Horn","Winds","Bold brass-like saw harmonics.",{oscillators:[{wave:"sawtooth",level:.8,octave:0,detune:0},{wave:"square",level:.3,octave:-1,detune:0}],filter:{cutoff:1850,resonance:2},envelope:{attack:.09,decay:.26,sustain:.86,release:.2}}],
 ["signal-bell","Signal Bell","Percussion","High pitched glowing bell tone.",{oscillators:[{wave:"sine",level:.8,octave:1,detune:0},{wave:"sine",level:.35,octave:2,detune:19}],filter:{cutoff:10500},envelope:{attack:.003,decay:.55,sustain:.11,release:1.7},effects:{delayMix:.14,delayTime:.32,delayFeedback:.25}}],
 ["pulse-kick","Pulse Kick","Percussion","Low impact with a rapid drop.",{oscillators:[{wave:"sine",level:1,octave:-2,detune:0},{wave:"triangle",level:.17,octave:-1,detune:0}],filter:{cutoff:550},envelope:{attack:.002,decay:.1,sustain:.015,release:.12},effects:{drive:.34}}],
 ["static-snare","Static Snare","Percussion","Dry crack of shaped noise.",{oscillators:[{wave:"triangle",level:.19,octave:-1,detune:0},{wave:"sine",level:0,octave:0,detune:0}],noise:.9,filter:{type:"highpass",cutoff:750,resonance:.8},envelope:{attack:.001,decay:.095,sustain:.02,release:.11},effects:{drive:.17}}],
 ["dust-hat","Dust Hat","Percussion","Tight, high-passed noise.",{oscillators:[{wave:"sine",level:0,octave:0,detune:0},{wave:"sine",level:0,octave:0,detune:0}],noise:1,filter:{type:"highpass",cutoff:6200,resonance:.6},envelope:{attack:.001,decay:.035,sustain:0,release:.055}}]
];
function deepMerge(baseValue, patch) {
 const result=copy(baseValue);
 for(const [key,value] of Object.entries(patch)) {
  if(value && typeof value==="object" && !Array.isArray(value) && result[key] && typeof result[key]==="object") {
   result[key]={...result[key],...value};
  } else result[key]=copy(value);
 }
 return result;
}
export const PRESETS=presets.map(([id,name,category,description,overrides])=>({
 id,name,category,description,patch:deepMerge(base,overrides)
}));
export const getPreset=id=>PRESETS.find(entry=>entry.id===id);
export function makePatch(presetId="init") {
 const preset=getPreset(presetId)||getPreset("init");
 return {type:"synth",presetId:preset.id,...copy(preset.patch)};
}
export const patchCopy=copy;
const object=x=>x!==null && typeof x==="object" && !Array.isArray(x);
const num=(x,min,max)=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
export function validatePatch(patch) {
 if(patch?.type==="sample")return validateSamplerPatch(patch);
 const errors=[];
 if(patch?.type!=="synth")errors.push("Unknown instrument source.");
 if(!object(patch))return ["Missing instrument sound definition."];
 if(typeof patch.presetId!=="string"||patch.presetId.length>80)errors.push("Invalid sound preset reference.");
 if(!Array.isArray(patch.oscillators)||patch.oscillators.length!==2)errors.push("Sound must have two oscillator slots.");
 else for(const osc of patch.oscillators) {
  if(!object(osc)||!WAVES.includes(osc.wave)||!num(osc.level,0,1)||
     !Number.isInteger(osc.octave)||!num(osc.octave,-2,2)||!num(osc.detune,-100,100))
   errors.push("Invalid oscillator parameters.");
 }
 if(!num(patch.noise,0,1)||!num(patch.pan,-1,1))errors.push("Invalid noise level or panning.");
 if(!object(patch.filter)||!FILTERS.includes(patch.filter.type)||!num(patch.filter.cutoff,50,14000)||!num(patch.filter.resonance,.1,16))
  errors.push("Invalid filter settings.");
 if(!object(patch.envelope)||!num(patch.envelope.attack,0,3)||!num(patch.envelope.decay,0,3)||
   !num(patch.envelope.sustain,0,1)||!num(patch.envelope.release,.01,4))
  errors.push("Invalid envelope.");
 if(!object(patch.movement)||!num(patch.movement.rate,.1,20)||!num(patch.movement.depth,0,100))
  errors.push("Invalid vibrato.");
 const fx=patch.effects;
 if(!object(fx)||!num(fx.drive,0,1)||!num(fx.delayMix,0,1)||
   !num(fx.delayTime,.05,1)||!num(fx.delayFeedback,0,.8))errors.push("Invalid effects.");
 return errors;
}
