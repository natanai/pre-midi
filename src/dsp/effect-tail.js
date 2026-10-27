// Conservative -100 dBFS tail bound for a full-scale input into the existing
// linear send (.55), wet (.8) and feedback loop. No browser clock or AudioNode.
export const TAIL_FLOOR=.00001;
export function delayTailSeconds(effects,floor=TAIL_FLOOR){
 const {delayMix:mix,delayTime:time,delayFeedback:feedback}=effects;
 if(!(mix>0))return 0;
 const level=mix*.55*.8;
 const repeats=feedback>0?Math.max(0,Math.ceil(Math.log(floor/level)/Math.log(feedback))):0;
 return (1+repeats)*time+.02;
}
