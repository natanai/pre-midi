import {RECORDING_DEFAULTS,validateRecordedModulation,validateRecordingAutomation} from "./recordedAudio.js";
// Clip audio processing uses the sampler's filter, drive and movement contracts,
// plus the synthesizer's existing delay bus. Source recordings remain immutable.
import {validateSampleTone} from "./audioEffects.js";
import {validateMovement,validateBend,movement} from "./expression.js";
export const VOCAL_EFFECT_DEFAULTS=RECORDING_DEFAULTS;
export function vocalEffects(clip){
 const fx=clip?.effects||{};
 return {...VOCAL_EFFECT_DEFAULTS,...fx,movement:movement(fx),
  filter:fx.filter??null,bend:fx.bend??{shape:"straight",amount:2,rate:4}};
}
export function validateVocalEffects(fx){
 if(fx===undefined)return [];
 if(!fx||typeof fx!=="object"||Array.isArray(fx))return ["Invalid vocal effects."];
 const errors=[],value=(name,min,max)=>{
  if(fx[name]!==undefined&&(!Number.isFinite(fx[name])||fx[name]<min||fx[name]>max))
   errors.push("Invalid vocal "+name+".");
 };
 for(const [name,min,max] of [
  ["pan",-1,1],["transpose",-24,24],["attack",0,2],["release",0,3],
  ["delayMix",0,1],["delayTime",.05,1],["delayFeedback",0,.8]
 ])value(name,min,max);
 errors.push(...validateMovement(fx.movement),...validateBend(fx.bend));
 const tone=validateSampleTone({...fx,filter:fx.filter??undefined});if(tone)errors.push(tone);
 errors.push(...validateRecordedModulation(fx.modulation,{vocal:true}),...validateRecordingAutomation(fx.automation));
 const allowed=new Set(["automation","modulation","pan","transpose","attack","release","drive","delayMix","delayTime","delayFeedback","filter","movement","bend"]);
 for(const key of Object.keys(fx))if(!allowed.has(key))errors.push("Unknown vocal effect "+key+".");
 return errors;
}
export function vocalSourceRange(recording,clip,unit,elapsedSteps=0){
 const fx=vocalEffects(clip),rate=Math.pow(2,fx.transpose/12);
 const elapsed=Math.max(0,elapsedSteps)*unit;
 const sourceOffset=recording.trimSeconds+(clip.trimStartSeconds??0);
 const offset=sourceOffset+elapsed*rate;
 const natural=Math.max(0,(recording.durationSeconds-offset)/rate);
 const duration=Math.max(0,Math.min(natural,clip.lengthSteps*unit-elapsed));
 return {offset,duration,rate,fx};
}
