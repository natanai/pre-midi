// Each illustration owns a visible panel. Repeated controls call the same
// canonical writers; they never own separate copies of the sound state.
import {explainLabel} from "./dial.js";
import {captureSoundControlView} from "./soundControlView.js";
export function collectSoundFields(root){
 const fields=new Map();
 for(const field of root.querySelectorAll("[data-sound-path]"))
  if(field.matches(".dial-field,.synth-field,.sample-pitch-setting")&&
   !field.closest(".visual-panel-area"))fields.set(field.dataset.soundPath,field);
 return fields;
}
function duplicateField(field){
 const copy=field.cloneSoundControl?.()??field.cloneNode(true);
 Object.assign(copy.dataset,field.dataset);
 const original=field.querySelector("select,input,[role='slider']"),input=copy.querySelector("select,input,[role='slider']");
 if(input&&original){
  input.setAttribute("aria-label",original.getAttribute("aria-label")||input.getAttribute("aria-label")||field.dataset.soundPath);
  if(!field.cloneSoundControl){
   input.value=original.value;input.checked=original.checked;
   input.addEventListener("change",()=>{
    const restore=captureSoundControlView(input);
    original.value=input.value;original.checked=input.checked;
    original.dispatchEvent(new Event("change",{bubbles:true}));
    restore();
   });
   const label=copy.querySelector("span");
   if(label)explainLabel(label,label.textContent,original.getAttribute("aria-description")||undefined);
  }
 }
 return copy;
}
export function soundPanelViews(patch,kind){
 const view=(id,title,keys,model=kind,page=0)=>({id,title,keys,kind:model,page});
 if(kind==="filter")return [
  view("response","filter",["filter.type","filter.cutoff","filter.resonance"]),
  ...(patch.type==="synth"?[view("sweep","filter sweep",["filter.cutoff","filter.sweep","filter.sweepTime"],"filter-sweep")]:[]),
  view("drive","distortion",["filter.type","filter.cutoff","filter.resonance",patch.type==="synth"?"effects.drive":"drive"],"distortion"),
  ...(patch.type==="synth"?[view("noise","noise",["noise","noiseDecay"],"noise")]:[])
 ];
 if(kind==="envelope")return [
  view("held","amplitude envelope",["envelope.attack","envelope.decay","envelope.sustain","envelope.release"]),
  view("short","short note envelope",["envelope.attack","envelope.decay","envelope.sustain","envelope.release"],kind,1)
 ];
 if(kind==="movement")return [
  view("glide","glide",["movement.glide","movement.glideTime"],"glide"),
  view("bend","pitch bend",["bend.shape","bend.amount","bend.rate"],"bend"),
  view("vibrato","vibrato",["movement.depth","movement.rate","movement.delay"],"vibrato"),
  view("pulse","volume pulse",["movement.tremolo","movement.tremoloRate"],"pulse"),
  ...([
   view("tone","tone movement",["filter.cutoff","movement.tone","movement.toneRate"],"tone-movement"),
   ...(patch.type==="synth"?[view("pan","stereo",["pan"],"stereo")]:[])])
 ];
 if(kind==="sample")return [
  view("envelope",patch.type==="vocal"?"recording fades":"recording envelope",["attack","release","oneShot","followPitch"]),
  view("pitch",patch.type==="vocal"?"recording pitch":"recording pitch & onset",["transpose","strumMs","followPitch"],"recording-pitch"),
  view("level","recording level",["gain","preserveDynamics"],"recording-level"),
  view("stereo","recording stereo",["gain","pan"],"stereo")
 ];
 if(kind==="mapping")return Array.from({length:Math.max(1,Math.ceil((patch.zones?.length??0)/4))},(_,i)=>
  view("roots-"+i,"sample mapping "+(i*4+1)+"–"+Math.min(patch.zones?.length??0,i*4+4),
   Array.from({length:4},(_,j)=>"zones."+(i*4+j)+".root"),kind,i));
 if(kind==="modulation"&&patch.modulation?.routes?.length){
  const routes=patch.modulation.routes,offset=Math.max(1,Math.ceil(routes.length/4));
  return routes.map((route,i)=>({...view(route.id,"movement "+(i+1),[],kind,offset+i),route:i}));
 }
 return [{id:"main",kind,page:0,whole:true}];
}
const openPanels=new Map();
export function layoutSoundPanels(details,kind,patch,onChange,onPreview,index,createPanel){
 details.populateMapping?.();
 const fields=details.soundFields??collectSoundFields(details),views=soundPanelViews(patch,kind);
 const rows=[...details.querySelectorAll(".modulation-route")];
 const add=kind==="modulation"?details.querySelector(":scope > button"):null;
 const panels=views.map((view,i)=>{
  const section=view.whole?details:document.createElement("details");
  const id=kind+"-"+index+"-"+view.id;
  if(!view.whole){
   section.className=details.className;
   const summary=document.createElement("summary");summary.textContent=view.title;section.append(summary);
   if(view.route!==undefined){
    const row=rows[view.route];row.querySelectorAll("details").forEach(d=>d.open=true);section.append(row);
   }else{
    const controls=document.createElement("div");controls.className="synth-fields";
    for(const key of view.keys){const field=fields.get(key);if(field)controls.append(duplicateField(field));}
    section.append(controls);
   }
   if(add&&i===views.length-1)section.append(add);
  }
  section.open=openPanels.get(id)??true;
  section.addEventListener("toggle",()=>openPanels.set(id,section.open));
  return createPanel(section,view.kind,patch,onChange,onPreview,index,{page:view.page,id});
 });
 // Split views duplicate or move their controls, so retire the source group.
 // Whole views already moved the source into their illustration wrapper.
 if(!views.some(view=>view.whole))details.remove();
 if(panels.length===1)return panels[0];
 const element=document.createElement("div");element.className="sound-module-stack";
 element.append(...panels.map(panel=>panel.element));
 return {element,draw:next=>panels.forEach(panel=>panel.draw(next))};
}
