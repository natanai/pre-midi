// Controls are generated from the same patch keys validated by synth.js.
// All edits go through the caller's one canonical composition mutation pathway.
import { WAVES, FILTERS } from "./synth.js";
import { createDial } from "./dial.js";
const groups=[
 {name:"Oscillator 1",open:true,fields:[
  {path:["oscillators",0,"wave"],label:"Wave",options:WAVES},
  {path:["oscillators",0,"level"],label:"Level",min:0,max:1,step:.01,display:"percent"},
  {path:["oscillators",0,"octave"],label:"Octave",options:[-2,-1,0,1,2]},
  {path:["oscillators",0,"detune"],label:"Detune",min:-100,max:100,step:1,display:"cents"}
 ]},
 {name:"Oscillator 2",open:false,fields:[
  {path:["oscillators",1,"wave"],label:"Wave",options:WAVES},
  {path:["oscillators",1,"level"],label:"Level",min:0,max:1,step:.01,display:"percent"},
  {path:["oscillators",1,"octave"],label:"Octave",options:[-2,-1,0,1,2]},
  {path:["oscillators",1,"detune"],label:"Detune",min:-100,max:100,step:1,display:"cents"}
 ]},
 {name:"Envelope",open:true,fields:[
  {path:["envelope","attack"],label:"Attack",min:0,max:3,step:.01,display:"seconds"},
  {path:["envelope","decay"],label:"Decay",min:0,max:3,step:.01,display:"seconds"},
  {path:["envelope","sustain"],label:"Sustain",min:0,max:1,step:.01,display:"percent"},
  {path:["envelope","release"],label:"Release",min:.01,max:4,step:.01,display:"seconds"}
 ]},
 {name:"Filter & noise",open:true,fields:[
  {path:["filter","type"],label:"Filter",options:FILTERS},
  {path:["filter","cutoff"],label:"Cutoff",min:50,max:14000,step:1,display:"hz",log:true},
  {path:["filter","resonance"],label:"Resonance",min:.1,max:16,step:.1,display:"number"},
  {path:["noise"],label:"Noise",min:0,max:1,step:.01,display:"percent"}
 ]},
 {name:"Movement",open:true,fields:[
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
 {name:"Effects",open:false,fields:[
  {path:["effects","drive"],label:"Distortion",min:0,max:1,step:.01,display:"percent"},
  {path:["effects","delayMix"],label:"Delay",min:0,max:1,step:.01,display:"percent"},
  {path:["effects","delayTime"],label:"Delay time",min:.05,max:1,step:.01,display:"seconds"},
  {path:["effects","delayFeedback"],label:"Feedback",min:0,max:.8,step:.01,display:"percent"}
 ]}
];
const expanded=new Set(groups.filter(g=>g.open).map(g=>g.name));
// Movement is a primary creative surface; advanced shaping stays available on demand.
groups.sort((a,b)=>a.name==="Movement"?-1:b.name==="Movement"?1:0);
const pathValue=(obj,path)=>path.reduce((target,key)=>target[key],obj);
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
 const value=pathValue(patch,field.path) ?? 0;
 if(!field.options)return createDial(field,value,
  next=>onChange(field.path,next),
  next=>onPreview(field.path,next));
 const label=document.createElement("label");
 label.className="synth-field";
 const title=document.createElement("span");title.textContent=field.label;label.append(title);
 const input=document.createElement("select");
 input.setAttribute("aria-label",fieldTitle(field));
 for(const optionValue of field.options) {
  const option=document.createElement("option");
  option.value=String(optionValue);
  option.textContent=String(optionValue).replace(/^./,s=>s.toUpperCase());
  input.append(option);
 }
 input.value=String(value);
 input.addEventListener("change",()=>onChange(field.path,typeof value==="number"?Number(input.value):input.value));
 label.append(input);
 return label;
}
export function renderPatchEditor(root,patch,onChange,onPreview=()=>{}) {
 root.replaceChildren();
 const grid=document.createElement("div");
 grid.className="synth-grid";
 for(const group of groups){
  const details=document.createElement("details");
  details.className="synth-group";
  details.open=expanded.has(group.name);
  details.addEventListener("toggle",()=>details.open?expanded.add(group.name):expanded.delete(group.name));
  const summary=document.createElement("summary");
  summary.textContent=group.name;
  const fields=document.createElement("div");
  fields.className="synth-fields";
  for(const field of group.fields)fields.append(renderField(field,patch,onChange,onPreview));
  details.append(summary,fields);
  grid.append(details);
 }
 root.append(grid);
}
