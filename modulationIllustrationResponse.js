// Read-only 48 kHz control-signal model. Use playback's source, polarity and
// one-pole recurrence, including its zero initial state. This is not audio PCM.
import {routeValueAt,smoothingAlpha} from "./src/dsp/modulation.js";

const cache=new Map();
export function modeledModulationTrace(route,{duration=1.25,points=240,
 sampleRate=48000,gate=1,velocity=.7,pitch=65}={}){
 const key=JSON.stringify([route,duration,points,sampleRate,gate,velocity,pitch]);
 if(cache.has(key))return cache.get(key);
 const raw=[],smoothed=[],times=[];
 const alpha=smoothingAlpha(route.smoothing??0,sampleRate);
 const frames=Math.round(duration*sampleRate);
 let state=0,point=0;
 for(let frame=0;frame<=frames;frame++){
  const elapsed=frame/sampleRate;
  const value=routeValueAt(route,{elapsed,gate,velocity,pitch});
  // Depth is constant, so smoothing the scaled signal is equivalent to
  // playback's smoothing-before-depth, including negative/bipolar routes.
  state=alpha*value+(1-alpha)*state;
  if(frame===Math.round(point*frames/(points-1))){
   raw.push(value);smoothed.push(state);times.push(elapsed);point++;
  }
 }
 const result={raw,smoothed,times};
 if(cache.size>=32)cache.delete(cache.keys().next().value);
 cache.set(key,result);
 return result;
}
