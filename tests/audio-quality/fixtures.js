import {makePatch} from "../../synth.js";
// Immutable IDs + explicit measurement windows are shared by future renderers.
export const SAMPLE_RATES=[44100,48000,96000];
export const FFT_SIZE=16384;
export const ENVELOPE_FIXTURES=[
 {id:"attack-release",gate:.05,envelope:{attack:.2,decay:.5,sustain:.4,release:.3}},
 {id:"decay-release",gate:.35,envelope:{attack:.2,decay:.5,sustain:.4,release:.3}},
 {id:"sustain-release",gate:.9,envelope:{attack:.2,decay:.5,sustain:.4,release:.3}},
 {id:"subsample-gate",gate:.000001,envelope:{attack:0,decay:.1,sustain:.5,release:.01}},
 {id:"zero-decay",gate:.03,envelope:{attack:0,decay:0,sustain:.4,release:.01}},
 {id:"silent-sustain",gate:.3,envelope:{attack:.002,decay:.05,sustain:0,release:.03}}
];
export function cleanPatch(wave="sine"){
 const patch=makePatch();
 patch.oscillators=[{wave,level:1,octave:0,detune:0},{wave:"sine",level:0,octave:0,detune:0}];
 if(wave==="harmonic")patch.oscillators[0].harmonics=Array.from({length:32},(_,i)=>i<8?1/(i+1):0);
 patch.filter={type:"lowpass",cutoff:14000,resonance:.70710678,sweep:0,sweepTime:.2};
 patch.envelope={attack:.005,decay:.01,sustain:1,release:.05};
 patch.effects={drive:0,delayMix:0,delayTime:.1,delayFeedback:.3};
 return patch;
}
// Independent analytical oracle; deliberately does not call production DSP code.
export function referenceEnvelope(t,gate,e){
 if(t<0)return 0;
 const attack=Math.max(.002,e.attack);
 const held=x=>x<attack?x/attack:e.decay>0&&x<attack+e.decay?
  1-(1-e.sustain)*(x-attack)/e.decay:e.sustain;
 if(t<gate)return held(t);
 if(t<=gate+e.release)return held(gate)+(.000001-held(gate))*(t-gate)/e.release;
 return .000001;
}
