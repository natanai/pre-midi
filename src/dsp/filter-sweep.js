import {parameterFor,clampParameterValue} from "./parameters.js";
export function planFilterSweep(filter,start,duration,context="synth"){
 const cutoff=filter?.cutoff??parameterFor("filter.cutoff",context).default;
 const sweep=filter?.sweep??parameterFor("filter.sweep",context).default;
 const seconds=Math.min(duration,filter?.sweepTime??parameterFor("filter.sweepTime",context).default);
 return {startCutoff:clampParameterValue("filter.cutoff",cutoff*2**sweep,context),sweepEnd:start+seconds,sweepDuration:seconds};
}
export const filterSweepRatioAt=(plan,cutoff,elapsed)=>
 (plan.startCutoff/cutoff)**(1-Math.max(0,Math.min(1,elapsed/Math.max(1e-9,plan.sweepDuration))));
