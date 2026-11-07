import {mountSoundInspectorChrome,renderSoundInspectorCore} from "./soundInspector.js";
import {auditionVocal} from "./audio.js";
import {vocalDisplayPatch,vocalChangesFromControl} from "./vocalAudioView.js";
import {recordingBytes} from "./recordingAssets.js";
import {nativeEnabled} from "./src/hosts/native/session.js";
import {decodeNativeAudio} from "./src/hosts/native/capture.js";
import {suggestVocalOnset} from "./songRecorder.js";
import {renderAudioWaveform,decodedWaveformAsset,maxTrimSeconds} from "./audioWaveform.js";

const el=(tag,name,className)=>{
 const node=document.createElement(tag);if(name!==undefined)node.textContent=name;
 if(className)node.className=className;
 return node;
};
const button=(label,fn)=>{const b=el("button",label);b.type="button";b.addEventListener("click",fn);return b;};
function labelledNumber(root,label,value,min,max,step,change){
 const wrap=el("label",undefined,"vocal-number");
 wrap.append(el("span",label));const input=el("input");
 input.type="number";input.min=String(min);input.max=String(max);input.step=String(step);
 input.value=String(value);input.addEventListener("change",()=>change(Number(input.value)));
 wrap.append(input);root.append(wrap);return input;
}
export async function decodeVocalRecording(recording){
 const bytes=recordingBytes(recording);
 let audio;
 if(nativeEnabled())audio=await decodeNativeAudio(bytes,{mono:false});
 else{
  const ctx=new AudioContext();
  try{const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
   audio=await ctx.decodeAudioData(raw);}
  finally{await ctx.close();}
 }
 return audio;
}
async function autoTrim(recording){
 return suggestVocalOnset(await decodedWaveformAsset(recording,()=>decodeVocalRecording(recording)),recording.trimSeconds);
}
export function renderVocalEditor(root,selection,{onApply,onTrim,onDuplicate,onBack,onUseInBeat,onUndo,onRedo,onSave,onBrowse,bpm=120}){
 root.classList.add("sound-section");
 root.hidden=!selection;
 if(!selection){root.replaceChildren();return;}
 const {clip,track,recording}=selection,clipId=clip.id;
 root.replaceChildren();
 const heading=el("div",undefined,"vocal-editor-heading");
 const identity=el("div",undefined,"vocal-editor-identity");
 identity.append(el("strong",recording.name),el("span"," · "+track.name));
 const actions=el("div",undefined,"vocal-editor-actions");
 actions.append(button("↶",onUndo),button("↷",onRedo),
  button("duplicate",()=>onDuplicate(clipId)),button("use in beat",()=>onUseInBeat(clipId)),
  button("back to beat",onBack));
 heading.append(identity,actions);root.append(heading);
 let trimInput=null;
 root.append(renderAudioWaveform({recording,trimStart:clip.trimStartSeconds??0,
  onTrim:value=>onTrim(clipId,value),
  onPreview:value=>{if(trimInput)trimInput.value=value.toFixed(3);},
  loadDecoded:()=>decodeVocalRecording(recording)}));
 const timing=el("div",undefined,"vocal-timing");
 trimInput=labelledNumber(timing,"trim start (seconds)",clip.trimStartSeconds??0,0,
  maxTrimSeconds(recording.durationSeconds-recording.trimSeconds),.001,
  value=>onTrim(clipId,value));
 const suggest=button("trim to sound",async()=>{
  suggest.disabled=true;
  try{const at=await autoTrim(recording);if(at===null)throw Error("No clear onset detected");
   onTrim(clipId,at);}
  catch(error){window.alert("Could not suggest a trim: "+error.message);}
  finally{suggest.disabled=false;}
 });
 suggest.title="Find the first audible onset; keep the original recording";
 timing.append(suggest);root.append(timing);
 const patch=vocalDisplayPatch(clip,recording);
 const apply=(path,value)=>onApply(clipId,vocalChangesFromControl(patch,path,value));
 const frame=mountSoundInspectorChrome(root,{owner:"vocal"}),get=frame.get;
 get("instrument-name").value=recording.name;get("instrument-name").disabled=true;
 get("instrument-actions").hidden=true;get("sound-controls").hidden=true;
 get("sound-close").onclick=onBack;
 get("change-sound").textContent="browse processing";get("change-sound").onclick=()=>onBrowse?.(clipId);
 get("save-sound").onclick=()=>onSave?.(clipId);
 get("hear-sound").onclick=()=>{void auditionVocal({clip,recording,track},bpm).catch(error=>window.alert(error.message));};
 renderSoundInspectorCore({instrument:{id:track.id,volume:clip.gain??1,layout:"pitched"},
  sound:{id:clipId,patch,gain:1,referencePitch:60},context:{bpm,vocal:{clip,recording}},
  modulesRoot:get("synth-editor"),scopeRoot:get("sound-visualizer"),
  volumeRoot:get("instrument-volume-dial"),gainRoot:get("sound-volume-dial"),
  primaryRoots:["primary-brightness-dial","primary-attack-dial","primary-release-dial"].map(get),
  onPatchChange:apply,onLevelChange:(key,value)=>apply(["gain"],value),
  onStageChange:()=>{},includeStage:false});
}
