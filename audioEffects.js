import {parameterFor,parameterDefaults,validParameterValue,validateParameterBlock} from "./src/dsp/parameters.js";
// A single drive characteristic shared by synth and sample playback.
export const SAMPLE_FILTERS=parameterFor("filter.type","sample").values;
export const DEFAULT_SAMPLE_FILTER=Object.freeze(parameterDefaults("filter","sample"));
export const sampleTone=patch=>({filter:patch.filter??DEFAULT_SAMPLE_FILTER,drive:patch.drive??0});
const curves=new Map();
export function driveCurve(amount){
 const strength=Math.round(amount*100);
 if(curves.has(strength))return curves.get(strength);
 const k=1+strength*.65,curve=new Float32Array(1024);
 for(let i=0;i<curve.length;i++){const x=(i/(curve.length-1))*2-1;curve[i]=Math.tanh(k*x)/Math.tanh(k);}
 curves.set(strength,curve);return curve;
}
export function validateSampleTone(patch){
 const filter=patch.filter;
 if(filter!=null&&validateParameterBlock(filter,"filter",{context:"sample"}).length)return "Invalid sample filter.";
 if(patch.drive!==undefined&&!validParameterValue("effects.drive",patch.drive,"sample"))return "Invalid sample distortion.";
 return null;
}

// Waveshaper oversampling reduces aliasing from non-linear drive on bright notes.
// All hosts must match this sound-quality policy, not necessarily this Web Audio API.
export const DRIVE_OVERSAMPLE="4x";
export function configureDriveShaper(shaper,amount){
 shaper.curve=driveCurve(amount);
 shaper.oversample=DRIVE_OVERSAMPLE;
 return shaper;
}
