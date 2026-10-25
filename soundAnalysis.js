// Local analysis for short, isolated sounds. It proposes native synth values;
// the matching pass evaluates them with the actual Web Audio voice.
import {makePatch} from "./synth.js";
import {HARMONIC_COUNT} from "./harmonics.js";
import {estimatePitch,hzFromPitch,pitchFromHz} from "./recording.js";
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mean=values=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
export const ANALYSIS_RATE=22050;
export function resampleMono(values,rate,target=ANALYSIS_RATE){
 if(!Number.isFinite(rate)||rate<8000||rate>192000||!values?.length)
  throw Error("No readable audio samples.");
 const result=new Float32Array(Math.round(values.length*target/rate));
 for(let i=0;i<result.length;i++){
  const position=i*rate/target,index=Math.floor(position),fraction=position-index;
  result[i]=values[index]*(1-fraction)+(values[Math.min(values.length-1,index+1)]||0)*fraction;
  if(!Number.isFinite(result[i]))throw Error("Audio contains invalid samples.");
 }
 return result;
}
const windows=new Map();
function windowFor(size){
 if(!windows.has(size))windows.set(size,Float64Array.from({length:size},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(size-1))));
 return windows.get(size);
}
// Iterative radix-two Fourier transform, with a Hann window and no dependencies.
export function powerSpectrum(values,offset=0,size=2048){
 const real=new Float64Array(size),imag=new Float64Array(size),window=windowFor(size);
 for(let i=0;i<size;i++)real[i]=(values[offset+i]||0)*window[i];
 for(let i=1,j=0;i<size;i++){
  let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
  if(i<j)[real[i],real[j]]=[real[j],real[i]];
 }
 for(let length=2;length<=size;length*=2){
  const angle=-2*Math.PI/length,stepR=Math.cos(angle),stepI=Math.sin(angle);
  for(let from=0;from<size;from+=length){
   let wr=1,wi=0;
   for(let j=0;j<length/2;j++){
    const a=from+j,b=a+length/2,tr=wr*real[b]-wi*imag[b],ti=wr*imag[b]+wi*real[b];
    real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;
    const next=wr*stepR-wi*stepI;wi=wr*stepI+wi*stepR;wr=next;
   }
  }
 }
 return Float64Array.from({length:size/2},(_,i)=>(real[i]**2+imag[i]**2)/(size*size));
}
function envelopeOf(values,count=64){
 const result=[];
 for(let i=0;i<count;i++){
  const from=Math.floor(i*values.length/count),to=Math.max(from+1,Math.floor((i+1)*values.length/count));
  let sum=0;for(let j=from;j<to;j++)sum+=(values[j]||0)**2;
  result.push(Math.sqrt(sum/(to-from)));
 }
 return result;
}
export function audioSignature(values,rate=ANALYSIS_RATE){
 const spectrum=[];
 for(const size of [512,2048]){
  for(let frame=0;frame<8;frame++){
   const start=Math.round(frame/7*Math.max(0,values.length-size));
   const power=powerSpectrum(values,start,size),bands=new Float64Array(48);
   for(let bin=1;bin<power.length;bin++){
    const hz=bin*rate/size;
    if(hz<40)continue;
    const index=clamp(Math.floor(Math.log(hz/40)/Math.log(rate/80)*48),0,47);
    bands[index]+=power[bin];
   }
   spectrum.push(...Array.from(bands,Math.sqrt));
  }
 }
 const maximum=Math.max(1e-9,...spectrum);
 const loudness=envelopeOf(values),peak=Math.max(1e-9,...loudness);
 return {spectrum:spectrum.map(value=>Math.log1p(100*value/maximum)),envelope:loudness.map(value=>value/peak)};
}
export function signatureDistance(target,candidate){
 const difference=(a,b)=>mean(a.map((value,i)=>Math.abs(value-b[i])));
 return .65*difference(target.spectrum,candidate.spectrum)+.85*difference(target.envelope,candidate.envelope);
}
function averageSpectrum(values,rate){
 const size=4096,result=new Float64Array(size/2);
 for(let frame=0;frame<8;frame++){
  const spectrum=powerSpectrum(values,Math.round(frame/7*Math.max(0,values.length-size)),size);
  for(let i=0;i<result.length;i++)result[i]+=spectrum[i]/8;
 }
 return {power:result,binHz:rate/size};
}
function pitchMotion(values,rate,hz,seconds){
 const cents=[],times=[],lag=rate/hz,window=Math.min(2048,Math.floor(rate*.06));
 for(let offset=0;offset+window+lag*1.1<values.length;offset+=Math.round(rate*.02)){
  let best=Infinity,period=lag;
  for(let candidate=Math.max(2,Math.floor(lag*.94));candidate<=Math.ceil(lag*1.06);candidate++){
   let error=0,energy=0;
   for(let i=0;i<window;i++){
    const a=values[offset+i],b=values[offset+i+candidate];error+=(a-b)**2;energy+=a*a+b*b;
   }
   const relative=error/Math.max(1e-9,energy);
   if(relative<best){best=relative;period=candidate;}
  }
  if(best<.2){cents.push(1200*Math.log2(lag/period));times.push(offset/rate);}
 }
 const motion={rate:5,depth:0,delay:0,glide:0,glideTime:.18,tremolo:0,tremoloRate:5,tone:0,toneRate:2};
 if(cents.length<12||seconds<.4)return motion;
 const center=mean(cents),variance=mean(cents.map(value=>(value-center)**2));
 let best=0,frequency=5;
 for(let candidate=3;candidate<=9;candidate+=.25){
  let re=0,im=0;
  for(let i=0;i<cents.length;i++){
   const value=cents[i]-center,phase=2*Math.PI*candidate*times[i];
   re+=value*Math.cos(phase);im+=value*Math.sin(phase);
  }
  const amplitude=2*Math.hypot(re,im)/cents.length;
  if(amplitude>best){best=amplitude;frequency=candidate;}
 }
 if(best>5&&best<100&&best*best/2>variance*.45){motion.rate=frequency;motion.depth=best;}
 return motion;
}
export function analyzeSound(input,rate,{kind="note",root}={}){
 if(!["note","hit"].includes(kind))throw Error("Choose a note or a hit.");
 if(!Number.isFinite(rate)||!input?.length||input.length/rate>4.001)
  throw Error("Choose up to four seconds containing one note or hit.");
 let values=resampleMono(input,rate);
 const dc=mean(Array.from(values));for(let i=0;i<values.length;i++)values[i]-=dc;
 const env=envelopeOf(values,Math.max(16,Math.ceil(values.length/ANALYSIS_RATE/.01)));
 const peak=Math.max(...env);
 if(peak<.00001)throw Error("This sound is silent. Record or choose an audible sound.");
 const onset=env.findIndex(value=>value>peak*.06),last=env.findLastIndex(value=>value>peak*.035);
 const block=values.length/env.length;
 values=values.slice(Math.max(0,Math.floor(onset*block-ANALYSIS_RATE*.005)),
  Math.min(values.length,Math.ceil((last+1)*block+ANALYSIS_RATE*.02)));
 const seconds=values.length/ANALYSIS_RATE;
 if(seconds<.06)throw Error("Choose a sound at least 0.06 seconds long.");
 const detected=estimatePitch(values,ANALYSIS_RATE);
 if(root!==undefined&&(!Number.isInteger(root)||root<0||root>127))throw Error("Choose the recorded note.");
 const reference=root??detected?.midi??60;
 const hz=detected&&Math.abs(detected.midi-reference)<=1?detected.hz:hzFromPitch(reference);
 const {power,binHz}=averageSpectrum(values,ANALYSIS_RATE),occupied=new Set();
 const amplitudes=Array.from({length:HARMONIC_COUNT},(_,i)=>{
  const bin=hz*(i+1)/binHz;
  if(bin>=power.length-1)return 0;
  let sum=0;
  for(let k=Math.max(1,Math.ceil(bin-1.6));k<=Math.min(power.length-1,Math.floor(bin+1.6));k++){
   sum+=power[k];occupied.add(k);
  }
  return Math.sqrt(sum);
 });
 const total=power.reduce((sum,value)=>sum+value,0);
 const tonal=[...occupied].reduce((sum,k)=>sum+power[k],0)/Math.max(1e-12,total);
 const maxPartial=Math.max(...amplitudes,1e-9);
 const partials=amplitudes.map(value=>value/maxPartial<.015?0:Number((value/maxPartial).toFixed(4)));
 const centroid=power.reduce((sum,value,i)=>sum+value*i*binHz,0)/Math.max(1e-12,total);
 const loudness=envelopeOf(values),maximum=Math.max(...loudness),step=seconds/loudness.length;
 const attackIndex=loudness.findIndex(value=>value>=maximum*.92),attack=clamp(attackIndex*step,0,Math.min(3,seconds*.65));
 const tail=mean(loudness.slice(40,54))/maximum;
 const sustain=clamp(tail,0,1),hold=Math.max(.04,seconds*.8);
 const sustainIndex=loudness.findIndex((value,i)=>i>attackIndex&&value<=maximum*Math.max(.1,sustain));
 const decay=clamp((sustainIndex<0?hold:Math.min(hold,sustainIndex*step))-attack,.01,3);
 const envelope={attack,decay,sustain,release:clamp(seconds-hold-.012,.01,4)};
 // Rack voices derive their gate from attack + decay. Fit that same gate,
 // including sustained ringing hits, rather than cutting them off immediately.
 if(kind==="hit")envelope.decay=clamp(hold-attack,.01,3);
 const noise=clamp(Math.sqrt(Math.max(0,1-tonal))*.55,0,1);
 const pureNoise=kind==="hit"&&!detected&&tonal<.35;
 const brightness=centroid>2200?"Bright":centroid<850?"Warm":"Clear";
 const character=pureNoise?"Noise Hit":kind==="hit"?"Harmonic Hit":sustain<.4?"Pluck":attack>.15?"Swell":"Tone";
 return {values,rate:ANALYSIS_RATE,seconds,hold,referencePitch:kind==="hit"?(detected?.midi??reference):reference,
  detune:clamp(1200*Math.log2(hz/hzFromPitch(reference)),-100,100),partials,noise:pureNoise?1:noise<.045?0:noise,
  pureNoise,centroid,envelope,movement:detected?pitchMotion(values,ANALYSIS_RATE,hz,seconds):undefined,
  name:brightness+" "+character,kind,detected:Boolean(detected),signature:audioSignature(values)};
}
export function patchFromAnalysis(analysis){
 const patch=makePatch("init");patch.presetId="custom";
 patch.oscillators=[{wave:"harmonic",harmonics:analysis.partials,level:analysis.pureNoise?0:1,octave:0,detune:analysis.detune},
  {wave:"sine",level:0,octave:0,detune:0}];
 patch.noise=analysis.noise;patch.filter={type:analysis.pureNoise&&analysis.centroid>3000?"highpass":"lowpass",
  cutoff:analysis.pureNoise?clamp(analysis.centroid*.55,100,7000):14000,resonance:.7};
 patch.envelope={...analysis.envelope};
 if(analysis.movement)patch.movement={...analysis.movement};
 patch.effects={drive:0,delayMix:0,delayTime:.24,delayFeedback:.26};
 return patch;
}
