import {getAsset,getAssetRevision} from './assetRegistry.js';
import {nativeEnabled} from './src/hosts/native/session.js';
import {decodeNativeAudio} from './src/hosts/native/capture.js';
let latestKey=null,latestPromise=null;
// The registry returns defensive byte copies. Cache by its revision token,
// retaining only the latest decoded asset and invalidating replaced audio.
export function decodeRecordedAsset(asset){
 const native=nativeEnabled(),key=asset.id+':'+getAssetRevision(asset.id)+':'+native;
 if(key!==latestKey){
  const bytes=getAsset(asset.id);if(!bytes)throw Error('Recording audio is unavailable');
  latestKey=key;latestPromise=(async()=>{
   if(native)return decodeNativeAudio(bytes,{mono:false});
   const context=new AudioContext();try{return await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}finally{await context.close();}
  })().catch(error=>{if(latestKey===key){latestKey=null;latestPromise=null;}throw error;});
 }
 return latestPromise;
}
