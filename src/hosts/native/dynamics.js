import {compileDynamics,DYNAMICS_KINDS} from '../../dsp/dynamics.js';
export function encodeDynamics(patch,u32,f64){
 const nodes=compileDynamics(patch);u32(nodes.length);
 for(const p of nodes){u32(DYNAMICS_KINDS.indexOf(p.kind));for(const key of ['threshold','ratio','knee','attack','release','makeup','range','hold','mix'])f64(p[key]);}
}
