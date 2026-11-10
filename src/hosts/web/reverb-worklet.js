import {ReverbKernel} from '../../dsp/reverb.js';
class Room extends AudioWorkletProcessor{
 constructor({processorOptions}){super();this.kernel=new ReverbKernel(processorOptions,sampleRate);}
 process(inputs,outputs){
  const source=inputs[0],out=outputs[0],kernel=this.kernel;
  for(let i=0;i<out[0].length;i++){kernel.tick(source[0]?.[i]??0,source[1]?.[i]??source[0]?.[i]??0);out[0][i]=kernel.left;out[1][i]=kernel.right;}
  return true;
 }
}
registerProcessor('premidi-room',Room);
