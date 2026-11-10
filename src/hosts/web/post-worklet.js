import {DynamicsKernel} from '../../dsp/dynamics-kernel.js';
import {ModEffectKernel,MOD_EFFECT_KINDS} from '../../dsp/modulation-effects.js';
class SoundPostProcessing extends AudioWorkletProcessor {
 constructor({processorOptions:{recipes,start,end,elapsed=0}}){
  super();this.onset=start;this.elapsed=elapsed;this.kernels=recipes.map(recipe=>MOD_EFFECT_KINDS.includes(recipe.kind)?new ModEffectKernel(recipe,sampleRate):new DynamicsKernel(recipe,sampleRate));this.frame=new Float32Array(2);this.start=Math.ceil(start*sampleRate-1e-9);this.end=Math.ceil(end*sampleRate-1e-9);
 }
 process(inputs,outputs){
  const input=inputs[0],output=outputs[0];
  if(currentFrame>=this.end)return false;
  for(let i=0;i<output[0].length;i++){
   let left=input[0]?.[i]??0,right=input[1]?.[i]??left;
   if(currentFrame+i>=this.start&&currentFrame+i<this.end){
    this.frame[0]=left;this.frame[1]=right;
    for(const kernel of this.kernels)kernel.process(this.frame,Math.max(0,(currentFrame+i)/sampleRate-this.onset+this.elapsed));
    left=this.frame[0];right=this.frame[1];
   }
   output[0][i]=left;if(output[1])output[1][i]=right;
  }
  return true;
 }
}
registerProcessor('premidi-post-processing',SoundPostProcessing);
