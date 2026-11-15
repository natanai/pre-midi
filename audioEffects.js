import {driveCurve,driveCompensation} from "./src/dsp/distortion.js";
export {driveCurve} from "./src/dsp/distortion.js";
import {parameterFor,parameterDefaults,validParameterValue,validateParameterBlock} from "./src/dsp/parameters.js";
// A single drive characteristic shared by synth and sample playback.
export const SAMPLE_FILTERS=parameterFor("filter.type","sample").values;
export const DEFAULT_SAMPLE_FILTER=Object.freeze(parameterDefaults("filter","sample"));
export const sampleTone=patch=>({filter:patch.filter?{...DEFAULT_SAMPLE_FILTER,...patch.filter}:DEFAULT_SAMPLE_FILTER,drive:patch.drive??0});
export function validateSampleTone(patch){
 const filter=patch.filter;
 if(filter!=null&&validateParameterBlock(filter,"filter",{context:"sample",optional:["sweep","sweepTime"]}).length)return "Invalid sample filter.";
 if(patch.drive!==undefined&&!validParameterValue("effects.drive",patch.drive,"sample"))return "Invalid sample distortion.";
 return null;
}

// Waveshaper oversampling reduces aliasing from non-linear drive on bright notes.
// All hosts must match this sound-quality policy, not necessarily this Web Audio API.
export const DRIVE_OVERSAMPLE="4x";
export function configureDriveShaper(shaper,amount,settings){
 shaper.curve=driveCurve(amount,settings);
 shaper.oversample=DRIVE_OVERSAMPLE;
 return shaper;
}

export function driveStage(context,amount,settings,owner){
 const shaper=context.createWaveShaper(),gain=context.createGain();
 owner.nodes.push(shaper,gain);
 configureDriveShaper(shaper,amount,settings);
 gain.gain.value=driveCompensation(amount,settings);
 shaper.connect(gain);
 return {input:shaper,output:gain};
}
