import {RECORDER_DURATIONS,RECORDING_RATE,estimatePitch,pitchLabel,
 encodeMonoWav,describeRecording,pcmFromRecordedBlob} from "./recording.js";

// Owns microphone permission, countdown, capture, preview and disposal.
// The host studio alone owns the actual instrument mutation/save.
export function setupRecorder({dialog,onUse,onMessage}){
 const $=id=>dialog.querySelector("#"+id);
 const lengths=$("record-duration"),name=$("record-name"),status=$("record-status"),
  preview=$("record-preview"),use=$("record-use"),start=$("record-start"),
  again=$("record-again"),root=$("record-root"),style=$("record-style"),
  pitchInfo=$("record-pitch-info"),diagnostics=$("record-diagnostics");
 let stream=null,recorder=null,clock=null,token=0,bytes=null,url=null,recording=false;
 for(const seconds of RECORDER_DURATIONS){
  const option=document.createElement("option");option.value=String(seconds);
  option.textContent=seconds+" seconds"+(seconds===1.5?" · suggested":"");
  lengths.append(option);
 }
 lengths.value="1.5";
 const pitches=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
 for(let midi=36;midi<=96;midi++){
  const option=document.createElement("option");option.value=String(midi);
  option.textContent=pitchLabel(midi);root.append(option);
 }
 function setStatus(message){status.textContent=message;}
 function clearStream(){
  if(clock!==null){clearTimeout(clock);clock=null;}
  try{if(recorder?.state==="recording")recorder.stop();}catch{}
  try{stream?.getTracks().forEach(track=>track.stop());}catch{}
  stream=null;recorder=null;
 }
 function clearPreview(){
  if(url)URL.revokeObjectURL(url);url=null;
  preview.pause();preview.removeAttribute("src");preview.load();
  bytes=null;use.disabled=true;pitchInfo.hidden=true;again.hidden=true;
  diagnostics.textContent="";
 }
 function close(){
  token++;recording=false;clearStream();clearPreview();
  if(dialog.open)dialog.close();
 }
 function open(mode="add"){
  if(dialog.open)return;
  dialog.dataset.mode=mode;
  clearStream();clearPreview();recording=false;
  name.value="My recording";style.value="pitched";root.value="60";
  lengths.value="1.5";start.disabled=false;
  setStatus("Tap Start to request microphone access, then a 3-second countdown begins.");
  dialog.showModal();
 }
 const sleep=ms=>new Promise(resolve=>{clock=setTimeout(()=>{clock=null;resolve();},ms);});
 async function capture(){
  if(recording)return;
  const myToken=++token;recording=true;start.disabled=true;clearPreview();
  const duration=Number(lengths.value);
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)
    throw Error("This browser does not support microphone recording. Try a current browser on HTTPS.");
   setStatus("Requesting microphone permission…");
   stream=await navigator.mediaDevices.getUserMedia({audio:{
    channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false
   },video:false});
   if(myToken!==token){clearStream();return;}
   for(let n=3;n>=1;n--){
    setStatus("Ready · "+n);
    await sleep(1000);
    if(myToken!==token)return;
   }
   const types=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg"];
   const supported=types.find(type=>MediaRecorder.isTypeSupported(type));
   const media=new MediaRecorder(stream,supported?{mimeType:supported}:undefined);
   recorder=media;
   const chunks=[];
   media.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
   const finished=new Promise((resolve,reject)=>{
    media.onerror=event=>reject(event.error||Error("Microphone capture failed."));
    media.onstop=()=>resolve(new Blob(chunks,{type:media.mimeType}));
   });
   media.start();
   setStatus("● Recording · "+duration+" seconds");
   await sleep(duration*1000);
   if(myToken!==token)return;
   media.stop();
   const recorded=await finished;
   stream.getTracks().forEach(track=>track.stop());stream=null;recorder=null;
   if(myToken!==token)return;
   const pcm=await pcmFromRecordedBlob(recorded);
   // Trim recorder container delay / trailing chunks to the intended window.
   const target=Math.min(pcm.length,Math.round(duration*RECORDING_RATE));
   const signal=pcm.subarray(0,target);
   bytes=encodeMonoWav(signal);
   const measures=describeRecording(signal);
   const guess=estimatePitch(signal,RECORDING_RATE);
   diagnostics.textContent=measures.quiet?"Very quiet recording · try closer to your microphone":
    measures.clipped?"Possible distortion · try moving farther away":"Recording captured";
   if(guess){
    root.value=String(Math.min(96,Math.max(36,guess.midi)));
    pitchInfo.textContent="Suggested pitch: "+pitchLabel(guess.midi)+
     " · estimate, please check";
    pitchInfo.hidden=false;
   }else{
    pitchInfo.textContent="Couldn't identify one stable pitch. Choose a note manually or use as percussion/noise.";
    pitchInfo.hidden=false;
   }
   url=URL.createObjectURL(new Blob([bytes],{type:"audio/wav"}));
   preview.src=url;preview.hidden=false;preview.load();
   again.hidden=false;use.disabled=false;
   setStatus("Listen to your take. Record again or use this sound.");
  }catch(error){
   setStatus("Couldn't record: "+error.message);
   onMessage?.("Microphone recording failed: "+error.message,true);
   if(myToken===token)clearStream();
  }finally{
   if(myToken===token){recording=false;start.disabled=false;}
  }
 }
 start.addEventListener("click",()=>{void capture();});
 again.addEventListener("click",()=>{void capture();});
 use.addEventListener("click",()=>{
  if(!bytes)return;
  const label=name.value.trim()||"My recording";
  if(label.length>60){setStatus("Use a name of 60 characters or fewer.");return;}
  const data={name:label,bytes:new Uint8Array(bytes),root:Number(root.value),
   followPitch:style.value==="pitched",mode:dialog.dataset.mode};
  try{
   const result=onUse(data);
   if(result!==false)close();
  }catch(error){setStatus(error.message);}
 });
 $("record-close").addEventListener("click",close);
 dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
 // Backdrop click doesn't swallow microphone tracks.
 dialog.addEventListener("click",event=>{if(event.target===dialog)close();});
 style.addEventListener("change",()=>{
  root.disabled=style.value!=="pitched";
  pitchInfo.style.opacity=style.value==="pitched"?"1":".55";
 });
 return {open,close};
}
