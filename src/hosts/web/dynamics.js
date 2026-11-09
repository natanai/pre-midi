import {compileDynamics} from '../../dsp/dynamics.js';
const prepared=new WeakMap();
export function prepareDynamics(context,moduleURL=null){
 if(!context.audioWorklet)return Promise.resolve(false);
 if(!prepared.has(context)){
  const url=new URL('./dynamics-worklet.js',import.meta.url);url.search=new URL(import.meta.url).search;
  prepared.set(context,context.audioWorklet.addModule(moduleURL??url.href).then(()=>true).catch(error=>{prepared.delete(context);throw error;}));
 }
 return prepared.get(context);
}
export function connectPostDynamics(context,signal,patch,owner,start,end){
 const recipes=compileDynamics(patch);if(!recipes.length)return signal;
 if(!prepared.has(context)||typeof globalThis.AudioWorkletNode!=='function')throw Error('This audio host cannot run Sound dynamics; use native audio or a browser with AudioWorklet support.');
 const node=new AudioWorkletNode(context,'premidi-sound-dynamics',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{recipes,start,end}});
 owner.nodes.push(node);signal.connect(node);return node;
}

export function needsDynamics(value){
 if(!value||typeof value!=='object')return false;
 if(value.chain&&compileDynamics(value).length)return true;
 return ['patch','effects','instruments','sounds','beats','tracks','freeform','clips'].some(key=>Array.isArray(value[key])?value[key].some(needsDynamics):needsDynamics(value[key]));
}
