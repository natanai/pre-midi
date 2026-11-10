import {MOD_EFFECT_PARAMETERS} from './parameters.js';
import {modulationRate} from './modulation.js';
export const MOD_EFFECT_KINDS=Object.freeze(Object.keys(MOD_EFFECT_PARAMETERS));
export const CLASSIC_MOD_EFFECT_KINDS=Object.freeze(['chorus','flanger','phaser','autopan']);
export const frequencyEffect=kind=>kind==='ringmod'||kind==='frequencyshift';
export const FREQUENCY_TAPS=129,FREQUENCY_DELAY=64;
export const MOTION_TABLE_SIZE=1024,MOD_DELAY_SECONDS=.06;
export const delayEffect=kind=>kind==='chorus'||kind==='flanger';
export const defaultModEffect=kind=>Object.fromEntries(Object.entries(MOD_EFFECT_PARAMETERS[kind]).map(([key,p])=>[key,p.default]));
export function validModEffect(kind,values){
 const defs=MOD_EFFECT_PARAMETERS[kind];
 return !!defs&&!!values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length===Object.keys(defs).length&&Object.entries(defs).every(([key,p])=>p.values?p.values.includes(values[key]):Number.isFinite(values[key])&&values[key]>=p.min&&values[key]<=p.max);
}
export function modEffectRecipe(kind,parameters,mix,unit=.125){
 if(!validModEffect(kind,parameters)||!Number.isFinite(unit)||unit<=0||!Number.isFinite(mix)||mix<0||mix>1)throw Error('Invalid modulation effect');
 if(frequencyEffect(kind))return {kind,rate:parameters.frequency,depth:0,phase:parameters.phase,stereo:parameters.stereo,feedback:0,delay:.01,frequency:parameters.frequency,mix};
 const rate=modulationRate(parameters,unit);
 if(!Number.isFinite(rate)||rate<.0025||rate>32)throw Error('Modulation effect tempo is out of range');
 return {kind,rate,depth:parameters.depth,phase:parameters.phase,stereo:parameters.stereo??0,feedback:parameters.feedback??0,delay:parameters.delay??.01,frequency:parameters.frequency??1000,mix};
}
export function modEffectTail(p){
 if(p.mix===0||p.kind==='autopan')return 0;
 if(frequencyEffect(p.kind))return .03;
 if(delayEffect(p.kind)){
  const repeats=p.feedback===0?0:Math.ceil(Math.log(1e-7)/Math.log(Math.abs(p.feedback)));
  return (Math.min(MOD_DELAY_SECONDS,p.delay+p.depth)+.00025)*(1+repeats)+.02;
 }
 return Math.max(.1,7*Math.log(1e6)/(2*Math.PI*Math.min(1000,Math.max(20,p.frequency/2**p.depth))*(1-Math.abs(p.feedback))))+.02;
}
// Tables are prepared once per recipe, never allocated or recalculated in the
// per-sample path. Original note/Clip age determines phase, including seeks.
export function motionTable(p,rate){
 const values=new Float64Array(MOTION_TABLE_SIZE*4);
 for(let i=0;i<MOTION_TABLE_SIZE;i++)for(let ch=0;ch<2;ch++){
  const angle=2*Math.PI*(i/MOTION_TABLE_SIZE+p.phase+(ch?p.stereo:0)),wave=Math.sin(angle),at=i*4+ch*2;
  if(frequencyEffect(p.kind)){values[at]=Math.cos(angle);values[at+1]=Math.sin(angle);}
  else if(delayEffect(p.kind))values[at]=Math.max(1,Math.min(MOD_DELAY_SECONDS*rate,(p.delay+p.depth*wave)*rate));
  else if(p.kind==='phaser'){
   const f=Math.max(20,Math.min(rate*.45,p.frequency*2**(p.depth*wave))),g=Math.tan(Math.PI*f/rate),a=(g-1)/(g+1);
   values[at]=a;values[at+1]=Math.sqrt(Math.max(0,1-a*a));
  }else{
   const pan=p.depth*Math.sin(2*Math.PI*(i/MOTION_TABLE_SIZE+p.phase));
   values[at]=Math.SQRT2*(ch?Math.sin((pan+1)*Math.PI/4):Math.cos((pan+1)*Math.PI/4));
   if(p.depth===0)values[at]=1;
  }
 }
 return values;
}
export function frequencyCoefficients(p,rate){
 const real=new Float64Array(FREQUENCY_TAPS),imag=new Float64Array(FREQUENCY_TAPS),guard=rate*.03;
 const low=p.kind==='frequencyshift'?Math.max(0,-p.frequency):0,high=rate/2-Math.max(p.kind==='ringmod'?Math.abs(p.frequency):p.frequency,0)-guard;
 for(let n=0;n<FREQUENCY_TAPS;n++){
  const k=n-FREQUENCY_DELAY,window=.42-.5*Math.cos(2*Math.PI*n/(FREQUENCY_TAPS-1))+.08*Math.cos(4*Math.PI*n/(FREQUENCY_TAPS-1)),a=2*Math.PI*low/rate,b=2*Math.PI*high/rate;
  real[n]=(k?(Math.sin(b*k)-Math.sin(a*k))/(Math.PI*k):2*(high-low)/rate)*window;
  if(p.kind==='frequencyshift'&&k)imag[n]=(Math.cos(a*k)-Math.cos(b*k))/(Math.PI*k)*window;
 }
 return {real,imag};
}
export class ModEffectKernel{
 constructor(p,rate){
  this.p=p;this.table=motionTable(p,rate);this.frequency=frequencyEffect(p.kind)?frequencyCoefficients(p,rate):null;this.history=this.frequency?new Float32Array(FREQUENCY_TAPS*2):null;this.historyCursor=0;this.capacity=Math.ceil(MOD_DELAY_SECONDS*rate)+2;
  this.ring=delayEffect(p.kind)?new Float32Array(this.capacity*2):null;
  this.states=new Float64Array(12);this.prior=new Float64Array(2);this.cursor=0;this.age=0;
 }
 process(frame,seconds){
  const p=this.p,position=(((seconds*p.rate)%1)+1)%1*MOTION_TABLE_SIZE,index=Math.floor(position),next=(index+1)%MOTION_TABLE_SIZE,t=position-index;
  for(let ch=0;ch<2;ch++){
   const offset=index*4+ch*2,other=next*4+ch*2,a=this.table[offset]+(this.table[other]-this.table[offset])*t,input=frame[ch];let wet;
   if(this.history){
    this.history[this.historyCursor*2+ch]=input;let re=0,im=0;
    for(let n=0;n<FREQUENCY_TAPS;n++){const v=this.history[((this.historyCursor+FREQUENCY_TAPS-n)%FREQUENCY_TAPS)*2+ch];re+=v*this.frequency.real[n];im+=v*this.frequency.imag[n];}
    const dry=this.history[((this.historyCursor+FREQUENCY_TAPS-FREQUENCY_DELAY)%FREQUENCY_TAPS)*2+ch],b=this.table[offset+1]+(this.table[other+1]-this.table[offset+1])*t;
    wet=p.kind==='ringmod'?re*a:re*a-im*b;frame[ch]=Math.fround((1-p.mix)*dry+p.mix*wet);continue;
   }
   if(this.ring){
    const whole=Math.floor(a),fraction=a-whole,recent=(this.cursor+this.capacity-whole)%this.capacity,older=(recent+this.capacity-1)%this.capacity;
    const v=this.age>=whole?this.ring[recent*2+ch]:0,w=this.age>=whole+1?this.ring[older*2+ch]:0;
    wet=v+(w-v)*fraction;this.ring[this.cursor*2+ch]=input*(1-Math.abs(p.feedback))+p.feedback*wet;
   }else if(p.kind==='phaser'){
    const b=this.table[offset+1]+(this.table[other+1]-this.table[offset+1])*t;wet=input*(1-Math.abs(p.feedback))+p.feedback*this.prior[ch];
    // Normalized lattice sections are passive even while coefficients move.
    for(let n=0;n<6;n++){const at=ch*6+n,z=this.states[at],y=a*wet+b*z;this.states[at]=b*wet-a*z;if(Math.abs(this.states[at])<1e-30)this.states[at]=0;wet=y;}
    this.prior[ch]=Math.abs(wet)<1e-30?0:wet;
   }else wet=input*a;
   frame[ch]=Math.fround((1-p.mix)*input+p.mix*wet);
  }
  if(this.history)this.historyCursor=(this.historyCursor+1)%FREQUENCY_TAPS;
  if(this.ring){if(++this.cursor===this.capacity)this.cursor=0;this.age=Math.min(this.capacity,this.age+1);}
 }
}
