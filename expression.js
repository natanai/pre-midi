import {prepareSineLfo} from "./src/hosts/web/oscillator.js";
import {planPitch} from "./src/dsp/expression.js";
export {BEND_SHAPES,movementDefaults,movement,validateMovement,validateBend,bendSemitones,pitchCents} from "./src/dsp/expression.js";
export function schedulePitch(ctx,param,note,motion,start,duration,base=0,owner=null,options={}){
 return schedulePitchPlan(ctx,param,planPitch(note,motion,start,duration,base),owner,options);
}
export function schedulePitchPlan(ctx,param,plan,owner=null,{controlRate='a',precise=false}={}){
 const {start,duration,base}=plan,m=plan.movement;
 if(plan.values){
  if(controlRate==='k'){
   // A curve beginning within a quantum is shifted by the browser's k-rate
   // curve handler. Explicit linear segments preserve the canonical knot times.
   const warm=Math.floor(start*ctx.sampleRate/128)*128/ctx.sampleRate;
   param.value=plan.values[0];param.setValueAtTime(plan.values[0],warm);param.setValueAtTime(plan.values[0],start);
   for(let i=1;i<plan.values.length;i++)param.linearRampToValueAtTime(plan.values[i],start+i/(plan.values.length-1)*duration);
  }else if(duration>=.01)param.setValueCurveAtTime(new Float32Array(plan.values),start,duration);
  else param.setValueAtTime(plan.values[0],start);
 }else param.setValueAtTime(base,start);
 if(m.depth>0){
  const prepared=precise?prepareSineLfo(ctx,m.rate,start,start+duration+.025):{source:ctx.createOscillator(),sourceStart:start};
  const oscillator=prepared.source,gain=ctx.createGain();
  if(!precise){oscillator.type="sine";oscillator.frequency.value=m.rate;}
  if(precise)gain.gain.value=0;gain.gain.setValueAtTime(0,start);
  const enter=start+Math.min(m.delay,Math.max(0,duration-.005));
  if(enter>start)gain.gain.setValueAtTime(0,enter);
  gain.gain.linearRampToValueAtTime(m.depth,Math.min(start+duration,enter+.13));
  gain.gain.setValueAtTime(m.depth,start+duration);
  gain.gain.linearRampToValueAtTime(0,start+duration+.02);
  oscillator.connect(gain);gain.connect(param);
  owner?.sources.push(oscillator);owner?.nodes.push(gain);
  oscillator.start(prepared.sourceStart);oscillator.stop(start+duration+.025);
  if(!owner)oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
}
export function scheduleMovementLfo(ctx,param,start,duration,rate,depth,owner=null,{precise=false}={}){
 if(depth<=0)return;
 const prepared=precise?prepareSineLfo(ctx,rate,start,start+duration+.04):{source:ctx.createOscillator(),sourceStart:start};
 const oscillator=prepared.source,gain=ctx.createGain();
 if(!precise){oscillator.type="sine";oscillator.frequency.value=rate;}
 if(precise)gain.gain.value=0;gain.gain.setValueAtTime(depth,start);
 oscillator.connect(gain);gain.connect(param);
 owner?.sources.push(oscillator);owner?.nodes.push(gain);
  oscillator.start(prepared.sourceStart);oscillator.stop(start+duration+.04);
 if(!owner)oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
