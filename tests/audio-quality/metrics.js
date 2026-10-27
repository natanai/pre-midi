// Backend-independent PCM analysis. Inputs are floating-point samples, never nodes.
export const db=ratio=>10*Math.log10(Math.max(1e-30,ratio));
export function signalStats(samples){
 if(!samples.length)throw Error("Empty measurement window");
 let sum=0,energy=0,peak=0,maxStep=0,nonFinite=0,clipped=0;
 for(let i=0;i<samples.length;i++){
  const x=samples[i];if(!Number.isFinite(x)){nonFinite++;continue;}
  sum+=x;energy+=x*x;peak=Math.max(peak,Math.abs(x));
  if(Math.abs(x)>=1)clipped++;
  if(i)maxStep=Math.max(maxStep,Math.abs(x-samples[i-1]));
 }
 return {dc:sum/samples.length,rms:Math.sqrt(energy/samples.length),peak,maxStep,nonFinite,clipped};
}
export function difference(a,b){
 if(a.length!==b.length)throw Error("PCM length mismatch");
 let max=0,energy=0;
 for(let i=0;i<a.length;i++){const e=a[i]-b[i];max=Math.max(max,Math.abs(e));energy+=e*e;}
 return {max,rms:Math.sqrt(energy/a.length)};
}
export function crossingFrequency(samples,sampleRate){
 const crossings=[];
 for(let i=1;i<samples.length;i++)if(samples[i-1]<=0&&samples[i]>0)
  crossings.push(i-1-samples[i-1]/(samples[i]-samples[i-1]));
 if(crossings.length<3)throw Error("Too few crossings for tuning measurement");
 return (crossings.length-1)*sampleRate/(crossings.at(-1)-crossings[0]);
}
export function spectrum(samples){
 const n=samples.length;
 if(n<16||(n&(n-1)))throw Error("FFT requires a power-of-two window");
 const real=new Float64Array(n),imag=new Float64Array(n);
 for(let i=0;i<n;i++){
  // Four-term minimum-sidelobe Blackman-Harris. Mask ±5 bins per harmonic.
  const angle=2*Math.PI*i/(n-1);
  const w=.35875-.48829*Math.cos(angle)+.14128*Math.cos(2*angle)-.01168*Math.cos(3*angle);
  real[i]=samples[i]*w;
 }
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
  if(i<j){const t=real[i];real[i]=real[j];real[j]=t;}
 }
 for(let size=2;size<=n;size*=2){
  for(let start=0;start<n;start+=size)for(let j=0;j<size/2;j++){
   const angle=-2*Math.PI*j/size,c=Math.cos(angle),s=Math.sin(angle);
   const a=start+j,b=a+size/2,tr=c*real[b]-s*imag[b],ti=s*real[b]+c*imag[b];
   real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;
  }
 }
 return Float64Array.from({length:n/2+1},(_,i)=>real[i]**2+imag[i]**2);
}
export function harmonicMetrics(samples,sampleRate,fundamental){
 const power=spectrum(samples),n=samples.length,bin=fundamental*n/sampleRate;
 // Reject overlapping masks: this estimator cannot distinguish those harmonics.
 if(bin<=12||bin>=n/2-6)throw Error("Fundamental outside resolved spectral range");
 const mask=new Uint8Array(power.length),harmonics=[];
 let signal=0;
 for(let h=1;h*bin<n/2-5;h++){
  const center=Math.round(h*bin);let energy=0;
  for(let i=center-5;i<=center+5;i++)if(!mask[i]){energy+=power[i];mask[i]=1;}
  harmonics.push(energy);signal+=energy;
 }
 let residual=0;
 for(let i=6;i<power.length;i++)if(!mask[i])residual+=power[i];
 return {offHarmonicDb:db(residual/Math.max(signal,1e-30)),
  thdDb:db(harmonics.slice(1).reduce((a,b)=>a+b,0)/Math.max(harmonics[0],1e-30)),
  harmonicPowerRatios:harmonics.slice(0,8).map(x=>x/Math.max(harmonics[0],1e-30))};
}
// Tolerances apply to acoustic identity, never to host wall-clock timings.
export function compareReference(results,reference){
 const failures=[],byKey=new Map(results.map(row=>[row.id+"@"+row.sampleRate,row]));
 for(const expected of reference.cases){
  const actual=byKey.get(expected.id+"@"+expected.sampleRate);
  if(!actual){failures.push({id:expected.id,sampleRate:expected.sampleRate,metric:"missing fixture"});continue;}
  for(const metric of ["rms","peak"]){
   const target=expected[metric],value=actual.metrics[metric],p=reference.tolerance.level;
   if(!Number.isFinite(value)||Math.abs(value-target)>p.absolute+p.relative*Math.abs(target))
    failures.push({id:expected.id,sampleRate:expected.sampleRate,metric,expected:target,actual:value});
  }
  expected.harmonicPowerRatios.forEach((target,i)=>{
   const value=actual.metrics.harmonicPowerRatios?.[i],p=reference.tolerance.harmonicPower;
   if(!Number.isFinite(value)||Math.abs(value-target)>p.absolute+p.relative*Math.abs(target))
    failures.push({id:expected.id,sampleRate:expected.sampleRate,metric:"harmonicPowerRatios["+i+"]",expected:target,actual:value});
  });
 }
 return {status:failures.length?"fail":"pass",compared:reference.cases.length,failures};
}
