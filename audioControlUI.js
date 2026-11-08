import {processorBypassed,withProcessorBypass} from "./src/dsp/processing-chain.js";
import {soundField,soundParameter,soundCapability} from "./soundParameterAdapter.js";
// Shared sampled-audio controls for Beat Sounds and Song vocal Clips.
// Parameters have one definition; source-specific options are explicit.
import {createDial,explainLabel,helpForLabel} from "./dial.js";
import {movement,BEND_SHAPES} from "./expression.js";
import {sampleTone,SAMPLE_FILTERS,DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";

const config=(id,label,context="sample")=>{
 const {path,min,max,step,display}=soundField(id,context);
 return Object.freeze([path.at(-1),label,min,max,step,display]);
};
export const AUDIO_MOVEMENT_CONTROLS=Object.freeze([
 ["glide","Glide from"],["glideTime","Glide time"],["depth","Vibrato"],
 ["rate","Vibrato speed"],["delay","Vibrato waits"],["tremolo","Pulse"],
 ["tremoloRate","Pulse speed"],["tone","Tone wave"],["toneRate","Tone speed"]
].map(([id,label])=>config("movement."+id,label)));
export const AUDIO_BEND_CONTROLS=Object.freeze([
 config("bend.amount","Bend amount"),config("bend.rate","Wave speed")
]);
export const AUDIO_COMMON_CONTROLS=Object.freeze([
 config("gain","Level"),config("transpose","Transpose"),config("pan","Pan")
]);
export const AUDIO_SAMPLE_EXTRA_CONTROLS=Object.freeze([
 config("strumMs","Strum"),config("envelope.attack","Attack"),config("envelope.release","Release")
]);
export const AUDIO_VOCAL_ENVELOPE_CONTROLS=Object.freeze([
 config("envelope.attack","Attack","vocal"),config("envelope.release","Release","vocal")
]);
export const AUDIO_DELAY_CONTROLS=Object.freeze([
 config("effects.delayMix","Delay"),config("effects.delayTime","Delay time"),config("effects.delayFeedback","Feedback")
]);

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
 select.addEventListener("change",()=>{
  const chain=withProcessorBypass(patch,"filter",select.value==="off");
  if(select.value==="off")onChange(["chain"],chain);
  else onChange([["chain"],["filter"]],[chain,{...tone.filter,type:select.value}]);
 });
 label.dataset.soundPath="filter.type";root.append(label);
 if(!off){
  if(showCutoff)slider(root,config("filter.cutoff","Brightness"),tone.filter.cutoff,
   ["filter","cutoff"],(path,value)=>onChange(["filter"],{...tone.filter,cutoff:value}),
   (path,value)=>onPreview(["filter"],{...tone.filter,cutoff:value}));
  slider(root,config("filter.resonance","Resonance"),tone.filter.resonance,
   ["filter","resonance"],(path,value)=>onChange(["filter"],{...tone.filter,resonance:value}),
   (path,value)=>onPreview(["filter"],{...tone.filter,resonance:value}));
  for(const [key,label] of [["sweep","Filter sweep"],["sweepTime","Sweep time"]]){
   const capability=soundCapability(patch,["filter",key]);
   slider(root,config("filter."+key,label),tone.filter[key],["filter",key],
    (path,value)=>onChange(["filter"],{...tone.filter,[key]:value}),
    (path,value)=>onPreview(["filter"],{...tone.filter,[key]:value}),
    {inactiveReason:capability.state==="inactive"?capability.reason:undefined});
  }
 }
 slider(root,config("effects.drive","Distortion"),tone.drive,["drive"],onChange,onPreview,{inactiveReason:processorBypassed(patch,"drive")?"distortion is bypassed":undefined});
}
export function renderAudioMovementControls(root,patch,onChange,onPreview=()=>{}){
 const m=movement(patch);
 for(const item of AUDIO_MOVEMENT_CONTROLS){
  const [key]=item;
  const capability=soundCapability(patch,["movement",key]);
  slider(root,item,m[key],["movement",key],
   (path,value)=>onChange(["movement"],{...m,[key]:value}),
   (path,value)=>onPreview(["movement",key],value),
   {inactiveReason:capability.state==="inactive"?capability.reason+"; the dashed curve is a reference guide":undefined,
    inactiveLabel:capability.state==="inactive"?"inactive · "+capability.reason:undefined});
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
  const [key]=item,capability=soundCapability(patch,["bend",key]);
  slider(root,item,bend[key],["bend",key],
   (path,value)=>onChange(["bend"],{...bend,[key]:value}),
   (path,value)=>onPreview(["bend",key],value),
   {inactiveReason:capability.state==="inactive"?capability.reason+"; the dashed curve is a reference guide":undefined,
    inactiveLabel:capability.state==="inactive"?"inactive · "+capability.reason:undefined});
 }
}
export function renderAudioArticulationControls(root,patch,onChange,onPreview=()=>{},
 {context="sample"}={}){
 const common=AUDIO_COMMON_CONTROLS;
 const extras=context==="vocal"?AUDIO_VOCAL_ENVELOPE_CONTROLS:AUDIO_SAMPLE_EXTRA_CONTROLS;
 for(const item of [...common,...extras]){
  const [key]=item;
  slider(root,item,patch[key]??soundParameter(patch,[key]).default,[key],onChange,onPreview,{
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
  const path=vocal?["effects",key]:[key],capability=soundCapability(patch,path);
  slider(root,item,(vocal?patch.effects?.[key]:patch[key])??soundParameter(patch,path).default,
   path,onChange,onPreview,{inactiveReason:capability.state==="inactive"?capability.reason:undefined});
 }
}
export const DEFAULT_VOCAL_DIAGRAM_FILTER=DEFAULT_SAMPLE_FILTER;
