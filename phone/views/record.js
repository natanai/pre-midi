// Phone short sample recording/import. Produces the same 44.1kHz mono WAV
// sample Assets as desktop. No recorder or microphone stream survives closing.
import {RECORDER_DURATIONS,RECORDING_RATE,encodeMonoWav,monoFromAudioBlob,
 recordingExcerpt,estimatePitch,describeRecording,pitchLabel} from "../../recording.js";
import {movementDefaults} from "../../expression.js";

// Matches the canonical sampler patch schema; references separately saved WAV bytes.
export function authoredSamplePatch(asset,{root=60,followPitch=true}={}){
 if(!asset?.id||!Number.isInteger(root)||root<36||root>96)throw Error("Invalid recorded note.");
 return {type:"sample",presetId:"custom",zones:[{assetId:asset.id,root}],
  followPitch,oneShot:!followPitch,transpose:0,gain:.9,attack:.005,release:.17,
  pan:0,strumMs:0,preserveDynamics:false,movement:{...movementDefaults},
  bend:{shape:"straight",amount:2,rate:4}};
}
const STOP=Symbol("Cancelled capture");
const chooseMime=()=>["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"]
 .find(value=>globalThis.MediaRecorder?.isTypeSupported?.(value))||null;
const element=(tag,label)=>{const result=document.createElement(tag);if(label)result.className=label;return result;};
export function createPhoneSampleRecorder({dialog,output,onUse,onError}){
 const $=selector=>dialog.querySelector(selector);
 let activeStream=null,activeRecorder=null,token=0,clip=null,previewUrl=null,recording=false;
 function info(message,isError=false){output.textContent=message;output.dataset.error=String(isError);}
 function stopStream(){
  if(activeRecorder&&activeRecorder.state!=="inactive")try{activeRecorder.stop();}catch{}
  activeRecorder=null;
  activeStream?.getTracks().forEach(track=>track.stop());activeStream=null;
  recording=false;$("[data-record]").disabled=false;
 }
 function revoke(){
  if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;
  const audio=$("[data-preview]");audio.pause();audio.removeAttribute("src");audio.load();
 }
 function close(){token++;stopStream();revoke();clip=null;dialog.close();}
 async function load(values,name){
  clip={values,name,pitch:estimatePitch(values,RECORDING_RATE),quality:describeRecording(values)};
  const wav=encodeMonoWav(values),preview=new Blob([wav],{type:"audio/wav"});
  revoke();previewUrl=URL.createObjectURL(preview);$("[data-preview]").src=previewUrl;
  $("[data-name]").value=name.slice(0,60);
  if(clip.pitch&&clip.pitch.midi>=36&&clip.pitch.midi<=96)$("[data-pitch]").value=String(clip.pitch.midi);
  $("[data-use]").disabled=false;
  info("ready · "+(values.length/RECORDING_RATE).toFixed(2)+"s · "+(clip.pitch?
   "pitch estimate "+pitchLabel(clip.pitch.midi):"choose a pitch"));
 }
 async function importWav(file){
  if(!file)return;
  const issued=++token;stopStream();$("[data-use]").disabled=true;
  try{
   if(!/\.wav$/i.test(file.name))throw Error("Choose a WAV file.");
   const mono=await monoFromAudioBlob(file);
   if(issued!==token)return;
   // Audio import uses a deliberate first-4s excerpt; never silently
   // store the full file as a one-step sample.
   const duration=Math.min(4,mono.length/RECORDING_RATE);
   const values=recordingExcerpt(mono,0,duration);
   await load(values,file.name.replace(/\.wav$/i,""));
  }catch(error){if(issued===token)info(error.message,true);}
 }
 async function record(){
  if(recording)return;
  const duration=Number($("[data-length]").value);
  if(!RECORDER_DURATIONS.includes(duration))return info("invalid duration",true);
  if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder)
   return info("microphone unavailable · import a WAV instead",true);
  const issued=++token;$("[data-use]").disabled=true;recording=true;$("[data-record]").disabled=true;
  const mime=chooseMime(),chunks=[];
  let localStream=null,localRecorder=null;
  try{
   info("requesting microphone permission…");
   localStream=await navigator.mediaDevices.getUserMedia({
    audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false
   });
   if(issued!==token)throw STOP;
   activeStream=localStream;
   localRecorder=new MediaRecorder(localStream,mime?{mimeType:mime}:undefined);
   activeRecorder=localRecorder;
   const recorder=localRecorder;
   const complete=new Promise((resolve,reject)=>{
    recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
    recorder.onerror=event=>reject(event.error||Error("microphone capture failed"));
    recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||mime||"audio/mp4"}));
   });
   void complete.catch(()=>{});
   recorder.start();
   info("recording…");
   await new Promise(resolve=>setTimeout(resolve,Math.round(duration*1000)));
   if(issued!==token)throw STOP;
   recorder.stop();
   const blob=await complete;
   stopStream();
   if(issued!==token)throw STOP;
   const pcm=await monoFromAudioBlob(blob);
   if(issued!==token)throw STOP;
   await load(recordingExcerpt(pcm,0,Math.min(duration,pcm.length/RECORDING_RATE)),
    $("[data-kind]").value==="hit"?"My hit":"My note");
  }catch(error){if(issued===token&&error!==STOP)info(error.name==="NotAllowedError"?
   "microphone permission denied":error.message,true);}
  finally{
   localStream?.getTracks().forEach(track=>track.stop());
   if(issued===token)stopStream();
   else{
    if(activeStream===localStream)activeStream=null;
    if(activeRecorder===localRecorder)activeRecorder=null;
   }
  }
 }
 $("[data-record]").addEventListener("click",()=>void record());
 $("[data-import]").addEventListener("click",()=>$("[data-file]").click());
 $("[data-file]").addEventListener("change",event=>{
  void importWav(event.target.files?.[0]);event.target.value="";
 });
 $("[data-use]").addEventListener("click",()=>{
  if(!clip)return;
  const name=$("[data-name]").value.trim()||"My recording";
  const root=Number($("[data-pitch]").value);
  if(name.length>60||!Number.isInteger(root)||root<36||root>96)return info("name and recorded pitch are required",true);
  const wav=encodeMonoWav(clip.values);
  try{
   if(onUse({name,wav,root,followPitch:$("[data-kind]").value==="note"}))close();
  }catch(error){onError(error);}
 });
 $("[data-close]").addEventListener("click",close);
 dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
 dialog.addEventListener("close",()=>{if(dialog.open)return;token++;stopStream();revoke();clip=null;});
 return {open(){
  stopStream();clip=null;revoke();$("[data-use]").disabled=true;
  $("[data-pitch]").replaceChildren();
  for(let midi=36;midi<=96;midi++){
   const option=element("option");option.value=String(midi);option.textContent=pitchLabel(midi);
   $("[data-pitch]").append(option);
  }
  $("[data-pitch]").value="60";
  info("record a short sound or import a WAV · recording begins after permission");
  if(!dialog.open)dialog.showModal();
 },close};
}
