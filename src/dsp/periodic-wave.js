// Control-thread Fourier preparation. A phase rotation must retain the original
// recipe's fixed peak normalization, rather than renormalize the rotated grid.
export const periodicTableSize=rate=>rate<=24000?2048:rate<=88200?4096:16384;
const recipes=new Map();
function normalizedRecipe(slot,rate){
 const size=periodicTableSize(rate),key=size+':'+slot.wave+':'+(slot.harmonics??[]).join(',');
 if(recipes.has(key))return recipes.get(key);
 const count=slot.wave==='harmonic'?33:size/2,b=new Float32Array(count),real=new Float64Array(size),imag=new Float64Array(size);
 for(let n=1;n<count;n++){
  const factor=Math.fround(2/Math.fround(n*Math.fround(Math.PI)));
  b[n]=slot.wave==='sine'?(n===1?1:0):slot.wave==='triangle'?(n%2?8*Math.sin(n*Math.PI/2)/(Math.PI*Math.PI*n*n):0):slot.wave==='square'?(n%2?2*factor:0):slot.wave==='sawtooth'?(n%2?factor:-factor):slot.harmonics[n-1];
  imag[n]=-b[n]*size/2;imag[size-n]=b[n]*size/2;
 }
 // Inverse radix-2 FFT. Allocation and coefficient preparation never run on an
 // audio callback; the recipe cache is bounded and shared across phase variants.
 for(let i=1,j=0;i<size;i++){
  let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
  if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}
 }
 for(let step=2;step<=size;step*=2)for(let start=0;start<size;start+=step)for(let j=0;j<step/2;j++){
  const angle=2*Math.PI*j/step,c=Math.cos(angle),s=Math.sin(angle),a=start+j,d=a+step/2,tr=c*real[d]-s*imag[d],ti=s*real[d]+c*imag[d];
  real[d]=real[a]-tr;imag[d]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;
 }
 let peak=0;for(const value of real)peak=Math.max(peak,Math.abs(value/size));
 const result={b,peak};if(recipes.size>=64)recipes.clear();recipes.set(key,result);return result;
}
export function phaseCoefficients(slot,phase,rate){
 const {b,peak}=normalizedRecipe(slot,rate),real=new Float32Array(b.length),imag=new Float32Array(b.length);
 for(let n=1;n<b.length;n++){const value=peak?b[n]/peak:0;real[n]=value*Math.sin(n*phase);imag[n]=value*Math.cos(n*phase);}
 return {real,imag};
}
