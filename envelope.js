// One amplitude envelope contract for all synth notes, independent of host UI.
// Release starts from the instantaneous envelope level, even during attack/decay.
export function envelopeLevelAt(envelope, peak, elapsedSeconds) {
 const time=Math.max(0,elapsedSeconds);
 const attack=Math.max(.002,envelope.attack);
 if(time<attack)return peak*time/attack;
 if(envelope.decay<=0)return peak*envelope.sustain;
 if(time<attack+envelope.decay)
  return peak*(1-(1-envelope.sustain)*(time-attack)/envelope.decay);
 return peak*envelope.sustain;
}
export function scheduleAmplitudeEnvelope(param,{start,off,peak,envelope}) {
 if(!(off>start))throw Error("Note-off must follow note-on.");
 const attackEnd=start+Math.max(.002,envelope.attack);
 const decayEnd=attackEnd+envelope.decay;
 const releaseLevel=envelopeLevelAt(envelope,peak,off-start);
 param.setValueAtTime(0,start);
 if(off<attackEnd) {
  param.linearRampToValueAtTime(releaseLevel,off);
 } else {
  param.linearRampToValueAtTime(peak,attackEnd);
  if(off<decayEnd) {
   param.linearRampToValueAtTime(releaseLevel,off);
  } else if(envelope.decay>0) {
   param.linearRampToValueAtTime(peak*envelope.sustain,decayEnd);
  } else {
   param.setValueAtTime(peak*envelope.sustain,attackEnd);
  }
 }
 // Never jump to the sustain value when the key is released mid-attack/decay.
 param.setValueAtTime(releaseLevel,off);
 param.linearRampToValueAtTime(.000001,off+envelope.release);
 return releaseLevel;
}
