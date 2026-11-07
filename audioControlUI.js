// Shared sampled-audio controls for Beat Sounds and Song vocal Clips.
// Parameters have one definition; source-specific options are explicit.
import {createDial,explainLabel,helpForLabel} from "./dial.js";
import {movement,BEND_SHAPES} from "./expression.js";
import {sampleTone,SAMPLE_FILTERS,DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";

export const AUDIO_MOVEMENT_CONTROLS=Object.freeze([
 ["glide","Glide from",-12,12,.1,"semitones"],
 ["glideTime","Glide time",.01,3,.01,"seconds"],
 ["depth","Vibrato",0,100,1,"cents"],
 ["rate","Vibrato speed",.1,20,.1,"hz"],
 ["delay","Vibrato waits",0,3,.05,"seconds"],
 ["tremolo","Pulse",0,1,.01,"percent"],
 ["tremoloRate","Pulse speed",.1,20,.1,"hz"]
].map(Object.freeze));
export const AUDIO_BEND_CONTROLS=Object.freeze([
 ["amount","Bend amount",0,12,.25,"semitones"],
 ["rate","Wave speed",.1,12,.1,"hz"]
].map(Object.freeze));
export const AUDIO_COMMON_CONTROLS=Object.freeze([
 ["gain","Level",0,2,.01,"percent"],
 ["transpose","Transpose",-24,24,1,"semitones"],
 ["pan","Pan",-1,1,.01,"pan"]
].map(Object.freeze));
export const AUDIO_SAMPLE_EXTRA_CONTROLS=Object.freeze([
 ["strumMs","Strum",-25,25,1,"number"]
].map(Object.freeze));
export const AUDIO_VOCAL_ENVELOPE_CONTROLS=Object.freeze([
 ["attack","Rise",0,2,.005,"seconds"],
 ["release","Fade",0,3,.005,"seconds"]
].map(Object.freeze));
export const AUDIO_DELAY_CONTROLS=Object.freeze([
 ["delayMix","Delay",0,1,.01,"percent"],
 ["delayTime","Delay time",.05,1,.01,"seconds"],
 ["delayFeedback","Feedback",0,.8,.01,"percent"]
].map(Object.freeze));

function slider(root,config,value,path,change,preview=()=>{},{disabled=false,disabledReason,inactiveReason,inactiveLabel,format}={}){
 const [key,label,min,max,step,display]=config;
 const knob=createDial({label,min,max,step,display,disabled,disabledReason,inactiveReason,inactiveLabel,format},
  value,next=>change(path,next),next=>preview(path,next));
 knob.dataset.soundPath=path.join(".");
 root.append(knob);
 return knob;
}
function selectorLabel(title,aria){
 const label=document.createElement("label");label.className="synth-field";
 const span=document.createElement("span");span.textContent=title;
 explainLabel(span,title);label.append(span);
 const select=document.createElement("select");
 select.setAttribute("aria-label",aria);select.setAttribute("aria-description",helpForLabel(title));
 label.append(select);
 return {label,select};
}
export function renderAudioToneControls(root,patch,onChange,onPreview=()=>{},
 {allowBypass=false,showCutoff=false}={}){
 const tone=sampleTone(patch),off=allowBypass&&(patch.filter==null||patch.audioFilterBypassed===true);
 const {label,select}=selectorLabel("filter type","Recorded sound filter type");
 for(const type of allowBypass?["off",...SAMPLE_FILTERS]:SAMPLE_FILTERS){
  const option=document.createElement("option");option.value=type;option.textContent=type;select.append(option);
 }
 select.value=off?"off":tone.filter.type;
 select.addEventListener("change",()=>onChange(["filter"],
  select.value==="off"?null:{...tone.filter,type:select.value}));
 label.dataset.soundPath="filter.type";root.append(label);
 if(!off){
  if(showCutoff)slider(root,["cutoff","Brightness",50,14000,1,"hz"],tone.filter.cutoff,
   ["filter","cutoff"],(path,value)=>onChange(["filter"],{...tone.filter,cutoff:value}),
   (path,value)=>onPreview(["filter"],{...tone.filter,cutoff:value}));
  slider(root,["resonance","Resonance",.1,16,.1,"number"],tone.filter.resonance,
   ["filter","resonance"],(path,value)=>onChange(["filter"],{...tone.filter,resonance:value}),
   (path,value)=>onPreview(["filter"],{...tone.filter,resonance:value}));
 }
 slider(root,["drive","Distortion",0,1,.01,"percent"],tone.drive,["drive"],onChange,onPreview);
}
export function renderAudioMovementControls(root,patch,onChange,onPreview=()=>{}){
 const m=movement(patch);
 for(const item of AUDIO_MOVEMENT_CONTROLS){
  const [key]=item;
  const parent=key==="glideTime"?"Glide from":
   ["rate","delay"].includes(key)?"Vibrato":key==="tremoloRate"?"Pulse":null;
  const inactive=parent==="Glide from"&&m.glide===0||
   parent==="Vibrato"&&m.depth===0||parent==="Pulse"&&m.tremolo===0;
  slider(root,item,m[key],["movement",key],
   (path,value)=>onChange(["movement"],{...m,[key]:value}),
   (path,value)=>onPreview(["movement",key],value),
   {inactiveReason:inactive?"Change "+parent+" from zero to hear this setting; the dashed curve is a reference guide":undefined,
    inactiveLabel:inactive?"inactive · "+parent.toLowerCase()+" is 0":undefined});
 }
 const bend=patch.bend??{shape:"straight",amount:2,rate:4};
 const {label,select}=selectorLabel("bend shape","Recorded sound bend shape");
 for(const [id,name] of BEND_SHAPES){
  const option=document.createElement("option");option.value=id;option.textContent=name;select.append(option);
 }
 select.value=bend.shape;
 select.addEventListener("change",()=>onChange(["bend"],{...bend,shape:select.value}));
 label.dataset.soundPath="bend.shape";root.prepend(label);
 for(const item of AUDIO_BEND_CONTROLS){
  const [key]=item;
  slider(root,item,bend[key],["bend",key],
   (path,value)=>onChange(["bend"],{...bend,[key]:value}),
   (path,value)=>onPreview(["bend",key],value),
   {inactiveReason:bend.shape==="straight"||key==="rate"&&(bend.shape!=="wave"||bend.amount===0)?
     (key==="rate"?(bend.amount===0?"Bend amount is zero; the dashed curve shows a speed reference":
      "Wave speed only affects the wave bend shape; the dashed curve shows a wave reference"):
      "The straight shape has no pitch bend; the dashed curve is a wave reference"):undefined,
    inactiveLabel:bend.shape==="straight"?"inactive · straight bend":
     key==="rate"&&bend.shape!=="wave"?"inactive · select wave":
      key==="rate"&&bend.amount===0?"inactive · bend amount is 0":undefined});
 }
}
export function renderAudioArticulationControls(root,patch,onChange,onPreview=()=>{},
 {context="sample"}={}){
 const common=AUDIO_COMMON_CONTROLS;
 const extras=context==="vocal"?AUDIO_VOCAL_ENVELOPE_CONTROLS:AUDIO_SAMPLE_EXTRA_CONTROLS;
 for(const item of [...common,...extras]){
  const [key]=item;
  slider(root,item,patch[key]??0,[key],onChange,onPreview,{
   format:key==="strumMs"?(value=>value===0?"Off":(value>0?"Down ":"Up ")+Math.abs(value)+" ms"):undefined
  });
 }
}
export function renderAudioDelayControls(root,patch,onChange,onPreview=()=>{}){
 for(const item of AUDIO_DELAY_CONTROLS){
  const [key]=item;
  // A Vocal Clip stores its delay settings on effects, just as the shared
  // illustration does. A path and value mismatch left these three dials
  // unlinked (and without an initial numerical value).
  const vocal=patch.type==="vocal";
  slider(root,item,vocal?patch.effects?.[key]:patch[key],
   vocal?["effects",key]:[key],onChange,onPreview);
 }
}
export const DEFAULT_VOCAL_DIAGRAM_FILTER=DEFAULT_SAMPLE_FILTER;
