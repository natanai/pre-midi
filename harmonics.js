// A compact, editable Fourier recipe. Index zero is the fundamental, not DC.
// These numbers generate a new periodic oscillator; they never contain audio.
export const HARMONIC_COUNT=32;
export function harmonicRecipe(shape="sine"){
 return Array.from({length:HARMONIC_COUNT},(_,i)=>{
  const n=i+1;
  return shape==="saw"?1/n:shape==="odd"?(n%2?1/n:0):i===0?1:0;
 });
}
export const validHarmonics=values=>Array.isArray(values)&&values.length===HARMONIC_COUNT&&
 values.every(value=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=1);
export function harmonicWave(values,phase){
 let sum=0,weight=0;
 for(let i=0;i<values.length;i++){
  sum+=values[i]*Math.sin((i+1)*phase);weight+=values[i];
 }
 return weight?sum/weight:0;
}
const waves=new WeakMap();
export function setOscillatorWave(context,oscillator,slot){
 if(slot.wave!=="harmonic"){oscillator.type=slot.wave;return;}
 if(!validHarmonics(slot.harmonics))throw Error("Invalid harmonic oscillator.");
 let cache=waves.get(context);
 if(!cache){cache=new Map();waves.set(context,cache);}
 const key=slot.harmonics.join(",");
 let wave=cache.get(key);
 if(!wave){
  const real=new Float32Array(HARMONIC_COUNT+1),imag=new Float32Array(HARMONIC_COUNT+1);
  imag.set(slot.harmonics,1);
  wave=context.createPeriodicWave(real,imag);
  if(cache.size>=128)cache.clear();
  cache.set(key,wave);
 }
 oscillator.setPeriodicWave(wave);
}
