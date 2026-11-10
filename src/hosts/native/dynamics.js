import {effectiveReverb,REVERB_KEYS} from '../../dsp/reverb.js';
import {compileDynamics,DYNAMICS_KINDS} from '../../dsp/dynamics.js';
export function encodeDynamics(patch,u32,f64){
 const nodes=compileDynamics(patch);u32(nodes.length);
 for(const p of nodes){u32(DYNAMICS_KINDS.indexOf(p.kind));for(const key of ['threshold','ratio','knee','attack','release','makeup','range','hold','mix'])f64(p[key]);if(p.kind==='deesser')for(const key of ['frequency','bandwidth','amount'])f64(p[key]);}
 const room=effectiveReverb(patch);for(const key of REVERB_KEYS)f64(room[key]);
}
