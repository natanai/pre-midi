import {movement,movementDefaults,BEND_SHAPES} from "./expression.js";
import {createDial} from "./dial.js";
// Sample controls and synth controls share the same dial and visualization
// owner. All durable edits still flow through studio.js modify().
export function renderSamplerEditor(root,patch,onChange,metadata,openUpload,onPreview=()=>{}){
 root.replaceChildren();
 const header=document.createElement("div");header.className="sampler-description";
 const count=new Set(patch.zones.map(zone=>zone.root)).size;
 header.textContent=(metadata&&patch.zones.length<=8?metadata+" · ":"")+
  count+" recorded pitch"+(count===1?"":"es");
 root.append(header);
 const movementGroup=document.createElement("details");movementGroup.className="synth-group";movementGroup.open=true;
 const movementTitle=document.createElement("summary");movementTitle.textContent="Movement";
 const movementFields=document.createElement("div");movementFields.className="synth-fields dial-grid";
 const m=movement(patch);
 const movements=[
  ["glide","Glide from",-12,12,.1,"semitones"],
  ["glideTime","Glide time",.01,3,.01,"seconds"],
  ["depth","Vibrato",0,100,1,"cents"],
  ["rate","Vibrato speed",.1,20,.1,"hz"],
  ["delay","Vibrato waits",0,3,.05,"seconds"],
  ["tremolo","Pulse",0,1,.01,"percent"],
  ["tremoloRate","Pulse speed",.1,20,.1,"hz"]
 ];
 for(const [key,label,min,max,step,display] of movements){
  movementFields.append(createDial({label,min,max,step,display},m[key],
   value=>onChange(["movement"],{...movement(patch),[key]:value}),
   value=>onPreview(["movement",key],value)));
 }
 const bend=patch.bend||{shape:"straight",amount:2,rate:4};
 const shapeLabel=document.createElement("label");shapeLabel.className="synth-field";
 const title=document.createElement("span");title.textContent="Bend shape";shapeLabel.append(title);
 const select=document.createElement("select");select.setAttribute("aria-label","Instrument bend shape");
 for(const [id,name] of BEND_SHAPES){const option=document.createElement("option");option.value=id;option.textContent=name;select.append(option);}
 select.value=bend.shape;
 select.addEventListener("change",()=>onChange(["bend"],{...bend,shape:select.value}));
 shapeLabel.append(select);movementFields.prepend(shapeLabel);
 for(const [key,label,min,max,step,display] of [
  ["amount","Bend amount",0,12,.25,"semitones"],
  ["rate","Wave speed",.1,12,.1,"hz"]
 ])movementFields.append(createDial({label,min,max,step,display},bend[key],
  value=>onChange(["bend"],{...bend,[key]:value}),
  value=>onPreview(["bend",key],value)));
 movementGroup.append(movementTitle,movementFields);root.append(movementGroup);
 const details=document.createElement("details");details.className="synth-group sample-shaping";
 const summary=document.createElement("summary");summary.textContent="Sample & articulation";
 const fields=document.createElement("div");fields.className="synth-fields dial-grid";
 const configs=[
  ["gain","Level",0,2,.01,"percent"],
  ["attack","Attack",0,2,.005,"seconds"],
  ["release","Release",.01,3,.01,"seconds"],
  ["transpose","Transpose",-24,24,1,"semitones"],
  ["pan","Pan",-1,1,.01,"pan"],
  ["strumMs","Strum",-25,25,1,"number"]
 ];
 for(const [key,label,min,max,step,display] of configs) {
  fields.append(createDial({label,min,max,step,display,
   format:key==="strumMs"?(value=>value===0?"Off":(value>0?"Down ":"Up ")+Math.abs(value)+" ms"):undefined
  },patch[key]??0,
   value=>onChange([key],value),
   value=>onPreview([key],value)));
 }
 const toggles=document.createElement("div");toggles.className="sample-toggles";
 const addToggle=(label,path,checked)=>{
  const control=document.createElement("label");control.className="sample-pitch-setting";
  const box=document.createElement("input");box.type="checkbox";box.checked=checked;
  box.addEventListener("change",()=>onChange([path],box.checked));
  control.append(box,document.createTextNode(label));toggles.append(control);
 };
 addToggle("Follow note pitch","followPitch",patch.followPitch);
 addToggle("Play full recording","oneShot",!!patch.oneShot);
 addToggle("Keep recorded dynamics","preserveDynamics",!!patch.preserveDynamics);
 details.append(summary,fields,toggles);root.append(details);
 const mapping=document.createElement("div");mapping.className="sample-zones";
 const notes=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
 const populateMapping=()=>patch.zones.forEach((zone,index)=>{
  const label=document.createElement("label");label.className="synth-field";
  const name=document.createElement("span");name.textContent="Sample "+(index+1)+" · recorded pitch";
  const select=document.createElement("select");
  select.setAttribute("aria-label","Sample "+(index+1)+" recorded note");
  for(let midi=36;midi<=96;midi++){
   const option=document.createElement("option");
   option.value=String(midi);
   option.textContent=notes[midi%12]+(Math.floor(midi/12)-1);
   select.append(option);
  }
  select.value=String(zone.root);
  select.addEventListener("change",()=>onChange(["zones",index,"root"],Number(select.value)));
  label.append(name,select);mapping.append(label);
 });
 if(patch.zones.length>8) {
  const details=document.createElement("details");details.className="sample-map-details";
  const summary=document.createElement("summary");
  const uniquePitches=new Set(patch.zones.map(zone=>zone.root));
  const dynamicLayers=new Set(patch.zones.map(zone=>zone.velocity).filter(x=>x!==undefined));
  summary.textContent="Recorded notes · "+uniquePitches.size+" pitches"+(
   dynamicLayers.size>1?" · "+dynamicLayers.size+" dynamics":"")+" · Edit mapping";
  details.append(summary,mapping);
  details.addEventListener("toggle",()=>{
   if(details.open && !mapping.childElementCount)populateMapping();
  });
  root.append(details);
 } else {
  populateMapping();
  root.append(mapping);
 }
 const action=document.createElement("button");action.type="button";action.className="sample-replace-action";
 action.textContent="Replace with my audio…";action.addEventListener("click",openUpload);
 root.append(action);
}
