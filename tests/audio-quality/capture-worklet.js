// Qualification-only graph capture, not an application DSP backend.
class Capture extends AudioWorkletProcessor{
 constructor(options){super();this.first=options.processorOptions.first;this.data=new Float32Array(options.processorOptions.length);}
 process(inputs,outputs){
  const input=inputs[0]?.[0],output=outputs[0]?.[0];if(output&&input)output.set(input);
  for(let i=0;i<128;i++){
   const index=currentFrame+i-this.first;
   if(index>=0&&index<this.data.length)this.data[index]=input?.[i]??0;
  }
  if(currentFrame+128>=this.first+this.data.length){this.port.postMessage(this.data,[this.data.buffer]);return false;}
  return true;
 }
}
registerProcessor("premidi-qualification-capture",Capture);
