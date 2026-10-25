import {analyzeSound,patchFromAnalysis,audioSignature,signatureDistance} from "./soundAnalysis.js";
import {renderSynthBuffer} from "./audio.js";
import {patchCopy} from "./synth.js";
import {encodeMonoWav} from "./recording.js";
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const check=signal=>{if(signal?.aborted)throw new DOMException("Conversion cancelled.","AbortError");};
export async function convertToSynth(values,sampleRate,{kind="note",root,signal,onProgress=()=>{}}={}){
 check(signal);onProgress("Analyzing sound",0);
 await new Promise(resolve=>setTimeout(resolve,0));check(signal);
 const analysis=analyzeSound(values,sampleRate,{kind,root});
 let best=patchFromAnalysis(analysis),bestError=Infinity,evaluations=0;
 async function evaluate(patch){
  check(signal);
  const gate=kind==="hit"?Math.max(.015,patch.envelope.attack+patch.envelope.decay):analysis.hold;
  if(gate>4)return Infinity;
  const buffer=await renderSynthBuffer(patch,analysis.referencePitch,gate,{sampleRate:analysis.rate,seconds:analysis.seconds});
  check(signal);
  const error=signatureDistance(analysis.signature,audioSignature(buffer.getChannelData(0),analysis.rate));
  evaluations++;
  if(error<bestError){best=patch;bestError=error;}
  onProgress("Matching synth controls",Math.min(.94,evaluations/48));
  await new Promise(resolve=>setTimeout(resolve,0));
  return error;
 }
 const initialError=await evaluate(best);
 async function tryValues(path,values){
  for(const value of values){
   const patch=patchCopy(best);let owner=patch;
   for(let i=0;i<path.length-1;i++)owner=owner[path[i]];
   owner[path[path.length-1]]=value;
   await evaluate(patch);
  }
 }
 // A bounded, deterministic search needs neither a server nor a trained model.
 await tryValues(["filter","cutoff"],[1200,3000,6500,10000,14000]);
 await tryValues(["noise"],[0,clamp(analysis.noise*.6,0,1),clamp(analysis.noise*1.5,0,1)]);
 // Explicitly fit tone changes and noisy attacks, rather than only one timbre.
 if(!analysis.pureNoise){
  await tryValues(["filter","sweep"],[0,-2,2,analysis.filterSweep,
   clamp(analysis.filterSweep*1.6,-5,5)]);
  if(Math.abs(best.filter.sweep??0)>.01)
   await tryValues(["filter","sweepTime"],[.08,.26,.65]);
 }
 if(analysis.noise>.1)await tryValues(["noiseDecay"],[0,.07,.22,.7]);
 for(const tilt of [-.45,-.2,.2,.45]){
  const patch=patchCopy(best),partials=analysis.partials.map((value,i)=>value*(i+1)**tilt),maximum=Math.max(...partials,1e-9);
  patch.oscillators[0].harmonics=partials.map(value=>value/maximum);
  await evaluate(patch);
 }
 for(let pass=0;pass<2;pass++){
  const factor=pass===0?.5:.22;
  for(const [field,min,max] of [["attack",0,3],["decay",0,3],["release",.01,4]]){
   const value=best.envelope[field],span=Math.max(.012,value*factor);
   await tryValues(["envelope",field],[clamp(value-span,min,max),clamp(value+span,min,max)]);
  }
  const sustain=best.envelope.sustain;
  await tryValues(["envelope","sustain"],[clamp(sustain-factor*.4,0,1),clamp(sustain+factor*.4,0,1)]);
 }
 await tryValues(["movement","depth"],[0,clamp((analysis.movement?.depth||0)*.7,0,100)]);
 await tryValues(["effects","drive"],[.07,.18]);
 check(signal);onProgress("Preparing synth preview",.97);
 const hold=kind==="hit"?Math.max(.015,best.envelope.attack+best.envelope.decay):analysis.hold;
 const buffer=await renderSynthBuffer(best,analysis.referencePitch,hold,{sampleRate:44100,seconds:analysis.seconds});
 check(signal);
 const preview=new Blob([encodeMonoWav(buffer.getChannelData(0))],{type:"audio/wav"});
 onProgress("Synth ready",1);
 return {patch:best,name:analysis.name,trigger:kind==="hit"?"hit":"pitched",referencePitch:analysis.referencePitch,
  preview,seconds:analysis.seconds,hold,error:bestError,initialError,evaluations,
  pitchDetected:analysis.detected};
}
