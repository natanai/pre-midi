import {parameterFor} from "./src/dsp/parameters.js";
// The same source-region/gate rules as sampler.js, applied to a clearly
// labeled, eight-second reference recording and four-second held note.
export const SAMPLE_REFERENCE_SECONDS=8;
export const SAMPLE_REFERENCE_GATE=4;
export const SAMPLE_REFERENCE_VIEW=10;
export function modeledSampleEnvelope(patch){
 const vocal=patch.type==="vocal",context=vocal?"vocal":"sample",releaseParameter=parameterFor("envelope.release",context),release=patch.release??releaseParameter.default,attack=patch.attack??parameterFor("envelope.attack",context).default;
 const life=vocal||patch.oneShot?SAMPLE_REFERENCE_SECONDS:
  Math.min(SAMPLE_REFERENCE_SECONDS,SAMPLE_REFERENCE_GATE+release);
 const attackEnd=Math.min(attack,life*.5)+(vocal?0:.001);
 const off=vocal||patch.oneShot?Math.max(0,life-release):
  patch.followPitch===false?life-.01:Math.min(SAMPLE_REFERENCE_GATE,life-.01);
 return {life,attackEnd,fadeStart:Math.max(attackEnd,off),
  releaseMin:releaseParameter.min,releaseStep:releaseParameter.ui.step,
  releaseMovesStart:vocal||!!patch.oneShot};
}
// A low-level pair of test recordings demonstrates normalization versus
// preserving their different recorded levels, without claiming source PCM.
export function modeledRecordingLevels(patch){
 return [.12,.35].map(peak=>{
  const normalization=Math.min(5,Math.max(.5,.65/Math.max(.08,peak)));
  const gain=Math.min(2,.2*(patch.gain??.9)*.8*.7*(patch.preserveDynamics?3.5:normalization));
  return peak*gain;
 });
}
