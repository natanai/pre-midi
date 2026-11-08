// Conservative -100 dBFS tail bound for a full-scale input into the existing
// linear send (.55), wet (.8) and feedback loop. No browser clock or AudioNode.
export const TAIL_FLOOR=.00001;
export function delayTailSeconds(effects,floor=TAIL_FLOOR){
 const {delayMix:mix,delayTime:time,delayFeedback:feedback}=effects;
 if(!(mix>0)||effects.chain?.bypass.includes("delay"))return 0;
 const level=mix*.55*.8;
 const repeats=feedback>0?Math.max(0,Math.ceil(Math.log(floor/level)/Math.log(feedback))):0;
 // Reserve a render quantum per repeat at the minimum supported 8 kHz rate
 // and conservative low-pass decay headroom, independent of the host clock.
 return (1+repeats)*(time+((effects.delayTone??20000)<20000?.12:0))+repeats*.016+.02;
}
