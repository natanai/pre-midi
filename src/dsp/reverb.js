import {REVERB_PARAMETERS} from './parameters.js';
export const REVERB_KEYS=Object.freeze(Object.keys(REVERB_PARAMETERS));
export const defaultReverb=()=>Object.fromEntries(REVERB_KEYS.map(key=>[key,REVERB_PARAMETERS[key].default]));
export function validateReverb(value){
 if(value===undefined)return [];
 return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===REVERB_KEYS.length&&REVERB_KEYS.every(key=>Number.isFinite(value[key])&&value[key]>=REVERB_PARAMETERS[key].min&&value[key]<=REVERB_PARAMETERS[key].max)?[]:['Invalid reverb parameters.'];
}
export const effectiveReverb=patch=>{
 const room=patch?.reverb??defaultReverb();
 return patch?.chain?.bypass.includes('reverb')?{...room,mix:0}:room;
};
export const reverbTailSeconds=room=>room?.mix>0?room.preDelay+3*room.decay+.5:0;
export const roomKey=room=>REVERB_KEYS.map(key=>room[key]);
// Four damped combs and two true allpasses per channel. Control/constructor
// allocation only; tick() creates no objects. Schroeder (JAES 10(3), 1962).
// Decay is the undamped comb RT60; damping shortens bright-frequency decay.
export class ReverbKernel{
 constructor(p,rate){
  this.p=p;this.preFrames=Math.round(p.preDelay*rate);this.pre=new Float32Array(Math.max(1,this.preFrames)*2);this.preCursor=0;
  this.alpha=1-Math.exp(-2*Math.PI*Math.min(rate*.45,1000*18**(1-p.damping))/rate);
  const size=.5+p.size;
  this.combs=Array.from({length:8},(_,i)=>{
   const length=Math.max(1,Math.round(([1557,1617,1491,1422][i%4]*size+(i>=4?23:0))*rate/44100)),feedback=10**(-3*length/rate/p.decay);
   return {ring:new Float32Array(length),at:0,state:0,feedback,level:Math.sqrt(1-feedback*feedback)};
  });
  this.diffusers=Array.from({length:4},(_,i)=>({ring:new Float32Array(Math.max(1,Math.round(([225,556][i%2]*size+(i>=2?23:0))*rate/44100))),at:0}));
  this.left=0;this.right=0;
 }
 tick(left,right){
  if(this.preFrames){const at=this.preCursor*2,a=this.pre[at],b=this.pre[at+1];this.pre[at]=left;this.pre[at+1]=right;left=a;right=b;if(++this.preCursor===this.preFrames)this.preCursor=0;}
  // A mono room excitation with decorrelated stereo paths also gives a mono
  // recording a stereo tail; width zero is exactly mono-compatible.
  const input=Math.fround((left+right)*.5);let a=0,b=0;
  for(let i=0;i<8;i++){
   const c=this.combs[i],delayed=c.ring[c.at];c.state=this.alpha*delayed+(1-this.alpha)*c.state;if(Math.abs(c.state)<1e-30)c.state=0;
   c.ring[c.at]=input+c.feedback*c.state;if(++c.at===c.ring.length)c.at=0;
   if(i<4)a+=delayed*c.level*.25;else b+=delayed*c.level*.25;
  }
  for(let i=0;i<4;i++){
   const d=this.diffusers[i],input=i<2?a:b,output=d.ring[d.at]-.5*input;
   d.ring[d.at]=input+.5*output;if(++d.at===d.ring.length)d.at=0;
   if(i<2)a=output;else b=output;
  }
  const mid=(a+b)*.5,side=(a-b)*.5*this.p.width,gain=this.p.mix*.8;
  this.left=Math.fround((mid+side)*gain);this.right=Math.fround((mid-side)*gain);
 }
}
