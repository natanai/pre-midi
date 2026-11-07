import {createUIIcon,setIconButton} from "./uiIcons.js";
// Shared PCM waveform viewport for recorded audio assets.
// Musical placement stays on the Clip; trim is a reversible source-time offset.
const NS="http://www.w3.org/2000/svg";
export const WAVEFORM_ZOOMS=Object.freeze([1,2,4,8,16,32,64]);
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function maxTrimSeconds(duration){
 if(!Number.isFinite(duration)||duration<=.01)throw Error("Recording must contain more than 10 ms of audio");
 return Math.max(0,Math.floor((duration-.010001)*1000)/1000);
}
export function normalizeTrimSeconds(value,duration){
 if(!Number.isFinite(value))throw Error("Trim must be a finite number");
 return Math.round(clamp(value,0,maxTrimSeconds(duration))*1000)/1000;
}
export function waveformWindow(duration,trim,zoom=1){
 if(!(duration>0)||!Number.isFinite(duration))throw Error("Invalid recording duration");
 if(!WAVEFORM_ZOOMS.includes(zoom))throw Error("Unsupported waveform zoom");
 const span=duration/zoom;
 const start=clamp(trim-span*.25,0,duration-span);
 return {start,end:start+span,duration:span};
}
export function waveformTimeAtX(x,window,width=480){
 if(!Number.isFinite(x)||!Number.isFinite(width)||width<=0)throw Error("Invalid waveform position");
 return window.start+clamp(x/width,0,1)*window.duration;
}
export function waveformXAtTime(time,window,width=480){
 return clamp((time-window.start)/window.duration*width,0,width);
}
export function waveformPeaksFromBuffer(buffer,start,end,bins=240){
 if(!buffer?.getChannelData||!buffer.numberOfChannels||!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<=0)
  return Array(bins).fill(0);
 if(!Number.isInteger(bins)||bins<1||bins>4096)throw Error("Invalid waveform resolution");
 const left=clamp(Math.floor(start*buffer.sampleRate),0,buffer.length);
 const right=clamp(Math.ceil(end*buffer.sampleRate),left,buffer.length);
 const channelData=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
 const peaks=[];
 for(let i=0;i<bins;i++){
  const a=left+Math.floor((right-left)*i/bins);
  const b=Math.max(a+1,left+Math.ceil((right-left)*(i+1)/bins));
  const stride=Math.max(1,Math.floor((b-a)/192));
  let peak=0;
  for(const channel of channelData)
   for(let j=a;j<Math.min(b,channel.length);j+=stride)peak=Math.max(peak,Math.abs(channel[j]||0));
  peaks.push(clamp(peak,0,1));
 }
 return peaks;
}
export function waveformPeaksFromOverview(overview,recordingDuration,start,end,bins=240){
 if(!Array.isArray(overview)||!overview.length||!(recordingDuration>0))return Array(bins).fill(0);
 return Array.from({length:bins},(_,i)=>{
  const pos=start+(i+.5)/bins*(end-start);
  return clamp(overview[clamp(Math.floor(pos/recordingDuration*overview.length),0,overview.length-1)]||0,0,1);
 });
}
const zoomByAsset=new Map();
let lastDecodedKey=null,lastDecodedPromise=null;
export function decodedWaveformAsset(recording,loadDecoded){
 const key=recording.id+":"+recording.durationSeconds+":"+recording.path;
 if(key!==lastDecodedKey){
  lastDecodedKey=key;
  lastDecodedPromise=Promise.resolve().then(loadDecoded).catch(error=>{
   if(lastDecodedKey===key){lastDecodedKey=null;lastDecodedPromise=null;}
   throw error;
  });
 }
 return lastDecodedPromise;
}
const svgElement=(name,attrs={})=>{
 const node=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
 return node;
};
const element=(name,text)=>{
 const node=document.createElement(name);
 if(text!==undefined)node.textContent=text;
 return node;
};
export function renderAudioWaveform({recording,trimStart=0,onTrim,onPreview=()=>{},loadDecoded,onFindStart=null}){
 const duration=recording.durationSeconds-recording.trimSeconds;
 const max=maxTrimSeconds(duration);
 let applied=normalizeTrimSeconds(trimStart,duration),value=applied,zoom=zoomByAsset.get(recording.id)||1;
 let buffer=null,drag=null;
 const wrapper=element("div");wrapper.className="audio-waveform-editor";
 const svg=svgElement("svg",{viewBox:"0 0 480 100",preserveAspectRatio:"none",role:"slider",tabindex:0,"aria-label":"trim start","aria-valuemin":0,"aria-valuemax":max,"aria-valuenow":value,"aria-description":"drag the start marker or use arrow keys to trim the recording start"});
 svg.classList.add("vocal-waveform");
 const center=svgElement("line",{x1:0,x2:480,y1:50,y2:50,stroke:"#777","stroke-opacity":".6"});
 const path=svgElement("path",{fill:"none",stroke:"#9bc3b8","stroke-width":1.5});
 const shade=svgElement("rect",{x:0,y:0,width:0,height:100,fill:"#777","fill-opacity":".26"});
 const marker=svgElement("line",{x1:0,x2:0,y1:0,y2:100,stroke:"#ddd","stroke-width":2});
 const hit=svgElement("rect",{x:0,y:0,width:24,height:100,fill:"transparent",stroke:"none","aria-hidden":"true"});
 hit.classList.add("audio-trim-handle");
 svg.append(center,path,shade,marker,hit);
 const plot=element("div");plot.className="audio-waveform-plot";
 const flag=element("span");flag.append(createUIIcon("trim",14));flag.className="audio-trim-label";flag.setAttribute("aria-hidden","true");
 plot.append(svg,flag);
 const toolbar=element("div");toolbar.className="audio-waveform-tools";
 const startLabel=element("span"),endLabel=element("span");
 const zoomLabel=element("label");zoomLabel.append(createUIIcon("zoom",14));zoomLabel.title="waveform zoom";
 const select=element("select");select.setAttribute("aria-label","waveform zoom");
 for(const z of WAVEFORM_ZOOMS){const option=element("option",z+"×");option.value=String(z);select.append(option);}
 select.value=String(zoom);zoomLabel.append(select);
 const time=element("output");time.className="audio-trim-readout";
 time.setAttribute("aria-label","trim start time");
 toolbar.append(startLabel,zoomLabel,endLabel,time);
 const controls=element("div");controls.className="audio-trim-controls";
 const timing=element("div");timing.className="vocal-timing";
 const field=element("label");field.className="vocal-number";
 const label=element("span");label.append(createUIIcon("trim",16),element("span","start"));
 const input=element("input");input.type="number";input.min="0";input.max=String(max);input.step=".001";input.value=String(value);
 input.setAttribute("aria-label","Trim start in seconds");input.title="start of kept audio in seconds; enter or leave this field to apply";
 field.append(label,input);timing.append(field);
 const actions=element("div");actions.className="trim-actions";
 const detect=element("button");detect.type="button";detect.className="vocal-icon-button";
 setIconButton(detect,"onset","trim the silent lead-in to the first detected sound");detect.hidden=!onFindStart;
 const restore=element("button");restore.type="button";restore.className="vocal-icon-button";
 setIconButton(restore,"restore","restore the original recording start");
 actions.append(detect,restore);controls.append(timing,actions);
 wrapper.append(controls,plot,toolbar);
 const show=()=>{
  // Keep the visible source-time window fixed while dragging the trim handle.
  const w=drag?.window??waveformWindow(duration,value,zoom);
  startLabel.textContent=w.start.toFixed(3)+"s";
  endLabel.textContent=w.end.toFixed(3)+"s";
  time.textContent=(Math.abs(value-applied)<.0005?"start ":"preview start ")+value.toFixed(3)+"s · keep "+(duration-value).toFixed(3)+"s";
  const x=waveformXAtTime(value,w);
  flag.style.left=Math.min(92,x/480*100)+"%";
  shade.setAttribute("width",String(x));marker.setAttribute("x1",String(x));marker.setAttribute("x2",String(x));
  hit.setAttribute("x",String(clamp(x-12,0,456)));
  svg.setAttribute("aria-valuenow",String(value));svg.setAttribute("aria-valuetext",value.toFixed(3)+" seconds");
  if(document.activeElement!==input)input.value=value.toFixed(3);
  restore.disabled=value===0&&applied===0;
  const first=w.start+recording.trimSeconds,last=w.end+recording.trimSeconds;
  const levels=buffer?
   waveformPeaksFromBuffer(buffer,first,last):
   waveformPeaksFromOverview(recording.waveform,recording.durationSeconds,first,last);
  path.setAttribute("d",levels.map((p,i)=>{
   const x=(i+.5)/levels.length*480,h=Math.max(.5,p*43);
   return "M"+x.toFixed(2)+","+(50-h).toFixed(2)+"V"+(50+h).toFixed(2);
  }).join(" "));
 };
 const preview=next=>{
  value=normalizeTrimSeconds(next,duration);
  show();onPreview(value);
 };
 wrapper.setTrimPreview=preview;
 const commit=next=>{
  const valueToSave=normalizeTrimSeconds(next,duration),changed=valueToSave!==applied;
  value=applied=valueToSave;show();
  if(changed)onTrim(valueToSave);
 };
 const typed=()=>{if(input.reportValidity()&&Number.isFinite(input.valueAsNumber))commit(input.valueAsNumber);};
 input.addEventListener("input",()=>{if(input.validity.valid&&Number.isFinite(input.valueAsNumber))preview(input.valueAsNumber);});
 input.addEventListener("change",typed);
 input.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();typed();}});
 restore.addEventListener("click",()=>commit(0));
 detect.addEventListener("click",async()=>{
  detect.disabled=true;
  try{const at=await onFindStart();if(!wrapper.isConnected)return;
   if(at===null)throw Error("No clear onset detected");commit(at);
  }catch(error){if(wrapper.isConnected)window.alert("Could not find the sound start: "+error.message);}
  finally{detect.disabled=false;}
 });
 select.addEventListener("change",()=>{
  zoom=Number(select.value);zoomByAsset.set(recording.id,zoom);show();
 });
 svg.addEventListener("pointerdown",e=>{
  if(drag||e.pointerType==="mouse"&&e.button!==0)return;
  e.preventDefault();
  const rect=svg.getBoundingClientRect();
  const window=waveformWindow(duration,value,zoom);
  const pointerX=(e.clientX-rect.left)/rect.width*480;
  drag={pointerId:e.pointerId,initial:value,window,left:rect.left,width:rect.width,
   grabOffset:e.target===hit?pointerX-waveformXAtTime(value,window):0};
  svg.focus({preventScroll:true});
  svg.setPointerCapture(e.pointerId);
  if(e.target!==hit)preview(waveformTimeAtX(pointerX,window));
 });
 svg.addEventListener("pointermove",e=>{
  if(!drag||e.pointerId!==drag.pointerId)return;
  const x=(e.clientX-drag.left)/drag.width*480-drag.grabOffset;
  preview(waveformTimeAtX(x,drag.window));
 });
 const finish=e=>{
  if(!drag||e.pointerId!==drag.pointerId)return;
  const previous=drag.initial;
  drag=null;
  if(e.type!=="pointerup"){preview(previous);return;}
  show();commit(value);
 };
 svg.addEventListener("pointerup",finish);svg.addEventListener("pointercancel",finish);
 svg.addEventListener("lostpointercapture",finish);
 svg.addEventListener("keydown",e=>{
  let target;
  const delta=e.shiftKey?.01:.001;
  if(e.key==="ArrowLeft"||e.key==="ArrowDown")target=value-delta;
  else if(e.key==="ArrowRight"||e.key==="ArrowUp")target=value+delta;
  else if(e.key==="PageDown")target=value-.05;
  else if(e.key==="PageUp")target=value+.05;
  else if(e.key==="Home")target=0;
  else if(e.key==="End")target=max;
  else if(e.key==="Escape"&&drag){const previous=drag.initial;drag=null;preview(previous);e.preventDefault();return;}
  else return;
  e.preventDefault();target=normalizeTrimSeconds(target,duration);
  commit(target);
 });
 show();
 if(typeof loadDecoded==="function"){
  void decodedWaveformAsset(recording,loadDecoded).then(decoded=>{
   if(!wrapper.isConnected)return;
   buffer=decoded;show();
  }).catch(()=>{/* Metadata peaks remain available when decoding cannot start. */});
 }
 return wrapper;
}
