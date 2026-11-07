import {validParameterValue,parameterDefaults} from "./src/dsp/parameters.js";
import {RECORDING_DEFAULTS,validateRecordedModulation,validateRecordingAutomation} from "./recordedAudio.js";
// Clip audio processing uses the sampler's filter, drive and movement contracts,
// plus the synthesizer's existing delay bus. Source recordings remain immutable.
import {validateSampleTone} from "./audioEffects.js";
import {validateMovement,validateBend,movement} from "./expression.js";
export const VOCAL_EFFECT_DEFAULTS=RECORDING_DEFAULTS;
export function vocalEffects(clip){
 const fx=clip?.effects||{};
 return {...VOCAL_EFFECT_DEFAULTS,...fx,movement:movement(fx),
  filter:fx.filter??null,bend:fx.bend??parameterDefaults("bend","vocal")};
}
export function validateVocalEffects(fx){
 if(fx===undefined)return [];
 if(!fx||typeof fx!=="object"||Array.isArray(fx))return ["Invalid vocal effects."];
 const errors=[];
 for(const name of ["pan","transpose","attack","release","delayMix","delayTime","delayFeedback"]){
  const id=name==="attack"||name==="release"?"envelope."+name:name.startsWith("delay")?"effects."+name:name;
  if(fx[name]!==undefined&&!validParameterValue(id,fx[name],"vocal"))errors.push("Invalid vocal "+name+".");
 }
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
