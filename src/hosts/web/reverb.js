import {effectiveReverb} from '../../dsp/reverb.js';
const prepared=new WeakMap();
export function needsReverb(value){
 if(!value||typeof value!=='object')return false;
 if(effectiveReverb(value).mix>0)return true;
 return ['patch','effects','instruments','sounds','beats','tracks','freeform','clips'].some(key=>Array.isArray(value[key])?value[key].some(needsReverb):needsReverb(value[key]));
}
export function prepareReverb(context){
 if(!context.audioWorklet)return Promise.resolve(false);
 if(!prepared.has(context)){
  const url=new URL('./reverb-worklet.js',import.meta.url);url.search=new URL(import.meta.url).search;
  prepared.set(context,context.audioWorklet.addModule(url.href).then(()=>true).catch(error=>{prepared.delete(context);throw error;}));
 }
 return prepared.get(context);
}
export function createReverb(context,room){
 if(!prepared.has(context)||typeof AudioWorkletNode!=='function')throw Error('This audio host cannot run reverb; use native audio or a browser with AudioWorklet support.');
 return new AudioWorkletNode(context,'premidi-room',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:room});
}
