import {planPitch} from "./src/dsp/expression.js";
export {BEND_SHAPES,movementDefaults,movement,validateMovement,validateBend,bendSemitones,pitchCents} from "./src/dsp/expression.js";
export function schedulePitch(ctx,param,note,motion,start,duration,base=0,owner=null){
 return schedulePitchPlan(ctx,param,planPitch(note,motion,start,duration,base),owner);
}
export function schedulePitchPlan(ctx,param,plan,owner=null){
 const {start,duration,base}=plan,m=plan.movement;
 if(plan.values){
  if(duration>=.01)param.setValueCurveAtTime(new Float32Array(plan.values),start,duration);
  else param.setValueAtTime(plan.values[0],start);
 }else param.setValueAtTime(base,start);
 if(m.depth>0){
  const oscillator=ctx.createOscillator(),gain=ctx.createGain();
  oscillator.type="sine";oscillator.frequency.setValueAtTime(m.rate,start);
  gain.gain.setValueAtTime(0,start);
  const enter=start+Math.min(m.delay,Math.max(0,duration-.005));
  if(enter>start)gain.gain.setValueAtTime(0,enter);
  gain.gain.linearRampToValueAtTime(m.depth,Math.min(start+duration,enter+.13));
  gain.gain.setValueAtTime(m.depth,start+duration);
  gain.gain.linearRampToValueAtTime(0,start+duration+.02);
  oscillator.connect(gain);gain.connect(param);
  owner?.sources.push(oscillator);owner?.nodes.push(gain);
  oscillator.start(start);oscillator.stop(start+duration+.025);
  if(!owner)oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
}
export function scheduleMovementLfo(ctx,param,start,duration,rate,depth,owner=null){
 if(depth<=0)return;
 const oscillator=ctx.createOscillator(),gain=ctx.createGain();
 oscillator.type="sine";
 oscillator.frequency.setValueAtTime(rate,start);
 gain.gain.setValueAtTime(depth,start);
 oscillator.connect(gain);gain.connect(param);
 owner?.sources.push(oscillator);owner?.nodes.push(gain);
  oscillator.start(start);oscillator.stop(start+duration+.04);
 if(!owner)oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
