// Monophonic source preparation. Keep the detector and response aligned with
// native/pitch-correction.hpp. Neither runs on a playback callback.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const PITCH_CORRECTION_UPDATE=.01;
export function pitchClassMask(root,steps){
 return steps.reduce((mask,step)=>mask|(1<<((root+step)%12)),0);
}
export function nearestScaleNote(note,mask){
 const center=Math.floor(note);
 let target=center,distance=Infinity;
 for(let candidate=center-11;candidate<=center+12;candidate++){
  if(!(mask&(1<<((candidate%12+12)%12))))continue;
  const error=Math.abs(candidate-note);
  if(error<distance){target=candidate;distance=error;}
 }
 return target;
}
export function validPitchCorrection(amount=0,response=.06,mask=0){
 return Number.isFinite(amount)&&amount>=0&&amount<=1&&Number.isFinite(response)&&response>=.02&&response<=.3&&
  Number.isInteger(mask)&&mask>=0&&mask<=4095&&(!amount||mask!==0);
}

// Use the strongest channel for detection. Applying one correction to both
// channels preserves the stereo image and avoids cancellation in the detector.
export function preparePitchCorrection(channels,rate,{tuneAmount=0,tuneResponse=.06,tuneMask=0,reverse=false}){
 const length=channels[0].length,hop=Math.round(rate*PITCH_CORRECTION_UPDATE);
 if(!tuneAmount)return null;
 const stride=Math.max(1,Math.round(rate/8000)),analysisRate=rate/stride;
 const count=Math.floor(length/stride),width=Math.round(analysisRate*.03);
 const minLag=Math.max(2,Math.floor(analysisRate/1000)),maxLag=Math.ceil(analysisRate/65);
 if(count<=width+maxLag+1)return null;
 const direction=reverse?-1:1;
 let strongest=0,energy=-1;
 for(let c=0;c<channels.length;c++){
  let power=0;
  for(let i=0;i<length;i+=stride){
   const v=channels[c][i];power+=v*v;
  }
  if(power>energy){strongest=c;energy=power;}
 }
 const reduced=channels.map(source=>Float32Array.from({length:count},(_,i)=>{
  const start=reverse?length-1-i*stride:i*stride;
  let sum=0;
  for(let k=0;k<stride;k++)sum+=source[start+k*direction];
  return sum/stride;
 }));
 const mono=reduced[strongest],other=reduced[1-strongest];
 const normalized=new Float64Array(maxLag+2);
 const curve=new Float32Array(Math.ceil(length/hop));
 const alpha=1-Math.exp(-hop/(rate*tuneResponse));
 let shift=0,lastTarget=NaN,audibleCorrection=false;
 for(let index=0;index<curve.length;index++){
  const frame=Math.floor(index*hop/stride);
  const start=clamp(frame-Math.floor(width/2),0,count-width-maxLag-2);
  const detected=detectPeriod(mono,start,width,minLag,maxLag,normalized);
  if(!detected||other&&!compatiblePitch(mono,other,start,width,detected)){shift=0;lastTarget=NaN;continue;}
  const note=69+12*Math.log2(analysisRate/(440*detected));
  let target=nearestScaleNote(note,tuneMask);
  if(Math.abs(lastTarget-note)<Math.abs(target-note)+.12)target=lastTarget;
  lastTarget=target;
  const desired=clamp((target-note)*tuneAmount,-3,3);
  shift+=alpha*(desired-shift);
  curve[index]=shift;
  if(Math.abs(shift)>.005)audibleCorrection=true;
 }
 return audibleCorrection?curve:null;
}

// YIN cumulative-mean normalized difference and first confident minimum.
// Require energy at the detected fundamental to reject common chord
// subharmonics. Some periodic mixtures are ambiguous with a single note.
function detectPeriod(mono,start,width,minLag,maxLag,normalized){
 let power=0,sum=0;
 for(let i=0;i<width;i++){const v=mono[start+i];sum+=v;power+=v*v;}
 const variance=power-sum*sum/width;
 if(variance<width*1.6e-5)return 0;
 let total=0;
 normalized[0]=1;
 for(let lag=1;lag<=maxLag+1;lag++){
  let delta=0;
  for(let i=start;i<start+width;i++){const d=mono[i]-mono[i+lag];delta+=d*d;}
  total+=delta;normalized[lag]=total>0?delta*lag/total:1;
 }
 let lag=minLag;
 while(lag<=maxLag&&(normalized[lag]>.12||normalized[lag]>normalized[lag+1]||normalized[lag]>normalized[lag-1]))lag++;
 if(lag>maxLag)return 0;
 const a=normalized[lag-1],b=normalized[lag],c=normalized[lag+1];
 const period=lag+clamp((a-c)/Math.max(1e-12,2*(a-2*b+c)),-.5,.5);
 const n=Math.max(1,Math.floor(width/period)),size=Math.min(width,Math.round(n*period)),angle=2*Math.PI/period;
 let cosine=0,sine=0;
 for(let i=0;i<size;i++){
  const v=mono[start+i]-sum/width;
  cosine+=v*Math.cos(angle*i);sine+=v*Math.sin(angle*i);
 }
 return (cosine*cosine+sine*sine)*2*width>=.075*variance*size*size?period:0;
}

// A second strong channel must support the same period. Widely panned notes
// are still polyphonic, even if each channel contains a clean single pitch.
function compatiblePitch(primary,secondary,start,width,period){
 const lag=Math.floor(period),fraction=period-lag;
 let referencePower=0,otherPower=0,difference=0;
 for(let i=start;i<start+width;i++){
  const a=primary[i],b=secondary[i],next=secondary[i+lag]+fraction*(secondary[i+lag+1]-secondary[i+lag]);
  referencePower+=a*a;otherPower+=b*b;difference+=(b-next)*(b-next);
 }
 return otherPower<referencePower*.1||difference<otherPower*.22;
}
