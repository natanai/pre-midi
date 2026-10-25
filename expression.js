// One expressive performance contract for synth and sampler voices.
// The authored score retains each note's optional bend and each patch's
// movement. Live transport, audition, and WAV render use identical scheduling.
export const BEND_SHAPES=[
 ["straight","Straight"],["scoop","Scoop up"],["rise","Bend up"],
 ["fall","Fall away"],["dip","Dip and return"],["wail","Cry / wail"],
 ["wave","Wave / wobble"]
];
export const movementDefaults={
 rate:5,depth:0,delay:0,glide:0,glideTime:.18,
 tremolo:0,tremoloRate:5,tone:0,toneRate:2
};
export const movement=patch=>({...movementDefaults,...(patch?.movement||{})});
const valid=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateMovement(params){
 if(params===undefined)return [];
 if(!params||typeof params!=="object"||Array.isArray(params))return ["Invalid movement parameters."];
 const errors=[];
 for(const [name,min,max] of [
  ["rate",.1,20],["depth",0,100],["delay",0,3],
  ["glide",-12,12],["glideTime",.01,3],
  ["tremolo",0,1],["tremoloRate",.1,20],
  ["tone",0,1],["toneRate",.1,20]
 ]){
  if(params[name]!==undefined&&!valid(params[name],min,max))
   errors.push("Invalid "+name+" movement.");
 }
 return errors;
}
export function validateBend(bend){
 if(bend===undefined)return [];
 if(!bend||typeof bend!=="object"||Array.isArray(bend)||
   !BEND_SHAPES.some(([key])=>key===bend.shape)||
   !valid(bend.amount,0,12)||!valid(bend.rate,.1,12))
  return ["Invalid note pitch expression."];
 return [];
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
export function schedulePitch(ctx,param,note,motion,start,duration,base=0){
 const m=movement({movement:motion});
 const expressive=Boolean(note?.bend&&note.bend.shape!=="straight")||m.glide!==0;
 // Keep the original oscillator/sample constant pitch when there is no bend.
 if(expressive){
  const steps=Math.max(16,Math.min(600,Math.ceil(duration*80)));
  const values=new Float32Array(steps);
  for(let i=0;i<steps;i++)values[i]=base+pitchCents(note,m,i/(steps-1)*duration,duration);
  if(duration>=.01)param.setValueCurveAtTime(values,start,duration);
  else param.setValueAtTime(values[0],start);
 }else param.setValueAtTime(base,start);
 if(m.depth>0){
  const oscillator=ctx.createOscillator(),gain=ctx.createGain();
  oscillator.type="sine";oscillator.frequency.setValueAtTime(m.rate,start);
  gain.gain.setValueAtTime(0,start);
  const enter=start+Math.min(m.delay,Math.max(0,duration-.005));
  if(enter>start)gain.gain.setValueAtTime(0,enter);
  gain.gain.linearRampToValueAtTime(m.depth,Math.min(start+duration,enter+.13));
  gain.gain.setValueAtTime(m.depth,start+duration);
  gain.gain.linearRampToValueAtTime(0,start+duration+.02);
  oscillator.connect(gain);gain.connect(param);
  oscillator.start(start);oscillator.stop(start+duration+.025);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
}
export function scheduleMovementLfo(ctx,param,start,duration,rate,depth){
 if(depth<=0)return;
 const oscillator=ctx.createOscillator(),gain=ctx.createGain();
 oscillator.type="sine";
 oscillator.frequency.setValueAtTime(rate,start);
 gain.gain.setValueAtTime(depth,start);
 oscillator.connect(gain);gain.connect(param);
 oscillator.start(start);oscillator.stop(start+duration+.04);
 oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
