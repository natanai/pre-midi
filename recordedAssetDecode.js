import {getAsset} from './assetRegistry.js';
import {nativeEnabled} from './src/hosts/native/session.js';
import {decodeNativeAudio} from './src/hosts/native/capture.js';
let latestBytes=null,latestPromise=null;
// Immutable bytes own the decode cache; replacing an asset cannot reuse old PCM.
export function decodeRecordedAsset(asset){
 const bytes=getAsset(asset.id);if(!bytes)throw Error('Recording audio is unavailable');
 if(bytes!==latestBytes){latestBytes=bytes;latestPromise=(async()=>{
  if(nativeEnabled())return decodeNativeAudio(bytes,{mono:false});
  const context=new AudioContext();try{return await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}finally{await context.close();}
 })().catch(error=>{if(latestBytes===bytes){latestBytes=null;latestPromise=null;}throw error;});}
 return latestPromise;
}
