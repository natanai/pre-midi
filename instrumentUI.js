import {soundField,readSoundParameter,soundCapability} from "./soundParameterAdapter.js";
import {mountSoundPanelView} from "./soundPanelView.js";
import {renderModulationEditor} from "./modulationUI.js";
import {illustrateSoundPanel} from "./soundIllustrations.js";
import {collectSoundFields} from "./soundPanelLayout.js";
import {assignSoundEdit} from "./soundEditPath.js";
// Controls are generated from the same patch keys validated by synth.js.
// All edits go through the caller's one canonical beat mutation pathway.
import {makePatch} from "./synth.js";
import { createDial,explainLabel,helpForLabel } from "./dial.js";
import {HARMONIC_COUNT,harmonicRecipe} from "./harmonics.js";
// Quick controls and their module copies edit the same canonical fields.
const field=(id,label,options={})=>soundField(id,"synth",{label,...options});
export const PRIMARY_SYNTH_FIELDS=Object.freeze([
 field("filter.cutoff","brightness"),field("envelope.attack","attack"),field("envelope.release","release")
]);
const groups=[
 {name:"Oscillators",fields:[]},
 {name:"Envelope",open:false,fields:[PRIMARY_SYNTH_FIELDS[1],field("envelope.decay","Decay"),field("envelope.sustain","Sustain"),PRIMARY_SYNTH_FIELDS[2]]},
 {name:"Filter & noise",open:false,fields:[
  PRIMARY_SYNTH_FIELDS[0],field("filter.type","Filter"),field("filter.resonance","Resonance"),
  field("effects.drive","Distortion"),field("filter.sweep","Filter sweep"),field("filter.sweepTime","Sweep time"),
  field("noise","Noise"),field("noiseDecay","Noise decay")
 ]},
 {name:"Pitch & movement",open:false,fields:[
  field("bend.shape","Bend shape"),field("bend.amount","Bend amount"),field("bend.rate","Wave speed"),
  field("movement.rate","Vibrato speed"),field("movement.depth","Vibrato"),field("movement.delay","Vibrato waits"),
  field("movement.glide","Glide from"),field("movement.glideTime","Glide time"),
  field("movement.tremolo","Pulse"),field("movement.tremoloRate","Pulse speed"),
  field("movement.tone","Tone wave"),field("movement.toneRate","Tone speed"),field("pan","Pan")
 ]},
 {name:"Delay",open:false,fields:[field("effects.delayMix","Delay"),field("effects.delayTime","Delay time"),field("effects.delayFeedback","Feedback")]}
];
const oscillatorFields=index=>[
 field(`oscillators.${index}.wave`,"Wave"),field(`oscillators.${index}.level`,"Level"),
 (()=>{const f=field(`oscillators.${index}.octave`,"Octave");return {...f,options:Array.from({length:f.max-f.min+1},(_,i)=>f.min+i)};})(),
 field(`oscillators.${index}.detune`,"Detune")
];
const editorStates=new Map();
const init=makePatch("init");
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// These are the true factory init parameters, not the patch's preset ID.
// A sound opens its modified modules initially, but manual choices are retained.
export function activeSoundPanels(patch){
 const active=new Set();
 if(patch?.type!=="synth")return active;
 if(!equal(patch.oscillators,init.oscillators))active.add("Oscillators");
 if(!equal(patch.envelope,init.envelope))active.add("Envelope");
 if(!equal(patch.filter,init.filter)||patch.noise!==init.noise||
    (patch.noiseDecay??0)!==(init.noiseDecay??0)||
    (patch.effects?.drive??0)!==init.effects.drive)active.add("Filter & noise");
 if(!equal({...init.movement,...patch.movement},init.movement)||
    !equal(patch.bend,init.bend)||(patch.pan??0)!==(init.pan??0))active.add("Pitch & movement");
 if((patch.effects?.delayMix??0)!==init.effects.delayMix||
    (patch.effects?.delayTime??init.effects.delayTime)!==init.effects.delayTime||
    (patch.effects?.delayFeedback??init.effects.delayFeedback)!==init.effects.delayFeedback)
  active.add("Delay");
 if((patch.modulation?.routes??[]).length)active.add("movement routes");
 return active;
}
const oscillatorTwoActive=patch=>Number(patch.oscillators?.[1]?.level)>0||
 (patch.modulation?.routes??[]).some(route=>route.target==="oscillators.1.level");
// Common musical edits stay first; deeper controls reuse the same patch fields.
const fieldTitle=field=>field.label+" ("+field.path.join(".")+")";
function renderField(field,patch,onChange,onPreview){
 const value=readSoundParameter(patch,field.path.join("."));
 const capability=soundCapability(patch,field.path);
 // The value can be prepared even while its parent effect is silent.
 // Clearly distinguish "inaudible right now" from "feature unavailable".
 const inactiveReason=capability.state==="inactive"?capability.reason+"; the dashed curve is a reference guide":undefined;
 const inactiveLabel=capability.state==="inactive"?"inactive · "+capability.reason:undefined;
 const cutoffHint=field.path[0]==="filter"&&field.path[1]==="cutoff"?
  patch.filter.type==="lowpass"?"turn it down to muffle the high stuff":
  patch.filter.type==="highpass"?"turn it up to shave off the bass":
  patch.filter.type==="bandpass"?"move the little window of sound up or down":null:null;
 if(!field.options){
  const control=createDial({...field,help:cutoffHint??field.help,
   inactiveReason,inactiveLabel},value,
   next=>onChange(field.path,next),
   next=>onPreview(field.path,next));
  control.dataset.soundPath=field.path.join(".");
  return control;
 }
 const label=document.createElement("label");
 label.className="synth-field";
 label.dataset.soundPath=field.path.join(".");
 const title=document.createElement("span");title.textContent=field.label.toLowerCase();
 explainLabel(title,field.label);label.append(title);
 const input=document.createElement("select");
 input.setAttribute("aria-label",fieldTitle(field));
 if(helpForLabel(field.label))input.setAttribute("aria-description",helpForLabel(field.label));
 for(const optionValue of field.options) {
  const option=document.createElement("option");
  option.value=String(optionValue);
  option.textContent=String(optionValue).replace(/^./,s=>s.toUpperCase());
  input.append(option);
 }
 input.value=String(value);
 input.addEventListener("change",()=>{
  if(field.path[0]==="oscillators"&&field.path[2]==="wave"&&input.value==="harmonic"){
   const index=field.path[1],slot=patch.oscillators[index];
   onChange(["oscillators",index],{...slot,wave:"harmonic",harmonics:slot.harmonics||harmonicRecipe()});
  }else onChange(field.path,typeof value==="number"?Number(input.value):input.value);
 });
 label.append(input);
 return label;
}
function harmonicControls(patch,index,onChange,preview,expanded,panels,soundId){
 const section=document.createElement("section");
 section.className="harmonic-editor";
 section.setAttribute("aria-label","Oscillator "+(index+1)+" harmonics");
 const recipes=document.createElement("div");recipes.className="harmonic-recipes";
 for(const shape of ["sine","saw","odd"]){
  const button=document.createElement("button");button.type="button";
  button.textContent=shape==="odd"?"Odd harmonics":shape==="saw"?"All harmonics":"Fundamental";
  button.addEventListener("click",()=>onChange(["oscillators",index,"harmonics"],harmonicRecipe(shape)));
  recipes.append(button);
 }
 section.append(recipes);
 // All 32 partials and their controls share one unpaged spectral drawing.
 const details=document.createElement("details");details.className="synth-group";
 details.open=true;
 const heading=document.createElement("summary");heading.textContent="harmonic spectrum";
 details.append(heading);
 const illustration=illustrateSoundPanel(details,"harmonics"+index,patch,onChange,preview,(soundId??"sound")+"-"+index);
 panels.push(illustration);
 section.prepend(illustration.element);
 const first=document.createElement("div");first.className="synth-fields harmonic-fields";
 for(let n=0;n<HARMONIC_COUNT;n++){
  const field={label:n===0?"H1 · Root":"H"+(n+1),min:0,max:1,step:.01,display:"percent",defaultValue:n===0?1:0};
  const dial=createDial(field,patch.oscillators[index].harmonics[n],
   value=>onChange(["oscillators",index,"harmonics",n],value),
   value=>preview(["oscillators",index,"harmonics",n],value));
  dial.querySelector('[role="slider"]').setAttribute("aria-label","Oscillator "+(index+1)+" harmonic "+(n+1));
  dial.dataset.soundPath=["oscillators",index,"harmonics",n].join(".");
  first.append(dial);
 }

 // Controls belong to their own diagram disclosure, so focusing a spectrum
 // bar can reveal and focus its original dial (including H9–H32).
 details.append(recipes,first);
 return section;
}
export function renderPatchEditor(root,patch,onChange,onPreview=()=>{},soundId=null,{deferView=false}={}) {
 root.soundPanelView?.dispose();
 root.replaceChildren();
 const grid=document.createElement("div");
 grid.className="synth-grid";
 const panels=[],sections=[];
 const stateKey=soundId??patch;
 let expanded=editorStates.get(stateKey);
 if(!expanded){expanded=activeSoundPanels(patch);editorStates.set(stateKey,expanded);}
 const preview=(path,value)=>{
  onPreview(path,value);
  if(!path.length)return;
  const current=structuredClone(patch);
  assignSoundEdit(current,path,value);
  for(const panel of panels)panel.draw(current);
 };
 for(const group of groups){
  const details=document.createElement("details");details.className="synth-group";
  details.open=expanded.has(group.name);
  details.addEventListener("toggle",()=>details.open?expanded.add(group.name):expanded.delete(group.name));
  const summary=document.createElement("summary");
  summary.textContent=group.name==="Filter & noise"?"filter, distortion & noise":group.name;
  details.append(summary);
  if(group.name==="Oscillators"){
   const container=document.createElement("div");container.className="oscillator-stack";
   const activeSecond=oscillatorTwoActive(patch);
   for(const index of activeSecond?[0,1]:[0]){
    const block=document.createElement("section");
    block.className="oscillator-unit";block.dataset.oscillator=String(index+1);
    const head=document.createElement("div");head.className="oscillator-unit-heading";
    const name=document.createElement("span");name.textContent="oscillator "+(index+1);
    head.append(name);
    if(index===1){
     const remove=document.createElement("button");remove.type="button";
     remove.className="oscillator-remove";remove.textContent="remove";
     remove.title="remove oscillator 2 from this sound";
     remove.addEventListener("click",()=>onChange(["oscillators",1,"level"],0));
     head.append(remove);
    }
    const fields=document.createElement("div");fields.className="synth-fields";
    for(const field of oscillatorFields(index))fields.append(renderField(field,patch,onChange,preview));
    block.append(head,fields);
    if(patch.oscillators[index].wave==="harmonic")
     block.append(harmonicControls(patch,index,onChange,preview,expanded,panels,soundId));
    container.append(block);
   }
   if(!activeSecond){
    const add=document.createElement("button");add.type="button";
    add.className="oscillator-add";add.textContent="add oscillator";
    add.addEventListener("click",()=>onChange(["oscillators",1,"level"],.25));
    container.append(add);
   }
   details.append(container);
  }else{
   const fields=document.createElement("div");fields.className="synth-fields";
   for(const field of group.fields)fields.append(renderField(field,patch,onChange,preview));
   details.append(fields);
  }
  const kind=group.name==="Oscillators"?"oscillators":
   group.name==="Envelope"?"envelope":group.name==="Filter & noise"?"filter":
   group.name==="Pitch & movement"?"movement":"delay";
  sections.push([details,kind]);grid.append(details);
 }
 const modulation=renderModulationEditor(patch,onChange,soundId,preview);
 grid.append(modulation);sections.push([modulation,"modulation"]);
 const fields=collectSoundFields(grid);
 for(const [details,kind] of sections){
  const anchor=document.createComment("sound module");details.before(anchor);
  details.soundFields=fields;
  const panel=illustrateSoundPanel(details,kind,patch,onChange,preview,soundId??0);
  panels.push(panel);anchor.replaceWith(panel.element);
 }
 root.append(grid);
 if(!deferView)mountSoundPanelView(root);
}
