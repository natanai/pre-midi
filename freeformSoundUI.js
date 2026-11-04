// Freeform uses the canonical Beat synth, sampler, sound illustration and DSP patches.
// This is a desktop panel, not a second sound-engine implementation.
import {renderPatchEditor} from "./instrumentUI.js";
import {renderSamplerEditor} from "./samplerUI.js";
import {assignSoundEdit} from "./soundEditPath.js";
import {createSignalDisplay} from "./soundScope.js";
import {createDial} from "./dial.js";
import {audition} from "./audio.js";
import {clone,id,makeSound} from "./schema.js";
import {makePatch} from "./synth.js";
import {movementDefaults} from "./expression.js";
import {MAX_SOUNDS,referencedSampleIds} from "./soundModel.js";
import {makeSampleAsset,MAX_SAMPLE_BYTES} from "./sampler.js";

const el=(tag,cls,text)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined)e.textContent=text;return e;
};
const button=(label,fn,cls)=>{
 const e=el("button",cls,label);e.type="button";e.addEventListener("click",fn);return e;
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
export function installFreeformSoundUI({getSong,getLayer,getInstrument,mutate,onError}){
 const host=el("div","freeform-sound-host");
 const scope=el("div","freeform-sound-scope");
 const modules=el("div","freeform-sound-modules synth-editor");
 const input=el("input");input.type="file";
 input.accept=".wav,.ogg,.mp3,audio/wav,audio/ogg,audio/mpeg";input.hidden=true;
 input.setAttribute("aria-label","Import audio into freeform Sound");
 const selected=new Map();
 let expanded=false;
 const current=()=>{
  const inst=getInstrument();
  if(!inst)return null;
  const sound=inst.sounds.find(item=>item.id===selected.get(inst.id))||inst.sounds[0];
  return sound?{inst,sound,layer:getLayer(),song:getSong()}:null;
 };
 const context=ctx=>({samples:ctx.layer.samples,bpm:ctx.song.bpm,bars:1,instruments:[ctx.inst]});
 const visualize=(ctx,patch=ctx.sound.patch,level=ctx.inst.volume*ctx.sound.gain)=>
  createSignalDisplay(scope,patch,context(ctx),"#86c6a7",level,ctx.sound.referencePitch,null,ctx.sound.id);
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
 const patchPreview=(path,value)=>{
  const ctx=current();if(!ctx)return;
  const next=clone(ctx.sound.patch);assignSoundEdit(next,path,value);
  visualize(ctx,next);
 };
 const preview=async()=>{
  const ctx=current();if(!ctx)return;
  try{await audition(ctx.inst,ctx.sound.referencePitch,context(ctx),{
   soundId:ctx.sound.id,duration:.4
  });}catch(error){onError("Sound preview: "+error.message);}
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
    const needed=referencedSampleIds(layer.instruments);
    layer.samples=layer.samples.filter(entry=>needed.has(entry.id));
   },original.sound.id);
  }catch(error){onError("Audio import: "+error.message);}
 });
 function render(){
  const ctx=current();
  if(!ctx){host.hidden=true;host.replaceChildren();return host;}
  host.hidden=false;host.replaceChildren();
  const details=el("details","freeform-sound-details");details.open=expanded;
  details.append(el("summary","freeform-sound-summary","sound · "+ctx.sound.name));
  details.addEventListener("toggle",()=>{
   if(expanded!==details.open){expanded=details.open;render();}
  });
  host.append(details);
  if(!expanded)return host;
  const tools=el("div","freeform-sound-tools");
  const label=el("input");label.type="text";label.value=ctx.sound.name;label.maxLength=60;
  label.setAttribute("aria-label","Freeform Sound name");
  label.addEventListener("change",()=>mutateSelected(({sound})=>{
   sound.name=label.value.trim()||"Sound";
  },ctx.sound.id));
  tools.append(field("name",label));
  if(ctx.inst.layout==="rack"){
   const pick=el("select");pick.setAttribute("aria-label","Freeform Sound");
   for(const sound of ctx.inst.sounds){
    const option=el("option","",sound.name);option.value=sound.id;pick.append(option);
   }
   pick.value=ctx.sound.id;
   pick.addEventListener("change",()=>{selected.set(ctx.inst.id,pick.value);render();});
   tools.append(field("rack sound",pick));
  }
  const listen=button("▶",preview,"freeform-sound-play");
  listen.title="Hear this Sound using the active desktop audio host";
  tools.append(listen,button("use audio",()=>input.click(),"freeform-sound-load"));
  const dials=el("div","freeform-sound-levels");
  dials.append(createDial({label:"volume",min:0,max:1,step:.01,display:"percent"},
   ctx.inst.volume,value=>mutateSelected(({inst})=>{inst.volume=value;},ctx.sound.id),
   value=>visualize(ctx,ctx.sound.patch,value*ctx.sound.gain)));
  dials.append(createDial({label:"sound level",min:0,max:1,step:.01,display:"percent"},
   ctx.sound.gain,value=>mutateSelected(({sound})=>{sound.gain=value;},ctx.sound.id),
   value=>visualize(ctx,ctx.sound.patch,ctx.inst.volume*value)));
  const pitch=el("input");pitch.type="number";pitch.step="1";pitch.min="0";pitch.max="127";
  pitch.value=String(ctx.sound.referencePitch);
  pitch.setAttribute("aria-label","Freeform Sound reference pitch");
  pitch.addEventListener("change",()=>{
   const value=Number(pitch.value);
   if(Number.isInteger(value))mutateSelected(({sound})=>{sound.referencePitch=value;},ctx.sound.id);
  });
  dials.append(field("reference pitch",pitch));
  if(ctx.inst.layout==="rack"){
   const actions=el("div","freeform-sound-actions");
   actions.append(button("+ sound",()=>mutateSelected(({inst})=>{
    if(inst.sounds.length>=MAX_SOUNDS)throw Error("Rack holds at most 64 Sounds.");
    const entry=makeSound("Sound "+(inst.sounds.length+1),makePatch(),"hit");
    inst.sounds.push(entry);selected.set(inst.id,entry.id);
   },ctx.sound.id),"freeform-sound-add"));
   actions.append(button("duplicate",()=>mutateSelected(({inst,sound})=>{
    if(inst.sounds.length>=MAX_SOUNDS)throw Error("Rack holds at most 64 Sounds.");
    const entry=clone(sound);entry.id=id();entry.name=(entry.name+" copy").slice(0,60);
    inst.sounds.push(entry);selected.set(inst.id,entry.id);
   },ctx.sound.id),"freeform-sound-copy"));
   actions.append(button("remove",()=>mutateSelected(({inst,sound,layer})=>{
    if(inst.sounds.length===1)throw Error("A Rack requires at least one Sound.");
    if(inst.notes.some(note=>note.soundId===sound.id)||
      inst.chunks.some(chunk=>chunk.notes.some(note=>note.soundId===sound.id)))
      throw Error("Remove notes assigned to this Sound before deleting it.");
    inst.sounds=inst.sounds.filter(entry=>entry.id!==sound.id);
    selected.delete(inst.id);
    const needed=referencedSampleIds(layer.instruments);
    layer.samples=layer.samples.filter(asset=>needed.has(asset.id));
   },ctx.sound.id),"freeform-sound-remove"));
   tools.append(actions);
  }
  details.append(tools,dials,scope,modules,input);
  visualize(ctx);
  if(ctx.sound.patch.type==="sample"){
   const names=ctx.sound.patch.zones.map(zone=>
    ctx.layer.samples.find(asset=>asset.id===zone.assetId)?.name||zone.assetId).join(" / ");
   renderSamplerEditor(modules,ctx.sound.patch,patchChange,names,()=>input.click(),patchPreview,ctx.sound.id);
  }else renderPatchEditor(modules,ctx.sound.patch,patchChange,patchPreview,ctx.sound.id);
  return host;
 }
 return {render,getSelectedSound:()=>current()?.sound};
}
