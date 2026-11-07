import {renderRecordedAudioEditor,disposeRecordedAudioEditor} from "./samplerUI.js";
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
export function renderVocalEditor(root,selection,{onApply,onTrim,onDuplicate,onBack,onUseInBeat,onUndo,onRedo}){
 disposeRecordedAudioEditor(root.querySelector(".vocal-effect-sections"));
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
 const sections=el("div",undefined,"vocal-effect-sections");
 const patch=vocalDisplayPatch(clip,recording);
 const apply=(path,value)=>onApply(clipId,vocalChangesFromControl(patch,path,value));
 renderRecordedAudioEditor(sections,patch,apply,{soundId:clipId});
 root.append(sections);
}
