// Shared canonical plan encoder. Preparation only; never called on the audio thread.
import {validateAutomationPlan} from "../../dsp/automation.js";
import {validateModulation,MOD_TARGETS,MOD_SOURCES} from "../../dsp/modulation.js";
import {validatePatch} from "../../../synth.js";
export function encodeNativePlan(plan,sampleRate,frames){
 if(plan?.contract!=="pre-midi-synth-voice"||![1,2,3].includes(plan.version))throw Error("Native prototype supports synth voice contract v1/v2/v3 only");
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isInteger(frames)||frames<1||frames>sampleRate*12)throw Error("Invalid native render size");
 const p=plan.patch,errors=validatePatch(p);
 if(plan.version!==3&&plan.automation!==undefined)errors.push("Automation requires synth voice contract v3");
 if(plan.version===3)errors.push(...validateAutomationPlan(plan.automation));
 if(plan.version>=2)errors.push(...validateModulation(plan.modulation));
 else if(plan.modulation!==undefined)errors.push("Modulation requires contract v2");if(errors.length)throw Error(errors.join("; "));
 if(p.type!=="synth"||p.noise!==0||p.effects.drive!==0||p.effects.delayMix!==0||(p.filter.sweep??0)!==0||
  plan.movement.depth!==0||plan.movement.tone!==0||plan.movement.tremolo!==0)
  throw Error("Unsupported native profile: no noise/drive/delay/filter-sweep/legacy LFO modulation");
 if(plan.oscillators.some(osc=>osc.frequency*2**(Math.max(osc.detune,...(osc.pitch.values??[]))/1200)>=sampleRate/2))throw Error("Unsupported native pitch above Nyquist");
 const parts=[],u32=n=>{if(!Number.isInteger(n)||n<0||n>0xffffffff)throw Error("Invalid native integer");const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);parts.push(b);},f64=n=>{if(!Number.isFinite(n))throw Error("Nonfinite native parameter");const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,n,true);parts.push(b);};
 u32(0x344e4d50);u32(sampleRate);u32(frames);u32(plan.version);
 for(const n of [plan.start,plan.duration,plan.end,plan.graphEnd,p.pan,p.filter.cutoff,p.filter.resonance])f64(n);u32(["lowpass","highpass","bandpass","notch"].indexOf(p.filter.type));
 if(plan.oscillators.length!==2||plan.amplitude.events.length>6)throw Error("Unsupported native plan bounds");
 for(const osc of plan.oscillators){f64(Math.fround(osc.frequency));f64(Math.fround(osc.level));f64(Math.fround(osc.detune));u32(["sine","triangle","square","sawtooth","harmonic"].indexOf(osc.wave));(osc.harmonics??Array(32).fill(0)).forEach(f64);const values=osc.pitch.values??[];if(values.length>600)throw Error("Native pitch curve too long");u32(values.length);values.forEach(f64);}
 f64(plan.off);f64(plan.expression.pitch);f64(plan.expression.velocity);
 const routes=[...(plan.modulation?.routes??[])].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);u32(routes.length);
 const targets=MOD_TARGETS.map(target=>target.id);
 for(const route of routes){u32(targets.indexOf(route.target));u32(MOD_SOURCES.indexOf(route.source.kind));u32(route.polarity==="bipolar"?1:0);
  for(const value of [route.depth,route.smoothing,route.source.rate??.5,route.source.root??60,route.source.span??24,...["attack","decay","sustain","release"].map((key,index)=>route.source.envelope?.[key]??[.8,.5,.5,.5][index])])f64(value);}
 const points=plan.automation?.points??[];u32(points.length);for(const point of points){f64(point.time);f64(Math.fround(point.value));}
 u32(plan.amplitude.events.length);for(const event of plan.amplitude.events){if(!["set","linear"].includes(event.kind))throw Error("Unknown envelope event");u32(event.kind==="set"?0:1);f64(event.time);f64(Math.fround(event.value));}
 const output=new Uint8Array(parts.reduce((sum,b)=>sum+b.length,0));let offset=0;for(const b of parts){output.set(b,offset);offset+=b.length;}return output;
}
