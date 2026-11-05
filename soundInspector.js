// One canonical Sound Inspector renderer for both the Beat and the attached
// freeform Song context. Context adapters own undo, selection and asset access;
// this module alone owns the common controls, illustrations and scope layout.
// Do not add a second collection of sound controls in either caller.
import {renderPatchEditor,PRIMARY_SYNTH_FIELDS} from "./instrumentUI.js";
import {renderSamplerEditor} from "./samplerUI.js";
import {sampleTone} from "./audioEffects.js";
import {createDial} from "./dial.js";
import {createSignalDisplay} from "./soundScope.js";
import {illustrateSoundPanel} from "./soundIllustrations.js";
import {assignSoundEdit} from "./soundEditPath.js";
import {clone} from "./schema.js";
import {nextRackPreview} from "./rackPreview.js";

const sampleFields=[
 {label:"brightness",path:["filter"],min:50,max:14000,step:1,display:"hz",log:true},
 {label:"attack",path:["attack"],min:0,max:2,step:.005,display:"seconds"},
 {label:"release",path:["release"],min:.01,max:3,step:.01,display:"seconds"}
];

function stageState(instrument,patch,volume,gain,layout=instrument.layout){
 return {type:"stage",layout,pan:patch.pan??0,volume,gain};
}
function entries(path,value){
 return Array.isArray(path?.[0])?path.map((keys,i)=>[keys,value[i]]):[[path,value]];
}
// Both Beat and attached freeform use one preview policy. A Rack plays one
// Sound per click in row order; a pitched Instrument plays the selected Sound.
// The adapter supplies its own native-aware audio host and error reporting.
export function auditionSoundInspector({
 instrument,sound,context,button,previewPositions,play,onError=()=>{},duration=.6
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
 try{
  // No buffered selection is retained across clicks or context changes.
  return Promise.resolve(play(instrument,entry.referencePitch,context,{
   soundId:entry.id,duration
  })).catch(onError);
 }catch(error){onError(error);return Promise.resolve();}
}

// Sound identity is part of the shared Inspector, not an editor-specific
// data writer. Context adapters own the transaction and undo destination.
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
 saveButton.setAttribute("aria-label",saveWholeRack?"save rack preset":"save preset");
 if(rowBrowseButton)rowBrowseButton.onclick=()=>onBrowse("replace-row");
 if(rowSaveButton)rowSaveButton.onclick=()=>onSave(false);
 if(rackSaveButton)rackSaveButton.onclick=()=>onSave(true);
 if(importButton&&onImport)importButton.onclick=onImport;
}

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
 onCutoffAutomation=null,scopeRenderer=null,stageOpen=null
}){
 if(!instrument||!sound||!context||!modulesRoot||!scopeRoot||
  !volumeRoot||!gainRoot||primaryRoots?.length!==3||
  typeof onPatchChange!=="function"||typeof onLevelChange!=="function"||
  typeof onStageChange!=="function")
  throw Error("Sound Inspector requires a Sound, common roots and context edit adapters.");
 for(const panel of [modulesRoot,scopeRoot])
  for(const illustration of panel.querySelectorAll(".visual-sound-panel"))
   illustration.disposeSoundIllustration?.();
 const patch=sound.patch;
 const oldStage=stageOpen??scopeRoot.querySelector(
  '.visual-sound-panel[data-visual-kind="stage"] details')?.open??false;
 const level=instrument.volume*sound.gain;
 const updateScope=scopeRenderer?
  scopeRenderer(patch,level):
  createSignalDisplay(scopeRoot,patch,context,accent,level,
   sound.referencePitch,instrument.automation??null,sound.id);
 let stagePanel=null;
 const redraw=(next,volume=instrument.volume,gain=sound.gain)=>{
  updateScope(next,volume*gain);
  stagePanel?.draw(stageState(instrument,next,volume,gain,stageLayout??instrument.layout));
 };
 const preview=(path,value)=>{
  // Preview is ephemeral. Never mutate the authored patch before committing
  // to the Beat or Song history through its context-specific adapter.
  const next=clone(patch);
  assignSoundEdit(next,path,value);
  redraw(next);
  for(const panel of modulesRoot.querySelectorAll(".visual-sound-panel"))
   panel.drawSoundIllustration?.(next);
 };
 volumeRoot.replaceChildren(createDial({
  label:instrument.layout==="rack"?"rack volume":"volume",
  min:0,max:1,step:.01,display:"percent"
 },instrument.volume,value=>onLevelChange("volume",value),
 value=>redraw(patch,value,sound.gain)));
 volumeRoot.dataset.soundPath="volume";
 gainRoot.replaceChildren(createDial({
  label:"Sound level",min:0,max:1,step:.01,display:"percent"
 },sound.gain,value=>onLevelChange("gain",value),
 value=>redraw(patch,instrument.volume,value)));
 gainRoot.dataset.soundPath="gain";
 const fields=patch.type==="synth"?PRIMARY_SYNTH_FIELDS:sampleFields;
 fields.forEach((field,index)=>{
  const root=primaryRoots[index];root.replaceChildren();
  const sampleFilter=patch.type==="sample"&&index===0;
  const current=sampleFilter?sampleTone(patch).filter.cutoff:
   field.path.reduce((value,key)=>value?.[key],patch);
  const update=(value,apply)=>{
   if(sampleFilter)apply(["filter"],{...sampleTone(patch).filter,cutoff:value});
   else apply(field.path,value);
  };
  const filterType=patch.type==="sample"?sampleTone(patch).filter.type:patch.filter.type;
  const help=index===0?(filterType==="lowpass"?
   "turn it down to muffle the high stuff":"move the filter to reshape the sound"):undefined;
  root.append(createDial({...field,help},current,
   value=>update(value,onPatchChange),value=>update(value,preview)));
 });
 if(patch.type==="sample")
  renderSamplerEditor(modulesRoot,patch,onPatchChange,sampleNames,
   onReplaceSample,preview,sound.id);
 else{
  renderPatchEditor(modulesRoot,patch,onPatchChange,preview,sound.id);
  onCutoffAutomation?.(modulesRoot,instrument,context);
 }
 const kinds=["filter",patch.type==="sample"?"sample":"envelope",
  patch.type==="sample"?"sample":"envelope"];
 const paths=["filter.cutoff",patch.type==="sample"?"attack":"envelope.attack",
  patch.type==="sample"?"release":"envelope.release"];
 primaryRoots.forEach((root,index)=>{
  root.dataset.soundPath=paths[index];
  const container=modulesRoot.querySelector(
   '.visual-sound-panel[data-visual-kind="'+kinds[index]+'"] .synth-fields');
  if(container)container.prepend(root);
 });
 // The same real gain and pan illustration edits the corresponding ordinary
 // controls. Multi-axis gesture edits commit in one context transaction.
 const details=document.createElement("details");details.className="synth-group";
 details.open=oldStage;
 const summary=document.createElement("summary");
 summary.textContent=instrument.layout==="rack"?"gain staging":"stereo & volume";
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
 stagePanel=illustrateSoundPanel(details,"stage",
  stageState(instrument,patch,instrument.volume,sound.gain,stageLayout??instrument.layout),
  (path,value)=>editStage(path,value,true),
  (path,value)=>editStage(path,value,false),sound.id);
 scopeRoot.append(stagePanel.element);
 return {preview,redraw,stagePanel};
}
