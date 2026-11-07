import {mountSoundPanelView} from "./soundPanelView.js";
// Vocal clips share the same sampler tone, pitch and movement controls.
// This is the Song context for the existing lower Beat editing workspace.
import {renderAudioToneControls,renderAudioMovementControls,renderAudioArticulationControls,renderAudioDelayControls} from "./audioControlUI.js";
import {illustrateSoundPanel} from "./soundIllustrations.js";
import {collectSoundFields} from "./soundPanelLayout.js";
import {assignSoundEdit} from "./soundEditPath.js";
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
function section(root,title){
 const details=el("details",undefined,"synth-group"),summary=el("summary",title);
 details.open=true;const fields=el("div",undefined,"synth-fields dial-grid");
 details.append(summary,fields);root.append(details);return fields;
}
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
 root.querySelector(".vocal-effect-sections")?.soundPanelView?.dispose();
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
 const patch=vocalDisplayPatch(clip,recording),visuals=[];
 const apply=(path,value)=>onApply(clipId,vocalChangesFromControl(patch,path,value));
 const preview=(path,value)=>{
  const next=structuredClone(patch);
  assignSoundEdit(next,path,value);
  next.audioFilterBypassed=next.filter===null;
  for(const visual of visuals)visual.draw(next);
 };
 const shape=section(sections,"sample & articulation");
 renderAudioArticulationControls(shape,patch,apply,preview,{context:"vocal"});
 const tone=section(sections,"tone · filter & distortion");
 renderAudioToneControls(tone,patch,apply,preview,{allowBypass:true,showCutoff:true});
 const pitch=section(sections,"pitch & movement");
 renderAudioMovementControls(pitch,patch,apply,preview);
 const delay=section(sections,"delay");
 renderAudioDelayControls(delay,patch,apply,preview);
 root.append(sections);
 const soundFields=collectSoundFields(sections);
 // Exact same graph, gestures, and label linking used by the sampler Sound
 // inspector. Vocal-only source and trigger options are deliberately absent.
 for(const [details,kind] of [[shape.closest("details"),"sample"],
  [tone.closest("details"),"filter"],[pitch.closest("details"),"movement"],
  [delay.closest("details"),"delay"]]){
  details.soundFields=soundFields;
  const anchor=document.createComment("audio visual position");
  details.before(anchor);
  const visual=illustrateSoundPanel(details,kind,patch,apply,preview,clipId);
  visuals.push(visual);anchor.replaceWith(visual.element);
 }
 mountSoundPanelView(sections);
}
