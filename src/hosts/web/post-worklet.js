import {PostAutomationCursor} from '../../dsp/processor-automation.js';
import {PostModulationCursor} from '../../dsp/post-modulation.js';
import {DynamicsKernel} from '../../dsp/dynamics-kernel.js';
import {ModEffectKernel,MOD_EFFECT_KINDS} from '../../dsp/modulation-effects.js';
class SoundPostProcessing extends AudioWorkletProcessor {
 constructor({processorOptions:{recipes,start,end,elapsed=0,automation=[],modulation,off=end,clockStart=0,expression,measure=false}}){
  super();
  this.onset=start;
  this.elapsed=elapsed;
  this.kernels=recipes.map(recipe=>MOD_EFFECT_KINDS.includes(recipe.kind)?
   new ModEffectKernel(recipe,sampleRate):new DynamicsKernel(recipe,sampleRate));
  this.automation=recipes.map(recipe=>new PostAutomationCursor(automation,recipe.id));
  this.modulation=recipes.map(recipe=>new PostModulationCursor(modulation,recipe,{start,end,off,elapsed,clockStart,expression},sampleRate));
  this.baseMix=recipes.map(recipe=>recipe.mix);
  this.levels=measure?new Float64Array(recipes.length):null;
  this.measurement=measure?{type:'post_levels',levels:this.levels}:null;
  this.sent=false;
  this.frame=new Float32Array(2);
  this.start=Math.ceil(start*sampleRate-1e-9);
  this.end=Math.ceil(end*sampleRate-1e-9);
 }
 process(inputs,outputs){
  const input=inputs[0],output=outputs[0];
  if(currentFrame>=this.end){
   if(this.measurement&&!this.sent){this.port.postMessage(this.measurement);this.sent=true;}
   return false;
  }
  for(let i=0;i<output[0].length;i++){
   let left=input[0]?.[i]??0,right=input[1]?.[i]??left;
   if(currentFrame+i>=this.start&&currentFrame+i<this.end){
    this.frame[0]=left;this.frame[1]=right;
    const time=(currentFrame+i)/sampleRate;
    for(let n=0;n<this.kernels.length;n++){
     const kernel=this.kernels[n];
     if(kernel.p.automationMask){
      this.modulation[n].reset(kernel.p);
      kernel.p.mix=this.baseMix[n];
      const enabled=this.automation[n].apply(kernel.p,time,sampleRate);
      this.modulation[n].apply(kernel.p,time);
      kernel.p.mix*=enabled;
      kernel.updateParameters?.();
     }
     kernel.process(this.frame,Math.max(0,time-this.onset+this.elapsed));
     if(this.levels&&kernel.gainReductionDb)this.levels[n]=Math.max(this.levels[n],kernel.gainReductionDb());
    }
    left=this.frame[0];right=this.frame[1];
   }
   output[0][i]=left;if(output[1])output[1][i]=right;
  }
  if(this.measurement&&!this.sent&&currentFrame+output[0].length>=this.end){
   this.port.postMessage(this.measurement);
   this.sent=true;
  }
  return true;
 }
}
registerProcessor('premidi-post-processing',SoundPostProcessing);
