import {mountEditorWorkspace,syncEditorInspector} from "./editorWorkspace.js";
import {vocalSourceRange} from "./vocalEffects.js";
import {mountSoundInspectorChrome,renderSoundInspectorCore} from "./soundInspector.js";
import {auditionVocal} from "./audio.js";
import {vocalDisplayPatch,vocalChangesFromControl} from "./vocalAudioView.js";
import {recordingBytes} from "./recordingAssets.js";
import {nativeEnabled} from "./src/hosts/native/session.js";
import {decodeNativeAudio} from "./src/hosts/native/capture.js";
import {suggestVocalOnset} from "./songRecorder.js";
import {renderAudioWaveform,decodedWaveformAsset,maxTrimSeconds,normalizeTrimSeconds} from "./audioWaveform.js";

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
export function syncVocalInspector(root,{open=true,wide=true}={}){
 if(root.vocalWorkspaceEditor&&!root.hidden)syncEditorInspector(root.vocalWorkspaceEditor,{open,wide});
}
export function renderVocalEditor(root,selection,{onApply,onTrim,onDuplicate,onBack,onUseInBeat,onUndo,onRedo,onSave,onBrowse,
 onSelect,onRecord,onMove,song=null,bpm=120,inspectorOpen=true,wide=true,onInspectorOpen=()=>{},canUndo=true,canRedo=true}){
 root.classList.remove("sound-section");
 root.hidden=!selection;
 if(!selection){root.replaceChildren();root.vocalWorkspaceEditor=null;return;}
 const {clip,track,recording}=selection,clipId=clip.id;
 const workspace=mountEditorWorkspace(root,{idPrefix:"vocal-",recording:true});
 root.vocalWorkspaceEditor=workspace;
 const getWorkspace=workspace.get;
 const toggleInspector=open=>{onInspectorOpen(open);syncVocalInspector(root,{open,wide});};
 syncVocalInspector(root,{open:inspectorOpen,wide});
 getWorkspace("sound-toggle").onclick=()=>toggleInspector(root.classList.contains("inspector-closed"));
 getWorkspace("undo").onclick=onUndo;getWorkspace("redo").onclick=onRedo;
 getWorkspace("undo").disabled=!canUndo;getWorkspace("redo").disabled=!canRedo;
 getWorkspace("editing-identity").textContent=recording.name;
 getWorkspace("add-instrument").onclick=onRecord;
 const takes=getWorkspace("instrument-list");
 const recordings=new Map((song?.recordings??[recording]).map(item=>[item.id,item]));
 for(const lane of song?.tracks??[track]){
  if(lane.kind!=="vocal")continue;
  const label=el("h3",lane.name,"vocal-track-name");takes.append(label);
  for(const take of [...lane.clips].sort((a,b)=>a.startStep-b.startStep)){
   const source=recordings.get(take.recordingId);if(!source)continue;
   const card=button("",()=>onSelect?.(take.id));
   card.className="instrument-card recording-card"+(take.id===clipId?" active":"");
   card.dataset.clipId=take.id;card.setAttribute("aria-pressed",String(take.id===clipId));
   const bar=Math.floor(take.startStep/16)+1,beat=(take.startStep%16)/4+1;
   card.append(el("strong",source.name),el("small","bar "+bar+" · beat "+beat));
   takes.append(card);
  }
 }
 const placement=getWorkspace("arrangement");placement.classList.add("vocal-clip-tools");
 const position=el("div",undefined,"vocal-position-fields");
 const bar=labelledNumber(position,"bar",Math.floor(clip.startStep/16)+1,1,100000,1,move);
 const beat=labelledNumber(position,"beat",(clip.startStep%16)/4+1,1,4.75,.25,move);
 function move(){
  const step=(Number(bar.value)-1)*16+(Number(beat.value)-1)*4;
  if(Number.isInteger(step)&&step>=0)onMove?.(clipId,step);
 }
 const duration=vocalSourceRange(recording,clip,60/bpm/4).duration;
 position.append(el("output",duration.toFixed(3)+"s playback","vocal-kept-duration"));
 const actions=el("div",undefined,"vocal-editor-actions");
 actions.append(button("duplicate",()=>onDuplicate(clipId)),button("use in beat",()=>onUseInBeat(clipId)),button("back to beat",onBack));
 placement.append(position,actions);
 const sourceRoot=getWorkspace("piano");
 let trimInput=null,applyTrim=null;
 const durationBeforeTrim=recording.durationSeconds-recording.trimSeconds;
 const savedTrim=clip.trimStartSeconds??0;
 const preview=value=>{
  if(trimInput&&document.activeElement!==trimInput)trimInput.value=value.toFixed(3);
  if(applyTrim)applyTrim.disabled=Math.abs(value-savedTrim)<.0005;
 };
 const waveform=renderAudioWaveform({recording,trimStart:savedTrim,
  onTrim:value=>onTrim(clipId,value),onPreview:preview,
  loadDecoded:()=>decodeVocalRecording(recording)});
 const timing=el("div",undefined,"vocal-timing");
 const label=el("label",undefined,"vocal-number");label.append(el("span","start (seconds)"));
 trimInput=el("input");trimInput.type="number";trimInput.min="0";
 trimInput.max=String(maxTrimSeconds(durationBeforeTrim));trimInput.step=".001";trimInput.value=String(savedTrim);
 trimInput.setAttribute("aria-label","Trim start in seconds");
 trimInput.setAttribute("aria-description","Type a time then choose set start, or drag the start handle in the waveform");
 label.append(trimInput);timing.append(label);
 const setStart=()=>{
  if(!trimInput.reportValidity()||!Number.isFinite(trimInput.valueAsNumber))return;
  onTrim(clipId,normalizeTrimSeconds(trimInput.valueAsNumber,durationBeforeTrim));
 };
 applyTrim=button("set start",setStart);applyTrim.disabled=true;
 trimInput.addEventListener("input",()=>{
  if(trimInput.validity.valid&&Number.isFinite(trimInput.valueAsNumber))waveform.setTrimPreview(trimInput.valueAsNumber);
  else applyTrim.disabled=true;
 });
 trimInput.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();setStart();}});
 const suggest=button("find sound start",async()=>{
  suggest.disabled=true;
  try{const at=await autoTrim(recording);if(at===null)throw Error("No clear onset detected");
   waveform.setTrimPreview(at);applyTrim.focus();}
  catch(error){window.alert("Could not suggest a trim: "+error.message);}
  finally{suggest.disabled=false;}
 });
 suggest.title="Suggest a start without trimming until you choose set start";
 const restore=button("restore start",()=>onTrim(clipId,0));restore.disabled=savedTrim===0;
 timing.append(applyTrim,suggest,restore);
 const legend=el("div",undefined,"audio-trim-legend");
 legend.append(el("span","shaded = trimmed"),el("span","drag start to trim"));
 sourceRoot.append(timing,legend,waveform);
 const patch=vocalDisplayPatch(clip,recording);
 const apply=(path,value)=>onApply(clipId,vocalChangesFromControl(patch,path,value));
 const frame=mountSoundInspectorChrome(getWorkspace("sound-section"),{owner:"vocal"}),get=frame.get;
 get("instrument-name").value=recording.name;get("instrument-name").disabled=true;
 get("instrument-actions").hidden=true;get("sound-controls").hidden=true;
 get("sound-close").onclick=()=>toggleInspector(false);
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
