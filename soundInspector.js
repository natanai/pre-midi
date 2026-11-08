import {renderProcessingChain} from "./processingChainUI.js";
import {setSoundIllustrationTempo} from "./soundIllustrations.js";
import {soundField,soundCapability} from "./soundParameterAdapter.js";
import {mountSoundPanelView} from "./soundPanelView.js";
import {renderCutoffAutomation} from "./automationUI.js";
// One canonical Sound Inspector renderer for both the Beat and the attached
// freeform Song context. Context adapters own undo, selection and asset access;
// this module alone owns the common controls, illustrations and scope layout.
// Do not add a second collection of sound controls in either caller.
import {renderPatchEditor,PRIMARY_SYNTH_FIELDS} from "./instrumentUI.js";
import {renderSamplerEditor,renderRecordedAudioEditor} from "./samplerUI.js";
import {sampleTone} from "./audioEffects.js";
import {createDial} from "./dial.js";
import {createSignalDisplay,disposeSignalDisplay} from "./soundScope.js";
import {illustrateSoundPanel} from "./soundIllustrations.js";
import {assignSoundEdit} from "./soundEditPath.js";
import {clone} from "./schema.js";
import {nextRackPreview} from "./rackPreview.js";

const recordedFields=context=>[
 soundField("filter.cutoff",context,{label:"brightness",path:["filter"]}),
 soundField("envelope.attack",context,{label:"attack"}),soundField("envelope.release",context,{label:"release"})
];

function stageState(instrument,patch,volume,gain,layout=instrument.layout){
 return {type:"stage",layout:layout==="rack"?"rack":"levels",pan:0,volume,gain};
}
function entries(path,value){
 return Array.isArray(path?.[0])?path.map((keys,i)=>[keys,value[i]]):[[path,value]];
}
// Both Beat and attached freeform use one preview policy. A Rack plays one
// Sound per click in row order; a pitched Instrument plays the selected Sound.
// The adapter supplies its own native-aware audio host and error reporting.
export function auditionSoundInspector({
 instrument,sound,context,button,previewPositions,play,onError=()=>{},duration=.6,
 auditionRequests=null,isCurrent=()=>true
}){
 if(!instrument||!sound||!button||typeof play!=="function"||
  !(previewPositions instanceof Map))
  throw Error("Sound Inspector audition requires a Sound, host and preview state.");
 const choice=instrument.layout==="rack"?
  nextRackPreview(previewPositions,"instrument:"+instrument.id,instrument.sounds):null;
 const entry=choice?.sound||sound;
 const label=choice?
  "hear "+entry.name+" ("+(choice.index+1)+" of "+choice.total+")":
  "hear current sound";
 button.dataset.previewSoundId=entry.id;
 button.title=label;
 button.setAttribute("aria-label",label);
 // Asynchronous native/browser host rejection must not report against an
 // Inspector that has already switched Sound or been superseded by a newer
 // audition request. A request map belongs to the host context, not the DSP.
 const requestKey="instrument:"+instrument.id;
 const token=auditionRequests instanceof Map?
  (auditionRequests.get(requestKey)??0)+1:0;
 if(auditionRequests instanceof Map)auditionRequests.set(requestKey,token);
 const report=error=>{
  if(!isCurrent())return;
  if(auditionRequests instanceof Map&&auditionRequests.get(requestKey)!==token)return;
  onError(error);
 };
 try{
  return Promise.resolve(play(instrument,entry.referencePitch,context,{
   soundId:entry.id,duration
  })).catch(report);
 }catch(error){report(error);return Promise.resolve();}
}

// Shared presentation/action ownership; callers specify their own permitted
// catalog operations, while the Inspector binds the common Sound controls.
// The UI may occupy different hosts but does not fork the action semantics.
export function bindSoundInspectorCatalogActions({
 instrument,browseButton,saveButton,onBrowse,onSave,
 browseMode="replace",saveWholeRack=instrument?.layout==="rack",
 rowBrowseButton=null,rowSaveButton=null,rackSaveButton=null,
 importButton=null,onImport=null
}){
 if(!instrument||!browseButton||!saveButton||
  typeof onBrowse!=="function"||typeof onSave!=="function")
  throw Error("Sound Inspector catalog actions require a host and context adapters.");
 browseButton.onclick=()=>onBrowse(browseMode);
 saveButton.onclick=()=>onSave(saveWholeRack);
 saveButton.setAttribute("aria-label",saveWholeRack?"Save rack preset":"Save preset");
 if(rowBrowseButton)rowBrowseButton.onclick=()=>onBrowse("replace-row");
 if(rowSaveButton)rowSaveButton.onclick=()=>onSave(false);
 if(rackSaveButton)rackSaveButton.onclick=()=>onSave(true);
 if(importButton&&onImport)importButton.onclick=onImport;
}

// Sound identity is part of the shared Inspector, not an editor-specific
// data writer. Context adapters own the transaction and undo destination.
export function bindSoundInspectorIdentity({
 sound,nameInput,referenceInput,onRename,onReferencePitch
}){
 if(!sound||!nameInput||!referenceInput||
  typeof onRename!=="function"||typeof onReferencePitch!=="function")
  throw Error("Sound Inspector identity requires controls and context writers.");
 nameInput.value=sound.name;
 referenceInput.value=String(sound.referencePitch);
 nameInput.onchange=()=>{
  const name=nameInput.value.trim()||"Sound";
  nameInput.value=name;
  onRename(name);
 };
 referenceInput.onchange=()=>{
  const value=Number(referenceInput.value);
  if(referenceInput.value.trim()===""||!Number.isInteger(value)||value<0||value>127){
   referenceInput.value=String(sound.referencePitch);
   return;
  }
  onReferencePitch(value);
 };
}

export function renderSoundInspectorCore({
 instrument,sound,context,modulesRoot,scopeRoot,
 volumeRoot,gainRoot,primaryRoots,
 accent="#86c6a7",sampleNames="",onReplaceSample=()=>{},stageLayout=null,
 onPatchChange,onLevelChange,onStageChange,
 onCutoffAutomation=null,scopeRenderer=null,stageOpen=null,includeStage=true
}){
 if(!instrument||!sound||!context||!modulesRoot||!scopeRoot||
  !volumeRoot||!gainRoot||primaryRoots?.length!==3||
  typeof onPatchChange!=="function"||typeof onLevelChange!=="function"||
  typeof onStageChange!=="function")
  throw Error("Sound Inspector requires a Sound, common roots and context edit adapters.");
 for(const panel of [modulesRoot,scopeRoot])
  for(const illustration of panel.querySelectorAll(".visual-sound-panel"))
   illustration.disposeSoundIllustration?.();
 const patch=sound.patch,recorded=patch.type!=="synth",vocal=patch.type==="vocal";
 setSoundIllustrationTempo(patch,context.bpm??120);
 const oldStage=stageOpen??modulesRoot.querySelector(
  '.visual-sound-panel[data-visual-kind="stage"] details')?.open??false;
 const level=instrument.volume*sound.gain;
 const updateScope=scopeRenderer?
  scopeRenderer(patch,level):
  createSignalDisplay(scopeRoot,patch,context,accent,level,
   sound.referencePitch,instrument.automation??null,sound.id);
 let stagePanel=null;
 const redraw=(next,volume=instrument.volume,gain=sound.gain)=>{
  updateScope(next,vocal&&next!==patch?next.gain:volume*gain);
  stagePanel?.draw(stageState(instrument,next,volume,gain,stageLayout??instrument.layout));
 };
 const preview=(path,value)=>{
  // Preview is ephemeral. Never mutate the authored patch before committing
  // to the Beat or Song history through its context-specific adapter.
  const next=clone(patch);
  assignSoundEdit(next,path,value);
  if(vocal)next.audioFilterBypassed=next.filter===null;
  redraw(next);
  for(const panel of modulesRoot.querySelectorAll(".visual-sound-panel"))
   panel.drawSoundIllustration?.(next);
 };
 volumeRoot.replaceChildren(createDial({
  label:instrument.layout==="rack"?"rack volume":"volume",
  min:0,max:vocal?2:1,step:.01,display:"percent"
 },instrument.volume,value=>onLevelChange("volume",value),
 value=>redraw(patch,value,sound.gain)));
 volumeRoot.dataset.soundPath="volume";
 volumeRoot.dataset.soundDomain="stage";
 gainRoot.replaceChildren(createDial({
  label:"Sound level",min:0,max:1,step:.01,display:"percent"
 },sound.gain,value=>onLevelChange("gain",value),
 value=>redraw(patch,instrument.volume,value)));
 gainRoot.dataset.soundPath="gain";
 gainRoot.dataset.soundDomain="stage";
 const fields=patch.type==="synth"?PRIMARY_SYNTH_FIELDS:recordedFields(patch.type);
 fields.forEach((field,index)=>{
  const root=primaryRoots[index];root.replaceChildren();
  const sampleFilter=recorded&&index===0;
  const current=sampleFilter?sampleTone(patch).filter.cutoff:
   field.path.reduce((value,key)=>value?.[key],patch);
  const update=(value,apply)=>{
   if(sampleFilter)apply(["filter"],{...sampleTone(patch).filter,cutoff:value});
   else apply(field.path,value);
  };
  const filterType=recorded?sampleTone(patch).filter.type:patch.filter.type;
  const help=index===0?(filterType==="lowpass"?
   "turn it down to muffle the high stuff":"move the filter to reshape the sound"):undefined;
  const capability=soundCapability(patch,field.path);
  root.append(createDial({...field,help,inactiveReason:capability.state==="inactive"?capability.reason:undefined},current,
   value=>update(value,onPatchChange),value=>update(value,preview)));
 });
 if(vocal)renderRecordedAudioEditor(modulesRoot,patch,onPatchChange,{onPreview:preview,soundId:sound.id,deferView:true,bpm:context.bpm??120});
 else if(patch.type==="sample")
  renderSamplerEditor(modulesRoot,patch,onPatchChange,sampleNames,
   onReplaceSample,preview,sound.id,{deferView:true,bpm:context.bpm??120});
 else{
  renderPatchEditor(modulesRoot,patch,onPatchChange,preview,sound.id,{deferView:true,bpm:context.bpm??120});
  onCutoffAutomation?.(modulesRoot,instrument,context);
 }
 if(recorded)renderCutoffAutomation(modulesRoot,{id:sound.id,layout:"pitched",sounds:[sound],automation:patch.automation},
  {bars:context.bars??Math.max(1,Math.ceil((context.vocal?.clip.lengthSteps??16)/16))},block=>onPatchChange(["automation"],block??undefined));
 modulesRoot.prepend(renderProcessingChain(patch,onPatchChange,sound.id));
 const paths=["filter.cutoff",recorded?"attack":"envelope.attack",
  recorded?"release":"envelope.release"];
 primaryRoots.forEach((root,index)=>{
  root.dataset.soundPath=paths[index];

 });
 // The same real gain and pan illustration edits the corresponding ordinary
 // controls. Multi-axis gesture edits commit in one context transaction.
 if(!includeStage){mountSoundPanelView(modulesRoot);return {preview,redraw,stagePanel:null};}
 const details=document.createElement("details");details.className="synth-group";
 details.open=oldStage;
 const summary=document.createElement("summary");
 summary.textContent="gain staging";
 details.append(summary);
 scopeRoot.append(details);
 const editStage=(path,value,commit)=>{
  const edits=entries(path,value),next=clone(patch);
  let volume=instrument.volume,gain=sound.gain;
  for(const [keys,amount] of edits){
   if(keys[0]==="volume")volume=amount;
   if(keys[0]==="gain")gain=amount;
   if(keys[0]==="pan")next.pan=amount;
  }
  if(commit)onStageChange(edits);
  else redraw(next,volume,gain);
 };
 const stageFields=document.createElement("div");stageFields.className="synth-fields";
 for(const [name,value,label] of [["volume",instrument.volume,"Instrument volume"],["gain",sound.gain,"Sound level"]]){
  const control=createDial({label,min:0,max:1,step:.01,display:"percent"},value,
   amount=>editStage([name],amount,true),amount=>editStage([name],amount,false));
  control.dataset.soundPath=name;control.dataset.soundDomain="stage";stageFields.append(control);
 }
 details.append(stageFields);
 stagePanel=illustrateSoundPanel(details,"stage",
  stageState(instrument,patch,instrument.volume,sound.gain,stageLayout??instrument.layout),
  (path,value)=>editStage(path,value,true),
  (path,value)=>editStage(path,value,false),sound.id);
 (modulesRoot.querySelector(".synth-grid")??modulesRoot).append(stagePanel.element);
 mountSoundPanelView(modulesRoot);
 return {preview,redraw,stagePanel};
}

// Canonical Sound Inspector DOM. Both Beat and attached freeform mount exactly
// this structure; contextual editors supply mutations, selection and layout
// permissions, not a second HTML tree. This mirrors the original Beat layout.
const SOUND_INSPECTOR_CHROME=String.raw`
    <div class="heading sound-section-heading">
     <div class="sound-heading">
      <h2>sound</h2>
      <input id="instrument-name" maxlength="60" aria-label="Instrument name" title="rename instrument">
     </div>
     <div class="sound-window-actions">
      <details id="instrument-actions" class="sound-entity-menu">
       <summary aria-label="instrument actions" title="instrument actions">···</summary>
       <div class="sound-entity-menu-content">
        <button id="convert-rack" type="button">convert to rack</button>
        <button id="convert-pitched" type="button" hidden>convert to piano roll</button>
        <button id="remove-instrument" type="button" class="danger">delete instrument</button>
       </div>
      </details>
      <button id="sound-close" type="button" aria-label="Close sound editor">×</button>
     </div>
    </div>
    <div class="sound-actions"><button id="change-sound" type="button">browse sounds</button></div>
    <div class="sound-overview">
     <div class="sound-primary-controls" aria-label="primary sound controls">
      <div id="instrument-volume-dial" class="instrument-volume-dial" aria-label="Instrument volume"></div>
      <button id="hear-sound" class="sound-preview-play" type="button" aria-label="Hear current sound">▶</button>
      <button id="save-sound" class="sound-preset-save" type="button" aria-label="Save preset">
       <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/>
        <path d="M7 3v6h9V3M7 21v-8h10v8"/>
       </svg>
      </button>
     </div>
     <div id="sound-visualizer" class="sound-visualizer" aria-label="Measured waveform and pitch"></div>
     <div class="sound-quick-controls">
      <div id="primary-brightness-dial"></div>
      <div id="primary-attack-dial"></div>
      <div id="primary-release-dial"></div>
     </div>
    </div>
    <div id="sound-controls" class="rack-sound-controls" hidden>
     <label>Sound name <input id="sound-name" maxlength="60" aria-label="Selected sound name"></label>
     <div id="sound-volume-dial"></div>
     <label>Reference note <select id="sound-reference" aria-label="Sound reference note"></select></label>
     <div class="rack-sound-actions">
      <button id="replace-row-sound" type="button">replace sound</button>
      <button id="save-row-sound" type="button">save sound preset</button>
      <button id="move-sound-up" type="button">Move up</button>
      <button id="move-sound-down" type="button">Move down</button>
      <button id="duplicate-sound" type="button">Duplicate sound</button>
      <button id="remove-sound" type="button">Remove sound</button>
     </div>
    </div>
    <div id="synth-editor" class="synth-editor" aria-label="Instrument sound controls"></div>
   `;
const pitchNames=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
export const noteLabelForPitch=pitch=>pitchNames[pitch%12]+(Math.floor(pitch/12)-1);
export function populateSoundInspectorReferenceNotes(control){
 if(!control||control.tagName!=="SELECT")throw Error("Sound Inspector requires a reference-note selector.");
 control.replaceChildren();
 for(let pitch=0;pitch<=127;pitch++){
  const option=document.createElement("option");
  option.textContent=noteLabelForPitch(pitch);
  option.value=String(pitch);
  control.append(option);
 }
 control.value="60";
}
// One physical desktop Inspector. Hosts move it rather than clone it.
let sharedFrame=null;
export const soundInspectorOwner=()=>sharedFrame?.owner??null;
export function mountSoundInspectorChrome(root,{owner="beat"}={}){
 if(!root)throw Error("Sound Inspector requires a mount element.");
 if(!sharedFrame){
  const template=document.createElement("template");template.innerHTML=SOUND_INSPECTOR_CHROME;
  const element=document.createElement("div");element.className="sound-inspector-frame";
  element.append(template.content.cloneNode(true));
  const nodes=new Map([...element.querySelectorAll("[id]")].map(node=>[node.id,node]));
  sharedFrame={element,owner,get:id=>nodes.get(id)??null};
 }
 const frame=sharedFrame;
 disposeSignalDisplay(frame.get("sound-visualizer"));
 frame.get("synth-editor").soundPanelView?.dispose();
 for(const visual of frame.element.querySelectorAll(".visual-sound-panel"))visual.disposeSoundIllustration?.();
 for(const node of frame.element.querySelectorAll(".sound-context-action"))node.remove();
 for(const node of frame.element.querySelectorAll("button,input,select")){node.onclick=null;node.onchange=null;}
 frame.get("instrument-actions").hidden=false;
 frame.get("change-sound").hidden=false;frame.get("change-sound").textContent="browse sounds";
 frame.get("instrument-name").disabled=false;
 frame.get("instrument-name").setAttribute("aria-label",owner==="vocal"?"Recording name":"Instrument name");
 frame.get("sound-close").hidden=false;
 frame.owner=owner;
 if(frame.element.parentElement!==root)root.append(frame.element);
 frame.root=root;
 return frame;
}
