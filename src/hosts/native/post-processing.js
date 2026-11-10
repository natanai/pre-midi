import {effectiveReverb,REVERB_KEYS} from '../../dsp/reverb.js';
import {POST_PROCESSOR_KINDS,compilePostProcessing} from '../../dsp/post-processing.js';
export function encodePostProcessing(patch,u32,f64,recipes=compilePostProcessing(patch)){
 u32(recipes.length);
 for(const p of recipes){
  u32(POST_PROCESSOR_KINDS.indexOf(p.kind));
  if(POST_PROCESSOR_KINDS.indexOf(p.kind)>=4)for(const key of ['rate','depth','phase','stereo','feedback','delay','frequency','mix'])f64(p[key]);
  else {for(const key of ['threshold','ratio','knee','attack','release','makeup','range','hold','mix'])f64(p[key]);if(p.kind==='deesser')for(const key of ['frequency','bandwidth','amount'])f64(p[key]);}
 }
 const room=effectiveReverb(patch);for(const key of REVERB_KEYS)f64(room[key]);
}
