import {createStereoDelay} from './stereo.js';
import {createReverb} from './reverb.js';
// One parallel wet bus per complete recipe. Neither effect feeds the other.
// The final gain is the common audio-time transport/retirement gate.
export function createEffectsBus(context,effects,destination){
 const input=context.createGain(),wet=context.createGain(),nodes=[input,wet];wet.connect(destination);
 if(effects.delayMix>0){const graph=createStereoDelay(context,effects,wet);nodes.push(...graph.nodes);input.connect(graph.input);}
 if(effects.reverb?.mix>0){const room=createReverb(context,effects.reverb);nodes.push(room);input.connect(room);room.connect(wet);}
 return {input,wet,nodes,level:1};
}
