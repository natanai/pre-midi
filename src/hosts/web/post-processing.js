import {compilePostProcessing} from '../../dsp/post-processing.js';
const prepared=new WeakMap();
export function preparePostProcessing(context,moduleURL=null){
 if(!context.audioWorklet)return Promise.resolve(false);
 if(!prepared.has(context)){
  const url=new URL('./post-worklet.js',import.meta.url);url.search=new URL(import.meta.url).search;
  prepared.set(context,context.audioWorklet.addModule(moduleURL??url.href).then(()=>true).catch(error=>{prepared.delete(context);throw error;}));
 }
 return prepared.get(context);
}
export function connectPostProcessing(context,signal,patch,owner,start,end,{unit=.125,elapsed=0,recipes=compilePostProcessing(patch,unit)}={}){
 if(!recipes.length)return signal;
 if(!prepared.has(context)||typeof globalThis.AudioWorkletNode!=='function')throw Error('This audio host cannot run Sound processors; use native audio or a browser with AudioWorklet support.');
 const node=new AudioWorkletNode(context,'premidi-post-processing',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{recipes,start,end,elapsed}});
 owner.nodes.push(node);signal.connect(node);return node;
}

export function needsPostProcessing(value){
 if(!value||typeof value!=='object')return false;
 if(value.chain&&compilePostProcessing(value).length)return true;
 return ['patch','effects','instruments','sounds','beats','tracks','freeform','clips'].some(key=>Array.isArray(value[key])?value[key].some(needsPostProcessing):needsPostProcessing(value[key]));
}
