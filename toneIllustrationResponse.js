// A labeled reference tone makes filtering -> waveshaping visible without
// inventing PCM for an imported recording. This is a static teaching model,
// not playback: no envelope, noise, modulation or 4x oversampling transient.
import {driveCurve,DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";
import {modeledFilterResponse} from "./filterIllustrationResponse.js";

export function modeledDrive(value,amount){
 if(amount<=0)return value; // Playback bypasses the shaper at zero drive.
 const curve=driveCurve(amount);
 const position=Math.max(0,Math.min(1023,(value+1)*.5*1023));
 const a=Math.floor(position),b=Math.min(1023,a+1);
 return (curve[a]+(curve[b]-curve[a])*(position-a))/(1+amount*1.1);
}

export function modeledToneWaveform(patch,{points=320,frequency=220,cycles=3}={}){
 const filter=patch.audioFilterBypassed?null:patch.filter??DEFAULT_SAMPLE_FILTER;
 const drive=patch.type==="synth"?patch.effects.drive:patch.drive??0;
 // A fixed, band-limited saw-like test signal contains low and high partials.
 // Keep the same vertical scale on input/output so attenuation stays visible.
 const partials=Array.from({length:16},(_,i)=>{
  const n=i+1,amplitude=.55/n;
  const response=filter?modeledFilterResponse(filter,frequency*n):{magnitude:1,phase:0};
  return {n,amplitude,...response};
 });
 const input=[],filtered=[],output=[];
 for(let i=0;i<points;i++){
  const phase=2*Math.PI*cycles*i/(points-1);
  const before=partials.reduce((sum,h)=>sum+h.amplitude*Math.sin(h.n*phase),0);
  const after=partials.reduce((sum,h)=>
   sum+h.amplitude*h.magnitude*Math.sin(h.n*phase+h.phase),0);
  input.push(before);filtered.push(after);output.push(modeledDrive(after,drive));
 }
 return {input,filtered,output,frequency};
}
