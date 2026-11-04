// Vocal clips share the same sampler tone, pitch and movement controls.
// This is the Song context for the existing lower Beat editing workspace.
import {createDial} from "./dial.js";
import {SAMPLE_FILTERS,DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";
import {movement,BEND_SHAPES} from "./expression.js";
import {vocalEffects} from "./vocalEffects.js";
import {recordingBytes} from "./recordingAssets.js";
import {nativeEnabled} from "./src/hosts/native/session.js";
import {decodeNativeAudio} from "./src/hosts/native/capture.js";
import {suggestVocalOnset} from "./songRecorder.js";

const el=(tag,name,className)=>{
 const node=document.createElement(tag);if(name!==undefined)node.textContent=name;
 if(className)node.className=className;
 return node;
};
const button=(label,fn)=>{const b=el("button",label);b.type="button";b.addEventListener("click",fn);return b;};
const dial=(root,label,value,min,max,step,display,change)=>root.append(createDial(
 {label,min,max,step,display},value,change,()=>{}));
function section(root,title){
 const details=el("details",undefined,"synth-group"),summary=el("summary",title);
 details.open=true;const fields=el("div",undefined,"synth-fields dial-grid");
 details.append(summary,fields);root.append(details);return fields;
}
function labelledNumber(root,label,value,min,max,step,change){
 const wrap=el("label",undefined,"vocal-number");
 wrap.append(el("span",label));const input=el("input");
 input.type="number";input.min=String(min);input.max=String(max);input.step=String(step);
 input.value=String(value);input.addEventListener("change",()=>change(Number(input.value)));
 wrap.append(input);root.append(wrap);return input;
}
function waveform(recording,clip){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.classList.add("vocal-waveform");svg.setAttribute("viewBox","0 0 480 100");
 svg.setAttribute("role","img");svg.setAttribute("aria-label","Recording waveform with trimmed start marker");
 const peaks=recording.waveform||[];
 const fraction=Math.min(1,(recording.trimSeconds+(clip.trimStartSeconds??0))/recording.durationSeconds);
 const trim=document.createElementNS("http://www.w3.org/2000/svg","rect");
 trim.setAttribute("x","0");trim.setAttribute("y","0");trim.setAttribute("width",String(fraction*480));trim.setAttribute("height","100");
 trim.setAttribute("fill","#666");trim.setAttribute("fill-opacity",".25");svg.append(trim);
 const path=document.createElementNS("http://www.w3.org/2000/svg","path");
 path.setAttribute("d",peaks.map((v,i)=>{
  const x=(i+.5)/peaks.length*480,h=Math.max(.5,v*43);
  return "M"+x.toFixed(2)+","+(50-h).toFixed(2)+"V"+(50+h).toFixed(2);
 }).join(" "));
 path.setAttribute("stroke","#9bc3b8");path.setAttribute("fill","none");path.setAttribute("stroke-width","2");
 svg.append(path);
 const cursor=document.createElementNS("http://www.w3.org/2000/svg","line");
 cursor.setAttribute("x1",String(fraction*480));cursor.setAttribute("x2",String(fraction*480));
 cursor.setAttribute("y1","0");cursor.setAttribute("y2","100");
 cursor.setAttribute("stroke","#ddd");cursor.setAttribute("stroke-width","1.5");svg.append(cursor);
 return svg;
}
export async function decodeVocalRecording(recording){
 const bytes=recordingBytes(recording);
 let audio;
 if(nativeEnabled())audio=await decodeNativeAudio(bytes,{mono:false});
 else{
  const ctx=new AudioContext();
  try{const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
   audio=await ctx.decodeAudioData(raw);}
  finally{await ctx.close();}
 }
 return audio;
}
async function autoTrim(recording){
 return suggestVocalOnset(await decodeVocalRecording(recording),recording.trimSeconds);
}
export function renderVocalEditor(root,selection,{onEffect,onLevel,onTrim,onDuplicate,onBack,onUseInBeat,onUndo,onRedo}){
 root.hidden=!selection;
 if(!selection){root.replaceChildren();return;}
 const {clip,track,recording}=selection,fx=vocalEffects(clip),clipId=clip.id;
 root.replaceChildren();
 const heading=el("div",undefined,"vocal-editor-heading");
 const identity=el("div",undefined,"vocal-editor-identity");
 identity.append(el("strong",recording.name),el("span"," · "+track.name));
 const actions=el("div",undefined,"vocal-editor-actions");
 actions.append(button("↶",onUndo),button("↷",onRedo),
  button("duplicate",()=>onDuplicate(clipId)),button("use in beat",()=>onUseInBeat(clipId)),
  button("back to beat",onBack));
 heading.append(identity,actions);root.append(heading);
 root.append(waveform(recording,clip));
 const timing=el("div",undefined,"vocal-timing");
 labelledNumber(timing,"trim start (seconds)",clip.trimStartSeconds??0,0,
  Math.max(0,recording.durationSeconds-recording.trimSeconds-.01),.001,
  value=>onTrim(clipId,value));
 const suggest=button("trim to sound",async()=>{
  suggest.disabled=true;
  try{const at=await autoTrim(recording);if(at===null)throw Error("No clear onset detected");
   onTrim(clipId,at);}
  catch(error){window.alert("Could not suggest a trim: "+error.message);}
  finally{suggest.disabled=false;}
 });
 suggest.title="Find the first audible onset; keep the original recording";
 timing.append(suggest);root.append(timing);
 const sections=el("div",undefined,"vocal-effect-sections");
 const shape=section(sections,"sample & articulation");
 dial(shape,"Level",clip.gain??1,0,2,.01,"percent",v=>onLevel(clipId,v));
 for(const [key,label,lo,hi,step,display] of [
  ["transpose","Transpose",-24,24,1,"semitones"],
  ["pan","Pan",-1,1,.01,"pan"],
  ["attack","Rise",0,2,.005,"seconds"],
  ["release","Fade",0,3,.005,"seconds"]
 ])dial(shape,label,fx[key],lo,hi,step,display,v=>onEffect(clipId,key,v));
 const tone=section(sections,"tone · filter & distortion");
 const wrap=el("label",undefined,"vocal-number"),select=el("select");
 wrap.append(el("span","filter type"));
 for(const type of ["off",...SAMPLE_FILTERS]){
  const option=el("option",type);option.value=type;select.append(option);
 }
 select.value=fx.filter?.type??"off";
 select.addEventListener("change",()=>onEffect(clipId,"filter",
  select.value==="off"?null:{...(fx.filter||DEFAULT_SAMPLE_FILTER),type:select.value}));
 wrap.append(select);tone.append(wrap);
 if(fx.filter){
  dial(tone,"Cutoff",fx.filter.cutoff,50,14000,1,"hz",
   v=>onEffect(clipId,"filter",{...fx.filter,cutoff:v}));
  dial(tone,"Resonance",fx.filter.resonance,.1,16,.1,"number",
   v=>onEffect(clipId,"filter",{...fx.filter,resonance:v}));
 }
 dial(tone,"Distortion",fx.drive,0,1,.01,"percent",v=>onEffect(clipId,"drive",v));
 const pitch=section(sections,"pitch & movement"),motion=movement(fx);
 for(const [key,label,lo,hi,step,display] of [
  ["glide","Glide from",-12,12,.1,"semitones"],
  ["glideTime","Glide time",.01,3,.01,"seconds"],
  ["depth","Vibrato",0,100,1,"cents"],
  ["rate","Vibrato speed",.1,20,.1,"hz"],
  ["delay","Vibrato waits",0,3,.05,"seconds"],
  ["tremolo","Pulse",0,1,.01,"percent"],
  ["tremoloRate","Pulse speed",.1,20,.1,"hz"]
 ])dial(pitch,label,motion[key],lo,hi,step,display,
  value=>onEffect(clipId,"movement",{...motion,[key]:value}));
 const bend=el("label",undefined,"vocal-number"),bendSelect=el("select");
 bend.append(el("span","bend shape"));
 for(const [value,label] of BEND_SHAPES){const option=el("option",label);option.value=value;bendSelect.append(option);}
 bendSelect.value=fx.bend.shape;bendSelect.addEventListener("change",()=>onEffect(clipId,"bend",{...fx.bend,shape:bendSelect.value}));
 bend.append(bendSelect);pitch.append(bend);
 dial(pitch,"Bend amount",fx.bend.amount,0,12,.25,"semitones",
  v=>onEffect(clipId,"bend",{...fx.bend,amount:v}));
 dial(pitch,"Wave speed",fx.bend.rate,.1,12,.1,"hz",
  v=>onEffect(clipId,"bend",{...fx.bend,rate:v}));
 const delay=section(sections,"delay");
 for(const [key,label,lo,hi,step,display] of [
  ["delayMix","Delay",0,1,.01,"percent"],
  ["delayTime","Delay time",.05,1,.01,"seconds"],
  ["delayFeedback","Feedback",0,.8,.01,"percent"]
 ])dial(delay,label,fx[key],lo,hi,step,display,v=>onEffect(clipId,key,v));
 root.append(sections);
}
