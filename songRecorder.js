// Song's continuous microphone capture. The short Sound sampler recorder is separate.
import {MAX_VOCAL_SECONDS} from "./songModel.js";
import {MAX_RECORDING_BYTES} from "./assetRegistry.js";
import {preferredRecordingMime,normalizeRecordingMime} from "./recordingAssets.js";
import {nativeEnabled} from './src/hosts/native/session.js';
import {prepareNativeTake,decodeNativeAudio} from './src/hosts/native/capture.js';
const closeStream=stream=>stream?.getTracks().forEach(track=>track.stop());
export async function prepareSongTake(){
 if(nativeEnabled())return prepareNativeTake();
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")
  throw Error("Microphone recording is unavailable in this browser.");
 const mime=preferredRecordingMime();
 if(!mime)throw Error("This browser cannot capture WebM, MP4 or OGG audio.");
 const stream=await navigator.mediaDevices.getUserMedia({
  audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false
 });
 let recorder;
 try{recorder=new MediaRecorder(stream,{mimeType:mime});}
 catch(error){closeStream(stream);throw error;}
 const chunks=[];
 let begun=false,done=false,beginMs=0,trimSeconds=0,timeLimit=null;
 let resolveFinished,rejectFinished;
 const finished=new Promise((resolve,reject)=>{resolveFinished=resolve;rejectFinished=reject;});
 // A rejection may arrive after cancellation; preserve it for the caller.
 void finished.catch(()=>{});
 recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
 recorder.onerror=event=>rejectFinished(event.error||Error("Microphone recording failed."));
 recorder.onstop=()=>resolveFinished(new Blob(chunks,{type:recorder.mimeType||mime}));
 return {
  begin({context,startTime,onLimit}){
   if(done||begun)throw Error("Microphone take cannot start twice.");
   trimSeconds=Math.max(0,startTime-context.currentTime);
   recorder.start(250);
   begun=true;beginMs=performance.now();
   timeLimit=setTimeout(()=>onLimit?.(),MAX_VOCAL_SECONDS*1000);
  },
  async finish(){
   if(done)return null;
   done=true;clearTimeout(timeLimit);
   if(!begun){closeStream(stream);return null;}
   const durationSeconds=Math.max(.01,(performance.now()-beginMs)/1000);
   try{
    if(recorder.state!=="inactive")recorder.stop();
    const blob=await finished;
    if(blob.size>MAX_RECORDING_BYTES)throw Error("Recording exceeds 48 MB. Shorten the take.");
    const bytes=new Uint8Array(await blob.arrayBuffer());
    return {
     mime:normalizeRecordingMime(recorder.mimeType||blob.type),
     bytes,
     durationSeconds:Math.min(durationSeconds,MAX_VOCAL_SECONDS+.4),
     trimSeconds:Math.min(trimSeconds,durationSeconds*.8)
    };
   }finally{closeStream(stream);}
  },
  cancel(){
   if(done)return;
   done=true;clearTimeout(timeLimit);
   if(recorder.state!=="inactive")try{recorder.stop();}catch{}
   closeStream(stream);
  }
 };
}

export function waveformPeaks(buffer,bins=96){
 if(!buffer||!buffer.numberOfChannels||!buffer.length)return [];
 const result=[];
 for(let b=0;b<bins;b++){
  const start=Math.floor(b*buffer.length/bins),end=Math.max(start+1,Math.floor((b+1)*buffer.length/bins));
  let peak=0;
  const stride=Math.max(1,Math.floor((end-start)/160));
  for(let c=0;c<buffer.numberOfChannels;c++){
   const values=buffer.getChannelData(c);
   for(let i=start;i<end;i+=stride)peak=Math.max(peak,Math.abs(values[i]||0));
  }
  result.push(Math.round(Math.min(1,peak)*100)/100);
 }
 return result;
}
export async function waveformForTake(bytes){
 if(nativeEnabled())return waveformPeaks(await decodeNativeAudio(bytes,{mono:false}));
 const ctx=new AudioContext();
 try{
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  return waveformPeaks(await ctx.decodeAudioData(buffer));
 }finally{await ctx.close();}
}

export async function songCountIn(bpm,bars,{signal,onBeat=()=>{}}={}){
 if(![0,1,2].includes(bars))throw Error("Count-in must be none, one, or two bars.");
 if(!bars)return;
 if(!Number.isFinite(bpm)||bpm<=0)throw Error("Invalid Song tempo.");
 const beatMs=60000/bpm;
 let context=null;
 try{
  if(typeof AudioContext!=="undefined"){
   try{
    context=new AudioContext();
    void context.resume().catch(()=>{});
   }catch{context=null;}
  }
  for(let index=0;index<bars*4;index++){
   if(signal?.aborted)throw new DOMException("Cancelled","AbortError");
   const remaining=bars*4-index;
   onBeat({remaining,beat:index%4+1,bar:Math.floor(index/4)+1});
   if(context?.state==="running"){
    const t=context.currentTime+.01,osc=context.createOscillator(),gain=context.createGain();
    osc.frequency.setValueAtTime(index%4===0?880:660,t);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(.08,t+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.08);
    osc.connect(gain);gain.connect(context.destination);
    osc.start(t);osc.stop(t+.085);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
   }
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},beatMs);
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);
     reject(new DOMException("Cancelled","AbortError"));};
    signal?.addEventListener("abort",abort,{once:true});
   });
  }
 }finally{if(context)void context.close().catch(()=>{});}
}
