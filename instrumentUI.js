import {renderModulationEditor} from "./modulationUI.js";
import {illustrateSoundPanel} from "./soundIllustrations.js";
// Controls are generated from the same patch keys validated by synth.js.
// All edits go through the caller's one canonical beat mutation pathway.
import { WAVES, FILTERS, makePatch } from "./synth.js";
import { BEND_SHAPES } from "./expression.js";
import { createDial,explainLabel,helpForLabel } from "./dial.js";
import {HARMONIC_COUNT,harmonicRecipe} from "./harmonics.js";
// These canonical descriptors render in the top Sound row, not a second
// accordion. They remain ordinary patch fields for native/browser parity.
export const PRIMARY_SYNTH_FIELDS=Object.freeze([
 {path:["filter","cutoff"],label:"brightness",min:50,max:14000,step:1,display:"hz",log:true},
 {path:["envelope","attack"],label:"attack",min:0,max:3,step:.01,display:"seconds"},
 {path:["envelope","release"],label:"release",min:.01,max:4,step:.01,display:"seconds"}
]);
const groups=[
 {name:"Oscillators",fields:[]},
 {name:"Envelope",open:false,fields:[
  {path:["envelope","decay"],label:"Decay",min:0,max:3,step:.01,display:"seconds"},
  {path:["envelope","sustain"],label:"Sustain",min:0,max:1,step:.01,display:"percent"}
 ]},
 {name:"Filter & noise",open:false,fields:[
  {path:["filter","type"],label:"Filter",options:FILTERS},
  {path:["filter","resonance"],label:"Resonance",min:.1,max:16,step:.1,display:"number"},
  {path:["filter","sweep"],label:"Filter sweep",min:-5,max:5,step:.1,display:"number",defaultValue:0},
  {path:["filter","sweepTime"],label:"Sweep time",min:.01,max:3,step:.01,display:"seconds",defaultValue:.2},
  {path:["noise"],label:"Noise",min:0,max:1,step:.01,display:"percent"},
  {path:["noiseDecay"],label:"Noise decay",min:0,max:4,step:.01,display:"seconds",defaultValue:0}
 ]},
 {name:"Pitch & movement",open:false,fields:[
  {path:["bend","shape"],label:"Bend shape",options:BEND_SHAPES.map(([id])=>id)},
  {path:["bend","amount"],label:"Bend amount",min:0,max:12,step:.25,display:"semitones"},
  {path:["bend","rate"],label:"Wave speed",min:.1,max:12,step:.1,display:"hz"},
  {path:["movement","rate"],label:"Vibrato rate",min:.1,max:20,step:.1,display:"hz"},
  {path:["movement","depth"],label:"Vibrato depth",min:0,max:100,step:1,display:"cents"},
  {path:["movement","delay"],label:"Vibrato waits",min:0,max:3,step:.05,display:"seconds"},
  {path:["movement","glide"],label:"Glide from",min:-12,max:12,step:.1,display:"semitones"},
  {path:["movement","glideTime"],label:"Glide time",min:.01,max:3,step:.01,display:"seconds"},
  {path:["movement","tremolo"],label:"Pulse amount",min:0,max:1,step:.01,display:"percent"},
  {path:["movement","tremoloRate"],label:"Pulse speed",min:.1,max:20,step:.1,display:"hz"},
  {path:["movement","tone"],label:"Tone wave",min:0,max:1,step:.01,display:"percent"},
  {path:["movement","toneRate"],label:"Tone speed",min:.1,max:20,step:.1,display:"hz"},
  {path:["pan"],label:"Pan",min:-1,max:1,step:.01,display:"pan"}
 ]},
 {name:"Distortion",open:false,fields:[
  {path:["effects","drive"],label:"Distortion",min:0,max:1,step:.01,display:"percent"}
 ]},
 {name:"Delay",open:false,fields:[
  {path:["effects","delayMix"],label:"Delay",min:0,max:1,step:.01,display:"percent"},
  {path:["effects","delayTime"],label:"Delay time",min:.05,max:1,step:.01,display:"seconds"},
  {path:["effects","delayFeedback"],label:"Feedback",min:0,max:.8,step:.01,display:"percent"}
 ]}
];
const oscillatorFields=index=>[
 {path:["oscillators",index,"wave"],label:"Wave",options:WAVES},
 {path:["oscillators",index,"level"],label:"Level",min:0,max:1,step:.01,display:"percent"},
 {path:["oscillators",index,"octave"],label:"Octave",options:[-2,-1,0,1,2]},
 {path:["oscillators",index,"detune"],label:"Detune",min:-100,max:100,step:1,display:"cents"}
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
    (patch.noiseDecay??0)!==(init.noiseDecay??0))active.add("Filter & noise");
 if(!equal({...init.movement,...patch.movement},init.movement)||
    !equal(patch.bend,init.bend)||(patch.pan??0)!==(init.pan??0))active.add("Pitch & movement");
 if((patch.effects?.drive??0)!==init.effects.drive)active.add("Distortion");
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
const pathValue=(obj,path)=>path.reduce((target,key)=>target?.[key],obj);
const fieldTitle=field=>field.label+" ("+field.path.join(".")+")";
function format(value,display) {
 if(display==="percent")return Math.round(value*100)+"%";
 if(display==="seconds")return Math.round(value*1000)+" ms";
 if(display==="hz")return value>=1000?(value/1000).toFixed(1)+" kHz":Math.round(value)+" Hz";
 if(display==="cents")return Math.round(value)+" ct";
 if(display==="semitones")return (value>0?"+":"")+Number(value.toFixed(1))+" st";
 if(display==="pan")return value===0?"C":value<0?"L "+Math.round(-value*100):"R "+Math.round(value*100);
 return Number(value).toFixed(1);
}
function sliderValue(field,value) {
 if(!field.log)return value;
 const position=(Math.log(value)-Math.log(field.min))/(Math.log(field.max)-Math.log(field.min));
 return Math.round(position*1000);
}
function fromSlider(field,value) {
 if(!field.log)return Number(value);
 return Math.max(field.min,Math.min(field.max,Math.round(Math.exp(
  Math.log(field.min)+(Math.log(field.max)-Math.log(field.min))*Number(value)/1000
 ))));
}
function renderField(field,patch,onChange,onPreview){
 const value=pathValue(patch,field.path) ?? (field.defaultValue??(field.path[0]==="bend"?
  (field.path[1]==="shape"?"straight":field.path[1]==="amount"?2:4):
  (field.options?field.options[0]:0)));
 const parent=field.path[0]==="filter"&&field.path[1]==="sweepTime"?"Filter sweep":
  field.path[0]==="noiseDecay"?"Noise":null;
 const disabled=parent==="Filter sweep"&&!(patch.filter?.sweep)||
  parent==="Noise"&&!patch.noise;
 const cutoffHint=field.path[0]==="filter"&&field.path[1]==="cutoff"?
  patch.filter.type==="lowpass"?"turn it down to muffle the high stuff":
  patch.filter.type==="highpass"?"turn it up to shave off the bass":
  patch.filter.type==="bandpass"?"move the little window of sound up or down":null:null;
 if(!field.options)return createDial({...field,disabled,help:cutoffHint??field.help,
  disabledReason:disabled?"Adjust "+parent+" first.":undefined},value,
  next=>onChange(field.path,next),
  next=>onPreview(field.path,next));
 const label=document.createElement("label");
 label.className="synth-field";
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
function harmonicControls(patch,index,onChange,preview,expanded){
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
 const first=document.createElement("div");first.className="synth-fields harmonic-fields";
 const more=document.createElement("details");more.className="harmonic-more";
 const key="Harmonics "+index;more.open=expanded.has(key);
 more.addEventListener("toggle",()=>more.open?expanded.add(key):expanded.delete(key));
 const heading=document.createElement("summary");heading.textContent="harmonics 9–32";
 const rest=document.createElement("div");rest.className="synth-fields harmonic-fields";
 for(let n=0;n<HARMONIC_COUNT;n++){
  const field={label:n===0?"H1 · Root":"H"+(n+1),min:0,max:1,step:.01,display:"percent",defaultValue:n===0?1:0};
  const dial=createDial(field,patch.oscillators[index].harmonics[n],
   value=>onChange(["oscillators",index,"harmonics",n],value),
   value=>preview(["oscillators",index,"harmonics",n],value));
  dial.querySelector('[role="slider"]').setAttribute("aria-label","Oscillator "+(index+1)+" harmonic "+(n+1));
  (n<8?first:rest).append(dial);
 }
 more.append(heading,rest);section.append(first,more);
 return section;
}
export function renderPatchEditor(root,patch,onChange,onPreview=()=>{},soundId=null) {
 root.replaceChildren();
 const grid=document.createElement("div");
 grid.className="synth-grid";
 const panels=[];
 const stateKey=soundId??patch;
 let expanded=editorStates.get(stateKey);
 if(!expanded){expanded=activeSoundPanels(patch);editorStates.set(stateKey,expanded);}
 const preview=(path,value)=>{
  onPreview(path,value);
  if(!path.length)return;
  const current=structuredClone(patch);
  const updates=Array.isArray(path[0])?path.map((key,i)=>[key,value[i]]):[[path,value]];
  for(const [keys,newValue] of updates){
   let owner=current;
   for(const key of keys.slice(0,-1))owner=owner[key]??={};
   owner[keys.at(-1)]=newValue;
  }
  for(const panel of panels)panel.draw(current);
 };
 for(const group of groups){
  const details=document.createElement("details");details.className="synth-group";
  details.open=expanded.has(group.name);
  details.addEventListener("toggle",()=>details.open?expanded.add(group.name):expanded.delete(group.name));
  const summary=document.createElement("summary");summary.textContent=group.name;
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
     block.append(harmonicControls(patch,index,onChange,preview,expanded));
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
   group.name==="Pitch & movement"?"movement":
   group.name==="Distortion"?"distortion":"delay";
  const panel=illustrateSoundPanel(details,kind,patch,onChange,preview,0);
  panels.push(panel);grid.append(panel.element);
 }
 const modulation=illustrateSoundPanel(renderModulationEditor(patch,onChange,soundId),
  "modulation",patch,onChange,preview,0);
 panels.push(modulation);grid.append(modulation.element);
 root.append(grid);
}
