// Version 1 preserves existing synth ADSR semantics, including the legacy floor.
// No host objects or clock reads. Hosts execute ordered events at absolute seconds.
export const ENVELOPE_CONTRACT_VERSION=1;
export const ENVELOPE_PARAMETERS=Object.freeze([
 Object.freeze({id:"envelope.attack",unit:"seconds",min:0,max:3,default:.01,interpolation:"linear",effectiveMin:.002}),
 Object.freeze({id:"envelope.decay",unit:"seconds",min:0,max:3,default:.16,interpolation:"linear"}),
 Object.freeze({id:"envelope.sustain",unit:"linear_gain",min:0,max:1,default:.65,interpolation:"linear"}),
 Object.freeze({id:"envelope.release",unit:"seconds",min:.01,max:4,default:.2,interpolation:"linear"})
]);
export function envelopeLevelAt(envelope,peak,elapsedSeconds){
 const time=Math.max(0,elapsedSeconds),attack=Math.max(.002,envelope.attack);
 if(time<attack)return peak*time/attack;
 if(envelope.decay<=0)return peak*envelope.sustain;
 if(time<attack+envelope.decay)
  return peak*(1-(1-envelope.sustain)*(time-attack)/envelope.decay);
 return peak*envelope.sustain;
}
export function planAmplitudeEnvelope({start,off,peak,envelope}){
 if(!Number.isFinite(start)||start<0||!Number.isFinite(off)||!(off>start))
  throw Error("Note-off must follow note-on at finite nonnegative times.");
 if(!Number.isFinite(peak)||peak<0)throw Error("Invalid envelope peak.");
 for(const parameter of ENVELOPE_PARAMETERS){
  const value=envelope?.[parameter.id.split(".")[1]];
  if(!Number.isFinite(value)||value<parameter.min||value>parameter.max)
   throw Error("Invalid "+parameter.id+".");
 }
 const attackEnd=start+Math.max(.002,envelope.attack),decayEnd=attackEnd+envelope.decay;
 const releaseLevel=envelopeLevelAt(envelope,peak,off-start),events=[];
 const add=(kind,value,time)=>events.push({kind,value,time,order:events.length});
 add("set",0,start);
 if(off<attackEnd)add("linear",releaseLevel,off);
 else{
  add("linear",peak,attackEnd);
  if(off<decayEnd)add("linear",releaseLevel,off);
  else if(envelope.decay>0)add("linear",peak*envelope.sustain,decayEnd);
  else add("set",peak*envelope.sustain,attackEnd);
 }
 add("set",releaseLevel,off);
 add("linear",.000001,off+envelope.release);
 return {contract:"pre-midi-amplitude-envelope",version:ENVELOPE_CONTRACT_VERSION,
  releaseLevel,end:off+envelope.release,events};
}
