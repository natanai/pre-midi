// A single drive characteristic shared by synth and sample playback.
export const SAMPLE_FILTERS=["lowpass","highpass","bandpass","notch"];
export const DEFAULT_SAMPLE_FILTER=Object.freeze({type:"lowpass",cutoff:14000,resonance:.7});
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
 if(filter!==undefined&&(!filter||!SAMPLE_FILTERS.includes(filter.type)||
  typeof filter.cutoff!=="number"||!Number.isFinite(filter.cutoff)||filter.cutoff<50||filter.cutoff>14000||
  typeof filter.resonance!=="number"||!Number.isFinite(filter.resonance)||filter.resonance<.1||filter.resonance>16))return "Invalid sample filter.";
 if(patch.drive!==undefined&&(typeof patch.drive!=="number"||!Number.isFinite(patch.drive)||patch.drive<0||patch.drive>1))return "Invalid sample distortion.";
 return null;
}
