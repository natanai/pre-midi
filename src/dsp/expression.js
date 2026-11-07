import {parameterFor,parameterDefaults,validateParameterBlock} from "./parameters.js";
// One expressive performance contract for synth and sampler voices.
// The authored score retains each note's optional bend and each patch's
// movement. Live transport, audition, and WAV render use identical scheduling.
const bendNames=["Straight","Scoop up","Bend up","Fall away","Dip and return","Cry / wail","Wave / wobble"];
export const BEND_SHAPES=parameterFor("bend.shape").values.map((id,index)=>[id,bendNames[index]]);
export const movementDefaults=Object.freeze(parameterDefaults("movement"));
export const movement=patch=>({...movementDefaults,...(patch?.movement||{})});
export function validateMovement(params){
 if(params===undefined)return [];
 return validateParameterBlock(params,"movement",{optional:Object.keys(movementDefaults)});
}
export function validateBend(bend){
 if(bend===undefined)return [];
 return validateParameterBlock(bend,"bend");
}
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=t=>{const x=clamp(t);return x*x*(3-2*x);};
export function bendSemitones(bend,t,seconds=0){
 if(!bend || bend.shape==="straight")return 0;
 const a=bend.amount??2,x=clamp(t);
 switch(bend.shape){
  case "scoop":return -a*(1-smooth(x/.35));
  case "rise":return a*smooth(x);
  case "fall":return -a*smooth((x-.4)/.6);
  case "dip":return -a*Math.sin(Math.PI*x)**2;
  case "wail":return a*Math.sin(Math.PI*x)*(.6+.4*smooth(x/.35));
  case "wave":return a*Math.sin(2*Math.PI*(bend.rate??5)*seconds)*Math.min(1,x*6);
  default:return 0;
 }
}
export function pitchCents(note,motion,seconds,duration){
 const m=movement({movement:motion});
 const slide=m.glide*(1-smooth(seconds/Math.max(.01,m.glideTime)));
 return 100*(slide+bendSemitones(note?.bend,seconds/Math.max(.001,duration),seconds));
}

// Pitch curves retain the existing 80 Hz control sampling and Float32 rounding.
export function planPitch(note,motion,start,duration,base=0,{elapsed=0,totalDuration=duration+elapsed}={}){
 const m=movement({movement:motion});
 const expressive=Boolean(note?.bend&&note.bend.shape!=="straight")||m.glide!==0;
 let values=null;
 if(expressive){
  const count=Math.max(16,Math.min(600,Math.ceil(duration*80)));
  values=Array.from({length:count},(_,i)=>Math.fround(base+pitchCents(note,m,elapsed+i/(count-1)*duration,totalDuration)));
 }
 return {start,duration,base,values,movement:m,elapsed,totalDuration};
}
