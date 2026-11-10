import {needsSourceProcessing} from '../../dsp/source-processing.js';
let worker=null,sequence=0;const pending=new Map(),cache=new WeakMap();
function run(channels,rate,recipe){
 if(typeof Worker!=='function')throw Error('This browser cannot prepare independent source processing; use the native host or a browser with module Workers');
 if(!worker){const url=new URL('./source-worker.js',import.meta.url);url.search=new URL(import.meta.url).search;worker=new Worker(url,{type:'module'});worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);data.error?task.reject(Error(data.error)):task.resolve(data.channels);};worker.onerror=e=>{for(const task of pending.values())task.reject(Error(e.message||'Source preparation failed'));pending.clear();worker?.terminate();worker=null;};}
 const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,channels,rate,recipe},channels.map(c=>c.buffer));});
}
export async function prepareSourceBuffer(context,decoded,id,request,{isCurrent=()=>true,process=run}={}){
 if(!needsSourceProcessing(request.recipe))return;
 const raw=decoded.get(id);if(!raw?.getChannelData)throw Error('Source audio is not decoded');
 let entries=cache.get(raw);if(!entries){entries=new Map();cache.set(raw,entries);}
 const key=request.key;
 if(!entries.has(key))entries.set(key,(async()=>{
  const p=request.recipe,first=Math.floor(p.start*raw.sampleRate+1e-7),end=Math.min(raw.length,Math.round((p.start+p.duration)*raw.sampleRate));
  if(first>=end)throw Error('Source region is empty');
  const channels=Array.from({length:raw.numberOfChannels},(_,c)=>raw.getChannelData(c).slice(first,end)),rendered=await process(channels,raw.sampleRate,p);
  const result=context.createBuffer(rendered.length,rendered[0].length,raw.sampleRate);rendered.forEach((c,i)=>result.getChannelData(i).set(c));return result;
 })().catch(error=>{entries.delete(key);throw error;}));
 const output=await entries.get(key);if(!isCurrent())throw Error('Source preparation cancelled');decoded.set(key,output);return output;
}
export function preparedSourceBuffer(decoded,id,request){
 if(!needsSourceProcessing(request.recipe))return decoded.get(id);
 const buffer=decoded.get(request.key);if(!buffer?.getChannelData)throw Error('Source processing is still preparing; try playback again');return buffer;
}
