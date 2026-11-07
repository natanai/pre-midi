// Freeform uses the canonical Beat synth, sampler, sound illustration and DSP patches.
// This is a desktop panel, not a second sound-engine implementation.
import {renderSoundInspectorCore,auditionSoundInspector,bindSoundInspectorIdentity,bindSoundInspectorCatalogActions,mountSoundInspectorChrome,populateSoundInspectorReferenceNotes} from "./soundInspector.js";
import {assignSoundEdit} from "./soundEditPath.js";
import {createSignalDisplay} from "./soundScope.js";
import {audition} from "./audio.js";
import {clone,id,makeSound} from "./schema.js";
import {makePatch} from "./synth.js";
import {movementDefaults} from "./expression.js";
import {MAX_SOUNDS,referencedSampleIds} from "./soundModel.js";
import {makeSampleAsset,MAX_SAMPLE_BYTES} from "./sampler.js";
import {moveRackSoundRow} from "./entityActions.js";
import {resolveFreeformInstrument} from "./freeformModel.js";

const el=(tag,cls,text)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined)e.textContent=text;return e;
};
const button=(label,fn,cls)=>{
 const e=el("button",cls,label);e.type="button";if(fn)e.addEventListener("click",fn);return e;
};
const field=(title,control)=>{
 const label=el("label","freeform-sound-field");
 label.append(el("span","",title),control);return label;
};
const mimeFor=file=>{
 const ext=file.name.toLowerCase().split(".").at(-1);
 const types={wav:"audio/wav",ogg:"audio/ogg",mp3:"audio/mpeg"};
 if(!types[ext])throw Error("Choose WAV, OGG or MP3 audio.");
 return types[ext];
};
const initialSample=(assetId,root,layout)=>({
 type:"sample",presetId:"custom",zones:[{assetId,root}],
 followPitch:layout!=="rack",oneShot:layout==="rack",transpose:0,
 gain:.9,attack:.005,release:.17,pan:0,strumMs:0,preserveDynamics:false,
 movement:{...movementDefaults},bend:{shape:"straight",amount:2,rate:4}
});
export function installFreeformSoundUI({getSong,getLayer,getInstrument,mutate,onError,onBrowseSound=()=>{},onSaveSound=()=>{},getAccent=()=>"#08e4ec",onClose=()=>{}}){
 let host=el("section","sound-section freeform-sound-host");
 const scope=el("div","freeform-sound-scope");
 const input=el("input");input.type="file";
 input.accept=".wav,.ogg,.mp3,audio/wav,audio/ogg,audio/mpeg";input.hidden=true;
 input.setAttribute("aria-label","Import audio into freeform Sound");
 const selected=new Map(),previewPositions=new Map(),auditionRequests=new Map();
 const framePrefix="freeform-sound-"+id()+"-";
 let stagePanel=null,stageOpen=false;
 const current=()=>{
  const inst=getInstrument();
  if(!inst)return null;
  const sound=inst.sounds.find(item=>item.id===selected.get(inst.id))||inst.sounds[0];
  return sound?{inst,sound,layer:getLayer(),song:getSong()}:null;
 };
 const context=ctx=>({samples:ctx.layer.samples,bpm:ctx.song.bpm,bars:1,instruments:[ctx.inst]});
 let scopeUpdate=null,scopeKey="";
 const visualize=(ctx,patch=ctx.sound.patch,level=ctx.inst.volume*ctx.sound.gain)=>{
  // The existing scope is the real PCM measurement. Keep its SVG and A/B
  // state during dial previews, but recreate it when the sound identity,
  // sample asset set or reference pitch changes.
  const key=ctx.sound.id+"|"+ctx.sound.patch.type+"|"+
   ctx.sound.referencePitch+"|"+ctx.layer.samples.map(asset=>asset.id).join(",");
  if(scopeKey!==key||!scopeUpdate){
   scopeUpdate=createSignalDisplay(scope,patch,context(ctx),getAccent(),
    level,ctx.sound.referencePitch,null,ctx.sound.id);
   scopeKey=key;
  }else scopeUpdate(patch,level);
 };
 const mutateSelected=(callback,expectedId=null)=>mutate(()=>{
  const ctx=current();
  if(!ctx||expectedId&&ctx.sound.id!==expectedId)throw Error("Sound selection changed.");
  callback(ctx);
 });
 const patchChange=(path,value)=>{
  const expected=current()?.sound.id;
  mutateSelected(({sound})=>{
   assignSoundEdit(sound.patch,path,value);
   sound.patch.presetId="custom";
   if(sound.patch.modulation!==undefined)sound.patch.version=2;
  },expected);
 };
 const preview=()=>{
  const ctx=current();if(!ctx)return;
  const button=host.querySelector(".sound-preview-play");
  if(!button)return;
  return auditionSoundInspector({
   instrument:ctx.inst,sound:ctx.sound,context:context(ctx),
   button,previewPositions,auditionRequests,play:audition,duration:.4,
   isCurrent:()=>current()?.inst.id===ctx.inst.id&&current()?.sound.id===ctx.sound.id,
   onError:error=>onError("Sound preview: "+error.message)
  });
 };
 input.addEventListener("change",async()=>{
  const file=input.files?.[0];input.value="";
  if(!file)return;
  const original=current();if(!original)return;
  try{
   if(file.size>MAX_SAMPLE_BYTES)throw Error("Audio is above the 1 MB sample limit.");
   const type=mimeFor(file);
   const bytes=new Uint8Array(await file.arrayBuffer());
   const asset=makeSampleAsset("freeform-sample-"+id(),file.name.slice(0,80),
    type,bytes,"Freeform Sound import");
   mutateSelected(({sound,inst,layer})=>{
    const previous=sound.patch,root=sound.referencePitch;
    sound.patch=previous.type==="sample"?
     {...previous,presetId:"custom",zones:[{assetId:asset.id,root}]}:
     initialSample(asset.id,root,inst.layout);
    sound.name=file.name.replace(/\.[^.]+$/,"").slice(0,60)||"Audio";
    layer.samples.push(asset);
    const needed=referencedSampleIds(layer.instruments.map(item=>
     resolveFreeformInstrument(getSong(),item)));
    layer.samples=layer.samples.filter(entry=>needed.has(entry.id));
   },original.sound.id);
  }catch(error){onError("Audio import: "+error.message);}
 });
 function render(target=host){
  if(target!==host){host=target;host.classList.add("freeform-sound-host");}
  // The scope element survives Sound redraws to preserve A/B measurements.
  // Its old graph does not: detach listeners and rebuild the direct editor
  // for the currently selected Sound.
  if(stagePanel){
   stageOpen=scope.querySelector(
    '.visual-sound-panel[data-visual-kind="stage"] details')?.open??stageOpen;
   stagePanel.element.disposeSoundIllustration?.();
   stagePanel.element.remove();
   stagePanel=null;
  }
  for(const visual of host.querySelectorAll(".visual-sound-panel"))
   visual.disposeSoundIllustration?.();
  const ctx=current();
  if(!ctx){host.hidden=true;host.replaceChildren();return host;}
  host.hidden=false;host.replaceChildren();
  const content=host;
  const frame=mountSoundInspectorChrome(content,{idPrefix:framePrefix});
  const get=frame.get;
  const modules=get("synth-editor");
  modules.classList.add("freeform-sound-modules");
  const volumeRoot=get("instrument-volume-dial");
  const gainRoot=get("sound-volume-dial");
  const primaryRoots=["primary-brightness-dial","primary-attack-dial",
   "primary-release-dial"].map(get);
  get("sound-visualizer").append(scope);
  const instrumentName=get("instrument-name");
  instrumentName.value=ctx.inst.name;
  instrumentName.onchange=()=>mutateSelected(({inst})=>{
   inst.name=instrumentName.value.trim()||"Instrument";
  },ctx.sound.id);
  // Instrument conversion and deletion live in the parent freeform lane.
  // The shared Inspector must not invent another instrument command system.
  get("instrument-actions").remove();
  get("sound-close").onclick=onClose;
  get("sound-controls").hidden=ctx.inst.layout!=="rack";
  const nameInput=get("sound-name"),referenceInput=get("sound-reference");
  populateSoundInspectorReferenceNotes(referenceInput);
  bindSoundInspectorIdentity({
   sound:ctx.sound,nameInput,referenceInput,
   onRename:value=>mutateSelected(({sound})=>{sound.name=value;},ctx.sound.id),
   onReferencePitch:value=>mutateSelected(({sound})=>{sound.referencePitch=value;},ctx.sound.id)
  });
  const listen=get("hear-sound");
  listen.classList.add("freeform-sound-play");
  listen.onclick=preview;
  listen.title="Hear this Sound using the active desktop audio host";
  const browse=get("change-sound"),save=get("save-sound");
  // Keep stable selectors for Song keyboard/browser automation. These are
  // aliases on the exact same canonical controls, never duplicate buttons.
  browse.classList.add("freeform-sound-browse");
  save.classList.add("freeform-sound-save");
  const importAudio=button("use audio",null,"freeform-sound-load");
  content.querySelector(".sound-actions").append(importAudio);
  const rackActions=content.querySelector(".rack-sound-actions");
  const rack=ctx.inst.layout==="rack";
  for(const key of ["replace-row-sound","save-row-sound","move-sound-up",
   "move-sound-down","duplicate-sound","remove-sound"])
   get(key).hidden=!rack;
  let saveRack=null;
  if(rack){
   const pick=el("select");pick.setAttribute("aria-label","Freeform Sound");
   for(const sound of ctx.inst.sounds){
    const option=el("option","",sound.name);option.value=sound.id;pick.append(option);
   }
   pick.value=ctx.sound.id;
   pick.onchange=()=>{selected.set(ctx.inst.id,pick.value);render();};
   get("sound-controls").prepend(field("rack sound",pick));
   saveRack=button("save rack",null,"freeform-rack-save");
   rackActions.append(saveRack);
   const index=ctx.inst.sounds.findIndex(entry=>entry.id===ctx.sound.id);
   get("move-sound-up").disabled=index<=0;
   get("move-sound-down").disabled=index>=ctx.inst.sounds.length-1;
   get("move-sound-up").onclick=()=>mutateSelected(({inst,sound})=>{
    moveRackSoundRow(inst,sound.id,-1);
   },ctx.sound.id);
   get("move-sound-down").onclick=()=>mutateSelected(({inst,sound})=>{
    moveRackSoundRow(inst,sound.id,1);
   },ctx.sound.id);
   const add=button("+ sound",()=>mutateSelected(({inst})=>{
    if(inst.sounds.length>=MAX_SOUNDS)throw Error("Rack holds at most 64 Sounds.");
    const entry=makeSound("Sound "+(inst.sounds.length+1),makePatch(),"hit");
    inst.sounds.push(entry);selected.set(inst.id,entry.id);
   },ctx.sound.id),"freeform-sound-add");
   rackActions.append(add);
   get("duplicate-sound").disabled=ctx.inst.sounds.length>=MAX_SOUNDS;
   get("duplicate-sound").onclick=()=>mutateSelected(({inst,sound})=>{
    if(inst.sounds.length>=MAX_SOUNDS)throw Error("Rack holds at most 64 Sounds.");
    const entry=clone(sound);entry.id=id();entry.name=(entry.name+" copy").slice(0,60);
    inst.sounds.push(entry);selected.set(inst.id,entry.id);
   },ctx.sound.id);
   get("remove-sound").onclick=()=>mutateSelected(({inst,sound,layer})=>{
    if(inst.sounds.length===1)throw Error("A Rack requires at least one Sound.");
    if(inst.notes.some(note=>note.soundId===sound.id)||
      inst.chunks.some(chunk=>chunk.notes.some(note=>note.soundId===sound.id)))
      throw Error("Remove notes assigned to this Sound before deleting it.");
    inst.sounds=inst.sounds.filter(entry=>entry.id!==sound.id);
    selected.delete(inst.id);
    const needed=referencedSampleIds(layer.instruments);
    layer.samples=layer.samples.filter(asset=>needed.has(asset.id));
   },ctx.sound.id);
  }
  bindSoundInspectorCatalogActions({
   instrument:ctx.inst,browseButton:browse,saveButton:save,
   rowBrowseButton:get("replace-row-sound"),rowSaveButton:get("save-row-sound"),
   browseMode:rack?"replace-row":"replace",
   saveWholeRack:false,rackSaveButton:saveRack,importButton:importAudio,
   onBrowse:mode=>onBrowseSound({
    mode,instrumentId:ctx.inst.id,soundId:ctx.sound.id
   }),
   onSave:wholeRack=>onSaveSound({
    instrumentId:ctx.inst.id,soundId:ctx.sound.id,wholeRack
   }),
   onImport:()=>input.click()
  });
  content.append(input);
  const inspector=renderSoundInspectorCore({
   instrument:ctx.inst,sound:ctx.sound,context:context(ctx),
   modulesRoot:modules,scopeRoot:scope,
   volumeRoot,gainRoot,primaryRoots,
   accent:getAccent(),
   sampleNames:ctx.sound.patch.type==="sample"?ctx.sound.patch.zones.map(zone=>
    ctx.layer.samples.find(asset=>asset.id===zone.assetId)?.name||zone.assetId).join(" / "):"",
   onReplaceSample:()=>input.click(),
   onPatchChange:patchChange,
   scopeRenderer:(patch,level)=>{
    visualize(ctx,patch,level);
    return (next,amount)=>visualize(ctx,next,amount);
   },
   stageOpen,
   onLevelChange:(key,value)=>mutateSelected(({inst,sound})=>{
    if(key==="volume")inst.volume=value;
    else sound.gain=value;
   },ctx.sound.id),
   onStageChange:edits=>mutateSelected(({inst,sound})=>{
    for(const [keys,value] of edits){
     if(keys[0]==="volume")inst.volume=value;
     else if(keys[0]==="gain")sound.gain=value;
     else if(keys[0]==="pan"){
      sound.patch.pan=value;
      sound.patch.presetId="custom";
     }
    }
   },ctx.sound.id)
  });
  stagePanel=inspector.stagePanel;
  return host;
 }
 return {render,getSelectedSound:()=>current()?.sound,
  selectSound(instrumentId,soundId){
   selected.set(instrumentId,soundId);
   render();
  }
 };
}
