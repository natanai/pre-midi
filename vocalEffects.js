import {validateStereo} from './src/dsp/stereo.js';
import {validateEq,validateFilterStages} from './src/dsp/equalizer.js';
import {validateProcessingChain,validateDelaySync,effectiveDelayEffects} from "./src/dsp/processing-chain.js";
import {validParameterValue,parameterDefaults} from "./src/dsp/parameters.js";
import {planPitch} from "./src/dsp/expression.js";
import {recordedSourceTravel} from "./src/dsp/recorded-source-clock.js";
import {RECORDING_DEFAULTS,validateRecordedModulation,validateRecordingAutomation} from "./recordedAudio.js";
// Clip audio processing uses the sampler's filter, drive and movement contracts,
// plus the synthesizer's existing delay bus. Source recordings remain immutable.
import {validateSampleTone,sampleTone} from "./audioEffects.js";
import {validateMovement,validateBend,movement} from "./expression.js";
export const VOCAL_EFFECT_DEFAULTS=RECORDING_DEFAULTS;
export function vocalEffects(clip,unit=.125){
 const fx=clip?.effects||{};
 return {...effectiveDelayEffects(fx,{...VOCAL_EFFECT_DEFAULTS,...fx},unit),movement:movement(fx),
  filter:fx.filter?sampleTone(fx).filter:null,bend:fx.bend??parameterDefaults("bend","vocal")};
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
 errors.push(...validateStereo(fx),...validateEq(fx.eq),...validateFilterStages(fx.filterStages),...validateProcessingChain(fx.chain),...validateDelaySync(fx.delaySync));
 const allowed=new Set(["stereoWidth","msBalance","delayTone","delayPingPong","eq","filterStages","delaySync","chain","automation","modulation","pan","transpose","attack","release","drive","delayMix","delayTime","delayFeedback","filter","movement","bend"]);
 for(const key of Object.keys(fx))if(!allowed.has(key))errors.push("Unknown vocal effect "+key+".");
 return errors;
}
export function vocalSourceRange(recording,clip,unit,elapsedSteps=0,{sampleRate=48000,controlStart=0,sourceDuration=recording.durationSeconds}={}){
 const fx=vocalEffects(clip,unit),rate=Math.pow(2,fx.transpose/12);
 const elapsed=Math.max(0,elapsedSteps)*unit;
 const sourceOffset=recording.trimSeconds+(clip.trimStartSeconds??0);
 const sourceEnd=Math.min(recording.durationSeconds-(clip.trimEndSeconds??0),sourceDuration);
 const totalDuration=Math.max(0,Math.min((sourceEnd-sourceOffset)/rate,clip.lengthSteps*unit));
 const pitch=planPitch({bend:fx.bend},fx.movement,0,totalDuration,0,{elapsed,totalDuration});
 const offset=sourceOffset+recordedSourceTravel(pitch,rate,elapsed,{sampleRate,controlStart});
 const duration=offset>=sourceEnd?0:Math.max(0,totalDuration-elapsed);
 return {offset,duration,rate,fx,elapsed,totalDuration,pitch,sourceEnd,sourceRemaining:Math.max(0,sourceEnd-offset)};
}
