import {prepareControlLfo,startControlLfo} from "./src/hosts/web/oscillator.js";
import {planPitch,pitchPlanValueAt,pitchPlanPoints,vibratoGainAt} from "./src/dsp/expression.js";
export {BEND_SHAPES,movementDefaults,movement,validateMovement,validateBend,bendSemitones,pitchCents} from "./src/dsp/expression.js";
export function schedulePitch(ctx,param,note,motion,start,duration,base=0,owner=null,options={}){
 return schedulePitchPlan(ctx,param,planPitch(note,motion,start,duration,base),owner,options);
}
export function schedulePitchPlan(ctx,param,plan,owner=null,{controlRate='a',precise=false}={}){
 const {start,duration,base}=plan,m=plan.movement,elapsed=plan.elapsed??0,totalDuration=plan.totalDuration??duration;
 if(plan.values){
  if(controlRate==='k'){
   // A curve beginning within a quantum is shifted by the browser's k-rate
   // curve handler. Explicit linear segments preserve the canonical knot times.
   const warm=Math.max(ctx.currentTime??0,Math.floor(start*ctx.sampleRate/128)*128/ctx.sampleRate);
   const value=pitchPlanValueAt(plan,elapsed+warm-start);
   param.value=value;param.setValueAtTime(value,warm);
   for(const [i,point] of pitchPlanPoints(plan).entries())param[i?"linearRampToValueAtTime":"setValueAtTime"](point.value,point.time);
  }else if(elapsed>0){
   for(const [i,point] of pitchPlanPoints(plan).entries())param[i?"linearRampToValueAtTime":"setValueAtTime"](point.value,point.time);
  }else if(duration>=.01)param.setValueCurveAtTime(new Float32Array(plan.values),start,duration);
  else param.setValueAtTime(plan.values[0],start);
 }else param.setValueAtTime(base,start);
 if(m.depth>0){
  const warm=controlRate==='k'&&elapsed>0?Math.max(ctx.currentTime??0,Math.floor(start*ctx.sampleRate/128)*128/ctx.sampleRate):start;
  const lfoStart=elapsed+warm-start>=0?warm:start,lfoAge=elapsed+lfoStart-start;
  const prepared=prepareControlLfo(ctx,m.rate,lfoStart,{precise,elapsed:lfoAge});
  const oscillator=prepared.source,gain=ctx.createGain();
  const enter=Math.min(m.delay,Math.max(0,totalDuration-.005)),rampEnd=Math.min(totalDuration,enter+.13);
  const initial=m.depth*vibratoGainAt(plan,lfoAge);
  if(precise)gain.gain.value=0;gain.gain.setValueAtTime(initial,lfoStart);
  if(enter>lfoAge)gain.gain.setValueAtTime(0,start+enter-elapsed);
  if(rampEnd>lfoAge)gain.gain.linearRampToValueAtTime(m.depth,start+rampEnd-elapsed);
  gain.gain.setValueAtTime(m.depth,start+duration);
  gain.gain.linearRampToValueAtTime(0,start+duration+.02);
  oscillator.connect(gain);gain.connect(param);
  owner?.sources.push(oscillator);owner?.nodes.push(gain);
  startControlLfo(prepared);oscillator.stop(start+duration+.025);
  if(!owner)oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
}
export function scheduleMovementLfo(ctx,param,start,duration,rate,depth,owner=null,{precise=false,elapsed=0}={}){
 if(depth<=0)return;
 const prepared=prepareControlLfo(ctx,rate,start,{precise,elapsed});
 const oscillator=prepared.source,gain=ctx.createGain();
 if(precise)gain.gain.value=0;gain.gain.setValueAtTime(depth,start);
 oscillator.connect(gain);gain.connect(param);
 owner?.sources.push(oscillator);owner?.nodes.push(gain);
  startControlLfo(prepared);oscillator.stop(start+duration+.04);
 if(!owner)oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
