import {DynamicsKernel} from '../../dsp/dynamics-kernel.js';
class SoundDynamics extends AudioWorkletProcessor {
 constructor({processorOptions:{recipes,start,end}}){
  super();this.kernels=recipes.map(recipe=>new DynamicsKernel(recipe,sampleRate));this.start=Math.ceil(start*sampleRate-1e-9);this.end=Math.ceil(end*sampleRate-1e-9);
 }
 process(inputs,outputs){
  const input=inputs[0],output=outputs[0];
  if(currentFrame>=this.end)return false;
  for(let i=0;i<output[0].length;i++){
   let left=input[0]?.[i]??0,right=input[1]?.[i]??left;
   if(currentFrame+i>=this.start&&currentFrame+i<this.end)for(const kernel of this.kernels){
    const gain=kernel.gain(Math.max(Math.abs(left),Math.abs(right)));left=Math.fround(left*gain);right=Math.fround(right*gain);
   }
   output[0][i]=left;if(output[1])output[1][i]=right;
  }
  return true;
 }
}
registerProcessor('premidi-sound-dynamics',SoundDynamics);
