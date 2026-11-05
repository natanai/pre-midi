// Read-only frequency-response model for the educational filter diagram.
// These are the same normalized biquad coefficient equations as
// native/filter.hpp and the Web Audio BiquadFilterNode. This module never
// processes PCM, creates a second DSP engine, or writes Sound parameters.
//
// A fixed 48 kHz *model* is used to keep the diagram deterministic; the
// measured audio scope remains the authority for the actual host/sample rate.
const TYPES=new Set(["lowpass","highpass","bandpass","notch"]);
const TWO_PI=2*Math.PI;
export const FILTER_ILLUSTRATION_SAMPLE_RATE=48000;

export function modeledFilterMagnitude(filter,frequency,sampleRate=FILTER_ILLUSTRATION_SAMPLE_RATE){
 const {type,cutoff,resonance}=filter;
 if(!TYPES.has(type)||!Number.isFinite(cutoff)||!Number.isFinite(resonance)||
  !Number.isFinite(frequency)||!Number.isFinite(sampleRate)||sampleRate<=0||
  cutoff<=0||cutoff>=sampleRate/2||resonance<=0)
  throw RangeError("Invalid biquad illustration parameters");
 const theta=TWO_PI*cutoff/sampleRate,c=Math.cos(theta),s=Math.sin(theta);
 // Low/high-pass Q is in dB in Web Audio's historical coefficient contract;
 // band-pass and notch Q is linear. Preserve the native implementation's
 // distinction instead of approximating resonance with a Gaussian bump.
 const quality=(type==="lowpass"||type==="highpass")?
  10**(resonance/20):resonance;
 const alpha=s/(2*quality),a0=1+alpha,a1=-2*c/a0,a2=(1-alpha)/a0;
 let b0,b1,b2;
 if(type==="lowpass"){
  b0=(1-c)/2/a0;b1=(1-c)/a0;b2=b0;
 }else if(type==="highpass"){
  b0=(1+c)/2/a0;b1=-(1+c)/a0;b2=b0;
 }else if(type==="bandpass"){
  b0=alpha/a0;b1=0;b2=-b0;
 }else{
  b0=1/a0;b1=-2*c/a0;b2=b0;
 }
 const phase=TWO_PI*Math.max(0,Math.min(frequency,sampleRate/2))/sampleRate;
 const cosine=Math.cos(phase),sine=Math.sin(phase);
 const twiceCosine=Math.cos(2*phase),twiceSine=Math.sin(2*phase);
 const numerator=Math.hypot(b0+b1*cosine+b2*twiceCosine,
  b1*sine+b2*twiceSine);
 const denominator=Math.hypot(1+a1*cosine+a2*twiceCosine,
  a1*sine+a2*twiceSine);
 return numerator/Math.max(1e-15,denominator);
}

// A fixed, labeled dB viewport keeps pass bands and resonant peaks legible.
// Values outside this teaching window are clipped visually, not in audio.
export function modeledFilterY(magnitude){
 const db=20*Math.log10(Math.max(1e-12,magnitude));
 const normalized=Math.max(0,Math.min(1,(db+36)/48));
 return 95-72*normalized;
}
