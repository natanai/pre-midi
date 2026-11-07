// Read-only pitch-control lesson. A 4.5 s held note includes the entire 3 s
// vibrato waiting range and 3 s glide range, followed by visible movement.
import {pitchCents,movement} from "./src/dsp/expression.js";
export const MOVEMENT_ILLUSTRATION_SECONDS=4.5;
export function modeledVibrato(patch,seconds,duration=MOVEMENT_ILLUSTRATION_SECONDS){
 const m=movement(patch),enter=Math.min(m.delay,Math.max(0,duration-.005));
 const fade=Math.max(0,Math.min(1,(seconds-enter)/.13));
 return m.depth*fade*Math.sin(seconds*2*Math.PI*m.rate);
}
export const modeledPitch=(patch,seconds)=>pitchCents({bend:patch.bend},movement(patch),
 seconds,MOVEMENT_ILLUSTRATION_SECONDS)+modeledVibrato(patch,seconds);
