import {nativeRequest,ensureNativeOutput} from './session.js';
const binary=value=>value instanceof ArrayBuffer?value:Uint8Array.from(value).buffer;
export async function decodeNativeAudio(bytes,{rate=44100,mono=true,maxSeconds=301}={}){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const raw=binary(await globalThis.__TAURI__.core.invoke('native_decode',{request:{data:Array.from(data),rate,mono,max_seconds:maxSeconds}}));
 const view=new DataView(raw),sampleRate=view.getUint32(0,true),channels=view.getUint32(4,true),frames=view.getUint32(8,true);
 if(raw.byteLength!==16+frames*channels*4||sampleRate!==rate||channels<1||channels>32)throw Error('Invalid native decoded audio response');
 const pcm=new Float32Array(raw,16),planes=Array.from({length:channels},(_,ch)=>Float32Array.from({length:frames},(_,i)=>pcm[i*channels+ch]));
 return {sampleRate,numberOfChannels:channels,length:frames,duration:frames/sampleRate,getChannelData:ch=>planes[ch]};
}
export async function prepareNativeTake({seconds=300,synchronized=true}={}){
 await ensureNativeOutput();
 const offset=Number(localStorage.getItem('premidi-recording-offset-ms')||0);
 if(!Number.isFinite(offset)||offset<0||offset>500)throw Error('Choose a recording offset from 0 to 500 ms in Settings');
 const status=await nativeRequest({action:'capture_prepare',seconds,offset_ms:offset,synchronized}),owner=status.captureOwner;
 let done=false,begun=false,timer,polling=false;
 return {
  captureOwner:owner,
  begin({onLimit=()=>{}}={}){
   if(done||begun)throw Error('Microphone take cannot start twice');begun=true;
   timer=setInterval(async()=>{if(done||polling)return;polling=true;try{
    const info=await nativeRequest({action:'status'});if(done)return;
    if(info.captureOwner!==owner||info.deviceLost||info.capture?.phase===3){clearInterval(timer);onLimit();}
   }catch(error){clearInterval(timer);onLimit(error);}finally{polling=false;}},60);
  },
  async start(leadSeconds=0){if(done)throw Error('Native microphone take was cancelled');return nativeRequest({action:'capture_start',owner,lead_seconds:leadSeconds});},
  async finish(){
   if(done)return null;done=true;clearInterval(timer);
   const raw=binary(await globalThis.__TAURI__.core.invoke('native_capture_finish',{owner})),bytes=new Uint8Array(raw),view=new DataView(raw);
   if(bytes.length<44||String.fromCharCode(...bytes.subarray(0,4))!=='RIFF')throw Error('Invalid native microphone WAV');
   const rate=view.getUint32(24,true),channels=view.getUint16(22,true),size=view.getUint32(40,true);
   if(!rate||channels!==1||size+44!==bytes.length)throw Error('Invalid native microphone timing');
   return {mime:'audio/wav',bytes,durationSeconds:size/(rate*2),trimSeconds:0};
  },
  cancel(){if(done)return Promise.resolve();done=true;clearInterval(timer);return nativeRequest({action:'capture_cancel',owner}).catch(error=>console.warn('Native microphone cancel:',error));}
 };
}
