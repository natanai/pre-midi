// The two-second deterministic source is shared with native/noise.hpp. Warm
// colored filters from the end of the same period so the seam stays continuous.
export const NOISE_COLORS=Object.freeze(['white','pink','brown']);
export const NOISE_MAX_CUTOFF=20000;
const SEED=0x7f41a08b,MULTIPLIER=1664525,INCREMENT=1013904223;
const advance=seed=>(Math.imul(seed,MULTIPLIER)+INCREMENT)>>>0;
const coefficient=(hz,rate)=>-Math.expm1(-2*Math.PI*Math.min(hz,rate*.45)/rate);
const poles=[80,800,8000],pinkWeights=[2.8,1.12,.364];
export function noiseSettings(patch){
 return {color:patch.noiseColor??'white',cutoff:patch.noiseCutoff??NOISE_MAX_CUTOFF};
}
export function fillNoise(channel,rate,{color,cutoff}){
 const polesAlpha=poles.map(hz=>coefficient(hz,rate));
 const brownGain=.42*Math.sqrt((2-polesAlpha[0])/polesAlpha[0]);
 const toneAlpha=cutoff<NOISE_MAX_CUTOFF?coefficient(cutoff,rate):0;
 const state=[0,0,0];
 let tone=0,seed=SEED;
 const next=()=>{
  seed=advance(seed);
  let value=Math.fround((seed/4294967296*2-1)*.85);
  if(color!=='white'){
   state[0]+=polesAlpha[0]*(value-state[0]);
   if(color==='brown')value=Math.max(-.85,Math.min(.85,state[0]*brownGain));
   else{
    state[1]+=polesAlpha[1]*(value-state[1]);
    state[2]+=polesAlpha[2]*(value-state[2]);
    value=Math.max(-.85,Math.min(.85,.21*value+pinkWeights[0]*state[0]+pinkWeights[1]*state[1]+pinkWeights[2]*state[2]));
   }
  }
  if(toneAlpha){tone+=toneAlpha*(value-tone);value=tone;}
  return value;
 };
 if(color!=='white'||toneAlpha){
  const period=Math.ceil(rate*2),warm=Math.ceil(rate/8);
  for(let frames=period-warm,mul=MULTIPLIER,add=INCREMENT;frames;frames>>>=1){
   if(frames&1)seed=(Math.imul(seed,mul)+add)>>>0;
   add=Math.imul(add,mul+1)>>>0;mul=Math.imul(mul,mul)>>>0;
  }
  for(let i=0;i<warm;i++)next();
  seed=SEED;
 }
 const period=Math.ceil(rate*2);
 for(let i=0;i<channel.length;i++)channel[i]=i<period?next():channel[i-period];
 return channel;
}
// Small-signal spectral response. The colored-source peak bound is excluded from this
// reference; it only limits occasional peaks in the generated source.
export function noiseResponse(hz,rate,{color,cutoff}){
 const phase=2*Math.PI*hz/rate;
 const lowpass=f=>{
  const a=coefficient(f,rate),real=1-(1-a)*Math.cos(phase),imag=(1-a)*Math.sin(phase),s=real*real+imag*imag;
  return [a*real/s,-a*imag/s];
 };
 let magnitude=1;
 if(color==='brown'){
  const a=coefficient(poles[0],rate);
  magnitude=Math.hypot(...lowpass(poles[0]))*.42*Math.sqrt((2-a)/a);
 }
 if(color==='pink'){
  const sum=poles.reduce(([x,y],pole,i)=>{const [a,b]=lowpass(pole);return [x+a*pinkWeights[i],y+b*pinkWeights[i]];},[.21,0]);
  magnitude=Math.hypot(...sum);
 }
 return cutoff<NOISE_MAX_CUTOFF?magnitude*Math.hypot(...lowpass(cutoff)):magnitude;
}
