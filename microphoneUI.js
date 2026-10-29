import {RECORDER_DURATIONS,RECORDING_RATE,pitchLabel,estimatePitch,encodeMonoWav,describeRecording,
 pcmFromRecordedBlob,monoFromAudioBlob,recordingExcerpt} from "./recording.js";
import {convertToSynth} from "./synthMatch.js";
import {nativeEnabled,nativeRequest} from './src/hosts/native/session.js';
import {prepareNativeTake} from './src/hosts/native/capture.js';
import {nativeSourcePlayer} from './src/hosts/native/source-player.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function installMicrophoneRecorder({get,onUse,onSynth}){
 const $=get,dialog=$("microphone-dialog");
 let stream=null,media=null,capture=null,source=null,converted=null,active=false,generation=0,conversion=null,nativeTake=null;
 const urls=new Map();
 const kind=()=>dialog.querySelector('input[name="mic-kind"]:checked')?.value||"note";
 const status=(label,small="",count="●")=>{
  $("mic-status").textContent=label;$("mic-subtitle").textContent=small;$("mic-count").textContent=count;
 };
 const nativePlayers=new Map(['mic-playback','mic-synth-playback'].map(id=>[id,nativeSourcePlayer($(id),{onError:error=>status('playback error',error.message||String(error),'!')})]));
 function audio(id,blob=null){
  const player=$(id);player.pause();player.removeAttribute("src");player.load();
  if(urls.has(id)){URL.revokeObjectURL(urls.get(id));urls.delete(id);}
  if(nativePlayers.get(id).set(blob))return;
  if(blob){const url=URL.createObjectURL(blob);urls.set(id,url);player.src=url;}
 }
 function clearConversion(){
  conversion?.abort();conversion=null;converted=null;
  audio("mic-synth-playback");$("mic-synth-result").hidden=true;
 }
 function busy(value){
  active=value;dialog.setAttribute("aria-busy",String(value));
  for(const id of ["mic-capture","mic-upload","mic-use","mic-retry","mic-convert","mic-use-synth",
   "mic-length","mic-root","mic-excerpt-start","mic-excerpt-length","mic-excerpt-use"])
   $(id).disabled=value;
  for(const radio of dialog.querySelectorAll('input[name="mic-kind"]'))radio.disabled=value;
 }
 function dispose(){
  generation++;clearConversion();
  void nativeTake?.cancel();nativeTake=null;
  if(media&&media.state!=="inactive"){try{media.stop();}catch{}}
  media=null;
  if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
  audio("mic-playback");capture=null;source=null;
  dialog.classList.remove("mic-recording");busy(false);
 }
 function reset(defaults=false){
  dispose();status("Ready","Record or upload WAV audio.");
  $("mic-preview").hidden=true;$("mic-excerpt").hidden=true;
  $("mic-capture").hidden=false;$("mic-use").hidden=true;$("mic-retry").hidden=true;
  $("mic-name").value="";
  if(defaults){$("mic-length").value="1.5";dialog.querySelector('input[name="mic-kind"][value="note"]').checked=true;}
 }
 function showPitch(){
  if(!capture)return;
  if(kind()!=="note"){$("mic-pitch-message").textContent="One-shot recording · no note identification needed.";return;}
  const pitch=capture.pitch;
  $("mic-root").value=String(Math.max(36,Math.min(96,pitch?.midi??60)));
  $("mic-pitch-message").textContent=pitch?
   "Likely "+pitchLabel(pitch.midi)+" ("+Math.round(pitch.hz)+" Hz). Check the note before using.":
   "Couldn't identify a reliable single pitch. Choose the note you recorded.";
 }
 function updateKind(){
  const pitched=kind()==="note";
  $("mic-hint").textContent=pitched?
   "Record a steady note with brief silence before it. Pitch detection is an estimate.":
   "Record one percussion hit or noise. One-shot playback does not use note pitch.";
  $("mic-root-field").hidden=!pitched;
  clearConversion();showPitch();
 }
 function reportTake(values,name=kind()==="note"?"My note":"My hit"){
  clearConversion();
  const wav=encodeMonoWav(values,RECORDING_RATE);
  capture={values,wav,pitch:estimatePitch(values,RECORDING_RATE),quality:describeRecording(values)};
  audio("mic-playback",new Blob([wav],{type:"audio/wav"}));
  $("mic-name").value=name.slice(0,60);
  $("mic-preview").hidden=false;$("mic-capture").hidden=true;
  $("mic-use").hidden=false;$("mic-retry").hidden=false;
  showPitch();
  const health=capture.quality;
  $("mic-quality").textContent=health.quiet?
   "This recording is extremely quiet. Try moving closer and recording again.":
   health.clipped?"The input may be distorted. Try a quieter sound or move away from the microphone.":
   "Captured "+Math.round(values.length/RECORDING_RATE*100)/100+" seconds · "+Math.round(wav.length/1024)+" KB WAV";
  status("Recording complete","Use as a sample or convert to a synth.","✓");
 }
 async function start(){
  if(active)return;
  if(nativeEnabled())return startNative();
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
   status("Microphone recording unavailable","Upload a WAV to use a sound or convert it to synth.","!");return;
  }
  reset();busy(true);const token=generation,duration=Number($("mic-length").value);
  if(!RECORDER_DURATIONS.includes(duration)){reset();return;}
  let localStream;
  try{
   status("Requesting microphone","Your browser will ask you to allow microphone use.");
   localStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,
    noiseSuppression:false,autoGainControl:false},video:false});
   if(token!==generation||!dialog.open)return;
   stream=localStream;
   for(let n=3;n>=1;n--){
    status("Countdown","Recording starts after the countdown.",String(n));await delay(950);
    if(token!==generation||!dialog.open)return;
   }
   const options=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(type=>MediaRecorder.isTypeSupported?.(type));
   const recorder=new MediaRecorder(localStream,options?{mimeType:options}:undefined);media=recorder;
   const chunks=[];
   const finished=new Promise((resolve,reject)=>{
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onerror=event=>reject(event.error||Error("Microphone recording failed."));
    recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type||"audio/webm"}));
   });
   void finished.catch(()=>{});
   recorder.start();status("Recording","Capture in progress.");dialog.classList.add("mic-recording");
   await delay(duration*1000);
   if(token!==generation||!dialog.open)return;
   recorder.stop();const recorded=await finished;
   for(const track of localStream.getTracks())track.stop();
   if(token!==generation||!dialog.open)return;
   status("Processing recording","Preparing a WAV and checking its pitch.");
   const values=await pcmFromRecordedBlob(recorded);
   if(token===generation&&dialog.open)reportTake(values);
  }catch(error){
   if(token===generation)status("Recording unavailable",error?.name==="NotAllowedError"?
    "Microphone permission was denied. Allow it in browser settings, or upload a WAV.":error.message,"!");
  }finally{
   for(const track of localStream?.getTracks()||[])track.stop();
   if(token===generation){stream=null;media=null;dialog.classList.remove("mic-recording");busy(false);}
  }
 }
 async function startNative(){
  reset();busy(true);const token=generation,duration=Number($('mic-length').value);let take;
  if(!RECORDER_DURATIONS.includes(duration)){reset();return;}
  try{
   status('opening microphone');take=await prepareNativeTake({seconds:duration,synchronized:false});
   if(token!==generation||!dialog.open){await take.cancel();return;}nativeTake=take;await take.start(2.85);
   while(token===generation&&dialog.open){
    const info=await nativeRequest({action:'status'});if(info.deviceLost)throw Error('native microphone or output disconnected');
    if(info.captureOwner!==take.captureOwner)throw Error('native microphone take was cancelled');
    if(info.capture.phase===3)break;
    if(info.capture.phase===1)status('countdown','',String(Math.max(1,Math.ceil(info.capture.leadFrames/info.sampleRate))));
    else{status('recording');dialog.classList.add('mic-recording');}
    await delay(60);
   }
   if(token!==generation||!dialog.open)return;
   const recorded=await take.finish();nativeTake=null;status('processing recording');
   const values=await pcmFromRecordedBlob(new Blob([recorded.bytes],{type:'audio/wav'}));if(token===generation&&dialog.open)reportTake(values);
  }catch(error){if(token===generation)status('recording unavailable',error.message||String(error),'!');}
  finally{await take?.cancel();if(nativeTake===take)nativeTake=null;if(token===generation){dialog.classList.remove('mic-recording');busy(false);}}
 }
 async function loadFile(blob,name="Uploaded sound"){
  reset();busy(true);const token=generation;
  try{
   if(blob.size>20_000_000)throw Error("Choose a WAV smaller than 20 MB.");
   status("Reading audio","Choose a short excerpt containing one note or hit.");
   const values=await monoFromAudioBlob(blob);
   if(token!==generation||!dialog.open)return;
   source={values,name:name.replace(/\.[^.]+$/,"").slice(0,60)};
   const seconds=Math.min(4,values.length/RECORDING_RATE);
   $("mic-excerpt-start").value="0";$("mic-excerpt-length").value=String(seconds);
   $("mic-excerpt-start").max=String(Math.max(0,values.length/RECORDING_RATE-.06));
   $("mic-source-info").textContent=name+" · "+(values.length/RECORDING_RATE).toFixed(2)+" seconds. Previewing the selected excerpt (up to 4 seconds).";
   reportTake(recordingExcerpt(values,0,seconds),source.name);$("mic-excerpt").hidden=false;
  }catch(error){if(token===generation)status("Couldn't read this sound",error.message,"!");}
  finally{if(token===generation)busy(false);}
 }
 async function convert(){
  if(!capture||active)return;
  clearConversion();busy(true);$("mic-playback").pause();void nativePlayers.get('mic-playback').stop();
  const token=generation,controller=new AbortController();conversion=controller;
  try{
   const result=await convertToSynth(capture.values,RECORDING_RATE,{kind:kind(),
    root:kind()==="note"?Number($("mic-root").value):undefined,signal:controller.signal,
    onProgress:(label,progress)=>{if(token===generation)status(label,"Estimating synth parameters",Math.round(progress*100)+"%");}});
   if(token!==generation||!dialog.open)return;
   converted=result;audio("mic-synth-playback",result.preview);$("mic-synth-name").value=result.name;
   $("mic-synth-result").hidden=false;
   status("Conversion complete","Compare the source and synth, then edit the parameters.","✓");
  }catch(error){if(token===generation&&error.name!=="AbortError")status("Couldn't convert this sound",error.message,"!");}
  finally{if(token===generation){conversion=null;busy(false);}}
 }
 for(let midi=36;midi<=96;midi++){
  const option=document.createElement("option");option.value=String(midi);option.textContent=pitchLabel(midi);$("mic-root").append(option);
 }
 $("mic-root").value="60";
 $("mic-capture").addEventListener("click",()=>void start());
 $("mic-retry").addEventListener("click",()=>void start());
 $("mic-upload").addEventListener("click",()=>$("mic-file").click());
 $("mic-file").addEventListener("change",async event=>{
  const file=event.currentTarget.files?.[0];if(!file)return;
  try{
   const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
   if(new TextDecoder().decode(header.slice(0,4))!=="RIFF"||new TextDecoder().decode(header.slice(8,12))!=="WAVE")
    throw Error("Choose a file containing WAV audio.");
   await loadFile(file,file.name);
  }catch(error){status("Couldn't read this sound",error.message,"!");}
  finally{$("mic-file").value="";}
 });
 $("mic-excerpt-use").addEventListener("click",()=>{
  if(!source||active)return;
  try{reportTake(recordingExcerpt(source.values,Number($("mic-excerpt-start").value),Number($("mic-excerpt-length").value)),source.name);}
  catch(error){status("Choose an excerpt",error.message,"!");}
 });
 for(const radio of dialog.querySelectorAll('input[name="mic-kind"]'))radio.addEventListener("change",updateKind);
 $("mic-root").addEventListener("change",clearConversion);
 $("mic-convert").addEventListener("click",()=>void convert());
 $("mic-use").addEventListener("click",()=>{
  if(!capture||active)return;
  const name=$("mic-name").value.trim().slice(0,60)||"My recording",pitched=kind()==="note";
  if(onUse({wav:capture.wav,name,followPitch:pitched,root:pitched?Number($("mic-root").value):60})!==false)dialog.close();
 });
 $("mic-use-synth").addEventListener("click",()=>{
  if(!converted||active)return;
  if(onSynth({...converted,name:$("mic-synth-name").value.trim().slice(0,60)||converted.name})!==false)dialog.close();
 });
 for(const [id,other] of [["mic-playback","mic-synth-playback"],["mic-synth-playback","mic-playback"]])
  $(id).addEventListener("play",()=>$(other).pause());
 $("mic-close").addEventListener("click",()=>dialog.close());
 dialog.addEventListener("cancel",dispose);
 // A queued close event from a previous take can arrive after a rapid reopen.
 // It must not dispose the new session or cancel its microphone request.
 dialog.addEventListener("close",()=>{if(!dialog.open)dispose();});
 return {open(){reset(true);updateKind();if(!dialog.open)dialog.showModal();},
  async openFile(blob,name){reset(true);updateKind();if(!dialog.open)dialog.showModal();await loadFile(blob,name);},
  close(){dialog.close();dispose();}};
}
