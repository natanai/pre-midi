import {RECORDER_DURATIONS,RECORDING_RATE,pitchLabel,estimatePitch,encodeMonoWav,describeRecording,pcmFromRecordedBlob} from "./recording.js";
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function installMicrophoneRecorder({get,onUse}){
 const $=get,dialog=$("microphone-dialog");
 let stream=null,media=null,aborted=false,capture=null,previewUrl=null,active=false;
 const buttons=()=>[$("mic-capture"),$("mic-retry"),$("mic-use")];
 const status=(label,small="",count="●")=>{
  $("mic-status").textContent=label;$("mic-subtitle").textContent=small;$("mic-count").textContent=count;
 };
 const kind=()=>dialog.querySelector('input[name="mic-kind"]:checked')?.value||"note";
 const dispose=()=>{
  aborted=true;
  if(media&&media.state!=="inactive"){try{media.stop();}catch{}}
  media=null;
  if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
  $("mic-playback").removeAttribute("src");$("mic-playback").load();
  active=false;capture=null;
 };
 function reset(){
  dispose();aborted=false;
  status("Ready when you are","Microphone permission is requested only when you start.");
  $("mic-preview").hidden=true;
  $("mic-capture").hidden=false;$("mic-capture").disabled=false;
  $("mic-use").hidden=true;$("mic-retry").hidden=true;
  $("mic-name").value="";
  $("mic-length").disabled=false;
  for(const radio of dialog.querySelectorAll('input[name="mic-kind"]'))radio.disabled=false;
 }
 function updateKind(){
  const pitched=kind()==="note";
  $("mic-hint").textContent=pitched?
   "Play one clear guitar string, whistle or sung note. Leave a tiny bit of quiet before playing. I'll suggest the pitch.":
   "Make one distinct hit or noise. This plays as a one-shot, without trying to detect a note.";
  $("mic-root-field").hidden=!pitched;
  if(capture)showPitch(capture);
 }
 function showPitch(take){
  if(kind()!=="note"){$("mic-pitch-message").textContent="One-shot recording · no note identification needed.";return;}
  const pitch=take.pitch;
  $("mic-root").value=String(pitch?.midi??60);
  $("mic-pitch-message").textContent=pitch?
   "Likely "+pitchLabel(pitch.midi)+" ("+Math.round(pitch.hz)+" Hz). Check the note before using.":
   "Couldn't identify a reliable single pitch. Choose the note you recorded.";
 }
 function reportTake(values){
  const wav=encodeMonoWav(values,RECORDING_RATE),blob=new Blob([wav],{type:"audio/wav"});
  capture={wav,pitch:estimatePitch(values,RECORDING_RATE),quality:describeRecording(values)};
  previewUrl=URL.createObjectURL(blob);
  $("mic-playback").src=previewUrl;
  $("mic-name").value=kind()==="note"?"My note":"My hit";
  $("mic-preview").hidden=false;
  $("mic-capture").hidden=true;$("mic-use").hidden=false;$("mic-retry").hidden=false;
  $("mic-length").disabled=false;
  for(const radio of dialog.querySelectorAll('input[name="mic-kind"]'))radio.disabled=false;
  showPitch(capture);
  const health=capture.quality;
  $("mic-quality").textContent=health.quiet?
   "This recording is extremely quiet. Try moving closer and recording again.":
   health.clipped?"The input may be distorted. Try a quieter sound or move away from the microphone.":
   "Captured "+Math.round(values.length/RECORDING_RATE*100)/100+" seconds · "+Math.round(wav.length/1024)+" KB WAV";
  status("Listen to your sound","You can re-record it or add it as an instrument.","✓");
 }
 async function start(){
  if(active)return;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
   status("Microphone recording unavailable","Use Import audio to add an existing WAV, OGG or MP3 file.","!");
   return;
  }
  reset();active=true;$("mic-capture").disabled=true;$("mic-length").disabled=true;
  for(const radio of dialog.querySelectorAll('input[name="mic-kind"]'))radio.disabled=true;
  const duration=Number($("mic-length").value);
  if(!RECORDER_DURATIONS.includes(duration)){active=false;reset();return;}
  try{
   status("Requesting microphone","Your browser will ask you to allow microphone use.");
   stream=await navigator.mediaDevices.getUserMedia({
    audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false
   });
   if(aborted||!dialog.open){dispose();return;}
   for(let n=3;n>=1;n--){
    status("Get ready","Recording starts automatically after the countdown.",String(n));
    await delay(950);
    if(aborted||!dialog.open){dispose();return;}
   }
   const options=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(type=>MediaRecorder.isTypeSupported?.(type));
   media=new MediaRecorder(stream,options?{mimeType:options}:undefined);
   const chunks=[];
   const finished=new Promise((resolve,reject)=>{
    media.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    media.onerror=event=>reject(event.error||Error("Microphone recording failed."));
    media.onstop=()=>resolve(new Blob(chunks,{type:media.mimeType||chunks[0]?.type||"audio/webm"}));
   });
   media.start();
   status("Recording","Make your sound now.","●");
   dialog.classList.add("mic-recording");
   await delay(duration*1000);
   if(!media||aborted)return;
   media.stop();
   const recorded=await finished;
   dialog.classList.remove("mic-recording");
   for(const track of stream.getTracks())track.stop();
   stream=null;
   if(aborted||!dialog.open)return;
   status("Processing recording","Preparing a WAV and checking its pitch.");
   const values=await pcmFromRecordedBlob(recorded);
   if(aborted||!dialog.open)return;
   reportTake(values);
  }catch(error){
   if(!aborted)status("Recording unavailable",error?.name==="NotAllowedError"?
    "Microphone permission was denied. Allow it in browser settings, or import a file.":error.message,"!");
   $("mic-capture").disabled=false;$("mic-length").disabled=false;
   for(const radio of dialog.querySelectorAll('input[name="mic-kind"]'))radio.disabled=false;
  }finally{
   if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
   dialog.classList.remove("mic-recording");
   active=false;
  }
 }
 for(let midi=36;midi<=96;midi++){
  const option=document.createElement("option");option.value=String(midi);option.textContent=pitchLabel(midi);
  $("mic-root").append(option);
 }
 $("mic-root").value="60";
 $("mic-capture").addEventListener("click",()=>void start());
 $("mic-retry").addEventListener("click",()=>{reset();void start();});
 for(const radio of dialog.querySelectorAll('input[name="mic-kind"]'))radio.addEventListener("change",updateKind);
 $("mic-use").addEventListener("click",()=>{
  if(!capture)return;
  const input=$("mic-name").value.trim().slice(0,60)||"My recording";
  const pitched=kind()==="note";
  const root=Number($("mic-root").value);
  const sound={wav:capture.wav,name:input,followPitch:pitched,root:pitched?root:60};
  if(onUse(sound)!==false){dialog.close();dispose();}
 });
 $("mic-close").addEventListener("click",()=>{dialog.close();dispose();});
 dialog.addEventListener("cancel",()=>dispose());
 dialog.addEventListener("close",()=>dispose());
 return {
  open(){
   reset();updateKind();
   if(!dialog.open)dialog.showModal();
  },
  close(){dialog.close();dispose();}
 };
}
