import {movement,movementDefaults,BEND_SHAPES} from "./expression.js";
import {illustrateSoundPanel} from "./soundIllustrations.js";
import {assignSoundEdit} from "./soundEditPath.js";
import {createDial,explainLabel,helpForLabel} from "./dial.js";
import {sampleTone,SAMPLE_FILTERS,DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";
// Sample controls and synth controls share the same dial and visualization
// owner. All durable edits still flow through studio.js modify().
const sampleOpenStates=new Map();
export function activeSamplePanels(patch){
 const active=new Set(),tone=sampleTone(patch),move=movement(patch);
 if(JSON.stringify(tone.filter)!==JSON.stringify(DEFAULT_SAMPLE_FILTER)||tone.drive!==0)
  active.add("tone");
 if(Object.keys(movementDefaults).some(key=>move[key]!==movementDefaults[key])||
    (patch.bend?.shape??"straight")!=="straight"||(patch.bend?.amount??2)!==2||(patch.bend?.rate??4)!==4)
  active.add("movement");
 if((patch.gain??.9)!==.9||(patch.transpose??0)!==0||
    (patch.pan??0)!==0||(patch.strumMs??0)!==0||
    (patch.attack??.005)!==.005||(patch.release??.17)!==.17||
    !!patch.preserveDynamics)
  active.add("sample");
 return active;
}
export function renderSamplerEditor(root,patch,onChange,metadata,openUpload,onPreview=()=>{},soundId=null){
 const stateKey=soundId??patch;
 let expanded=sampleOpenStates.get(stateKey);
 if(!expanded){expanded=activeSamplePanels(patch);sampleOpenStates.set(stateKey,expanded);}

 root.replaceChildren();
 const header=document.createElement("div");header.className="sampler-description";
 const count=new Set(patch.zones.map(zone=>zone.root)).size;
 header.textContent=(metadata&&patch.zones.length<=8?metadata+" · ":"")+
  count+" recorded pitch"+(count===1?"":"es");
 root.append(header);
 // Direct sound shaping is prominent, including on imported and recorded audio.
 const tone=sampleTone(patch);
 const toneGroup=document.createElement("details");toneGroup.className="synth-group sample-tone";toneGroup.open=expanded.has("tone");
 toneGroup.addEventListener("toggle",()=>toneGroup.open?expanded.add("tone"):expanded.delete("tone"));
 const toneTitle=document.createElement("summary");toneTitle.textContent="Tone · filter & distortion";
 const toneFields=document.createElement("div");toneFields.className="synth-fields dial-grid";
 const filterLabel=document.createElement("label");filterLabel.className="synth-field";
 const filterTitle=document.createElement("span");filterTitle.textContent="filter type";
 explainLabel(filterTitle,"filter type");
 const filterSelect=document.createElement("select");filterSelect.setAttribute("aria-label","Recorded sound filter type");
 filterSelect.setAttribute("aria-description",helpForLabel("filter type"));
 for(const type of SAMPLE_FILTERS){
  const option=document.createElement("option");option.value=type;option.textContent=type;filterSelect.append(option);
 }
 filterSelect.value=tone.filter.type;
 filterSelect.addEventListener("change",()=>onChange(["filter"],{...tone.filter,type:filterSelect.value}));
 filterLabel.append(filterTitle,filterSelect);toneFields.append(filterLabel);
 for(const [key,label,min,max,step,display,log] of [
  ["resonance","Resonance",.1,16,.1,"number",false]
 ])toneFields.append(createDial({label,min,max,step,display,log,
  help:key==="cutoff"?(tone.filter.type==="lowpass"?"turn it down to muffle the high stuff":
   tone.filter.type==="highpass"?"turn it up to shave off the bass":
   "move the little window of sound up or down"):undefined},tone.filter[key],
  value=>onChange(["filter"],{...tone.filter,[key]:value}),
  value=>onPreview(["filter"],{...tone.filter,[key]:value})));
 toneFields.append(createDial({label:"Distortion",min:0,max:1,step:.01,display:"percent"},tone.drive,
  value=>onChange(["drive"],value),value=>onPreview(["drive"],value)));
 toneGroup.append(toneTitle,toneFields);root.append(toneGroup);
 const movementGroup=document.createElement("details");movementGroup.className="synth-group";movementGroup.open=expanded.has("movement");
 movementGroup.addEventListener("toggle",()=>movementGroup.open?expanded.add("movement"):expanded.delete("movement"));
 const movementTitle=document.createElement("summary");movementTitle.textContent="Pitch & movement";
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
  const parent=key==="glideTime"?"Glide from":
   ["rate","delay"].includes(key)?"Vibrato":key==="tremoloRate"?"Pulse":null;
  const inactive=parent==="Glide from"&&m.glide===0||
   parent==="Vibrato"&&m.depth===0||parent==="Pulse"&&m.tremolo===0;
  movementFields.append(createDial({label,min,max,step,display,disabled:inactive,
   disabledReason:inactive?"Adjust "+parent+" first.":undefined},m[key],
   value=>onChange(["movement"],{...movement(patch),[key]:value}),
   value=>onPreview(["movement",key],value)));
 }
 const bend=patch.bend||{shape:"straight",amount:2,rate:4};
 const shapeLabel=document.createElement("label");shapeLabel.className="synth-field";
 const title=document.createElement("span");title.textContent="bend shape";
 explainLabel(title,"bend shape");shapeLabel.append(title);
 const select=document.createElement("select");select.setAttribute("aria-label","Instrument bend shape");
 select.setAttribute("aria-description",helpForLabel("bend shape"));
 for(const [id,name] of BEND_SHAPES){const option=document.createElement("option");option.value=id;option.textContent=name;select.append(option);}
 select.value=bend.shape;
 select.addEventListener("change",()=>onChange(["bend"],{...bend,shape:select.value}));
 shapeLabel.append(select);movementFields.prepend(shapeLabel);
 for(const [key,label,min,max,step,display] of [
  ["amount","Bend amount",0,12,.25,"semitones"],
  ["rate","Wave speed",.1,12,.1,"hz"]
 ])movementFields.append(createDial({label,min,max,step,display,
  disabled:bend.shape==="straight",disabledReason:"Choose a bend shape other than Straight first."},bend[key],
  value=>onChange(["bend"],{...bend,[key]:value}),
  value=>onPreview(["bend",key],value)));
 movementGroup.append(movementTitle,movementFields);root.append(movementGroup);
 const details=document.createElement("details");details.className="synth-group sample-shaping";details.open=expanded.has("sample");
 details.addEventListener("toggle",()=>details.open?expanded.add("sample"):expanded.delete("sample"));
 const summary=document.createElement("summary");summary.textContent="Sample & articulation";
 const fields=document.createElement("div");fields.className="synth-fields dial-grid";
 const configs=[
  ["gain","Level",0,2,.01,"percent"],
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
 // Keep the same diagrams and direct manipulation for recorded instruments.
 // These wrappers leave the actual sampler dials and mapping controls intact.
 const visuals=[];
 const preview=(path,value)=>{
  onPreview(path,value);
  if(!path?.length)return;
  const next=structuredClone(patch);
  assignSoundEdit(next,path,value);
  for(const visual of visuals)visual.draw(next);
 };
 for(const [section,kind] of [[toneGroup,"filter"],[movementGroup,"movement"],[details,"sample"]]){
  // illustrateSoundPanel moves section inside its new wrapper. Anchor the
  // original position *before* wrapping; replacing section afterward would
  // attempt to insert the wrapper into its own child.
  const anchor=document.createComment("sound visual position");
  section.before(anchor);
  const visual=illustrateSoundPanel(section,kind,patch,onChange,preview);
  visuals.push(visual);
  anchor.replaceWith(visual.element);
 }
 const action=document.createElement("button");action.type="button";action.className="sample-replace-action";
 action.textContent="Replace with my audio…";action.addEventListener("click",openUpload);
 root.append(action);
}
