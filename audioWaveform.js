import {getAssetRevision} from './assetRegistry.js';
import {explainLabel} from './dial.js';
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
const zoomByAsset=new Map(),edgeByAsset=new Map();
let lastDecodedKey=null,lastDecodedPromise=null;
export function decodedWaveformAsset(recording,loadDecoded){
 const key=recording.id+":"+getAssetRevision(recording.id)+":"+recording.durationSeconds+":"+recording.path;
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
export function renderAudioWaveform({recording,trimStart=0,trimEnd=0,onTrim,onTrimEnd=null,onPreview=()=>{},loadDecoded,onFindStart=null,regionKind="trim",loopFade=0,onLoopFade=null,bounds=null}){
 const duration=recording.durationSeconds-recording.trimSeconds;
 const max=maxTrimSeconds(duration),lower=bounds?.start??0,upper=bounds?.end??duration;
 let applied=normalizeTrimSeconds(trimStart,duration),value=applied,zoom=zoomByAsset.get(recording.id)||1;
 let end=duration-normalizeTrimSeconds(trimEnd,duration),appliedEnd=end,active=edgeByAsset.get(recording.id)??"start";
 let buffer=null,drag=null,fade=loopFade,appliedFade=loopFade;
 if(active==="fade"&&!onLoopFade)active="start";
 const position=()=>active==="fade"?end-fade:active==="end"?end:value;
 const maxFade=()=>Math.floor(Math.min(.5,(end-value)/2)*1000+1e-7)/1000;
 const wrapper=element("div");wrapper.className="audio-waveform-editor";
 const svg=svgElement("svg",{viewBox:"0 0 480 100",preserveAspectRatio:"none",role:"group","aria-label":regionKind==="loop"?"sample loop waveform":"audio crop waveform"});
 svg.classList.add("vocal-waveform");
 const center=svgElement("line",{x1:0,x2:480,y1:50,y2:50,stroke:"#777","stroke-opacity":".6"});
 const path=svgElement("path",{fill:"none",stroke:"#9bc3b8","stroke-width":1.5});
 const shade=svgElement("rect",{x:0,y:0,width:0,height:100,fill:"#777","fill-opacity":".26"});
 const marker=svgElement("line",{x1:0,x2:0,y1:0,y2:100,stroke:"#ddd","stroke-width":2});
 const hit=svgElement("rect",{x:0,y:0,width:24,height:100,fill:"transparent",stroke:"none",role:"slider",tabindex:0,"aria-label":regionKind==="loop"?"loop start":"trim start","aria-valuemin":lower,"aria-valuemax":max,"aria-valuenow":value,"aria-description":"drag the start marker or use arrow keys to change the source start"});
 hit.classList.add("audio-trim-handle");
 const endShade=svgElement("rect",{x:480,y:0,width:0,height:100,fill:"#777","fill-opacity":".26"});
 const endMarker=svgElement("line",{x1:480,x2:480,y1:0,y2:100,stroke:"#ddd","stroke-width":2});
 const endHit=svgElement("rect",{x:456,y:0,width:24,height:100,fill:"transparent",role:"slider",tabindex:0,"aria-label":"trim end"});endHit.classList.add("audio-trim-handle");
 endHit.style.display=endMarker.style.display=endShade.style.display=onTrimEnd?"":"none";
 const fadeShade=svgElement("rect",{x:0,y:0,width:0,height:100,fill:"#aaa","fill-opacity":".18","pointer-events":"none"});
 const fadeMarker=svgElement("line",{x1:0,x2:0,y1:0,y2:100,stroke:"#ddd","stroke-dasharray":"3 3","pointer-events":"none"});
 const fadeHit=svgElement("rect",{x:0,y:0,width:16,height:35,fill:"transparent",role:"slider",tabindex:0,"aria-label":"loop crossfade"});
 for(const n of [fadeShade,fadeMarker,fadeHit])n.style.display=onLoopFade?"":"none";
 svg.append(center,path,shade,endShade,fadeShade,marker,endMarker,fadeMarker,hit,endHit,fadeHit);
 const plot=element("div");plot.className="audio-waveform-plot";
 const flag=element("span");flag.append(createUIIcon("trim",14));flag.className="audio-trim-label";flag.setAttribute("aria-hidden","true");
 const endFlag=element("span");endFlag.append(createUIIcon("trim",14));endFlag.className="audio-trim-label";endFlag.style.transform="translateX(-100%) rotate(180deg)";endFlag.setAttribute("aria-hidden","true");endFlag.hidden=!onTrimEnd;
 plot.append(svg,flag,endFlag);
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
 const input=element("input");input.type="number";input.min=String(lower);input.max=String(Math.min(max,upper-.011));input.step=".001";input.value=String(value);
 input.setAttribute("aria-label",(regionKind==="loop"?"Loop":"Trim")+" start in seconds");input.title="start of kept audio in seconds; enter or leave this field to apply";
 field.append(label,input);timing.append(field);
 const endField=element("label");endField.className="vocal-number";endField.hidden=!onTrimEnd;
 const endCaption=element("span");endCaption.append(createUIIcon("trim",16),element("span","end"));
 const endInput=element("input");endInput.type="number";endInput.min=".011";endInput.max=String(upper);endInput.step=".001";endInput.value=String(end);endInput.setAttribute("aria-label",(regionKind==="loop"?"Loop":"Trim")+" end in seconds");endInput.title="end of kept audio in seconds; enter or leave this field to apply";endField.append(endCaption,endInput);timing.append(endField);
 const fadeField=element("label");fadeField.className="vocal-number";fadeField.hidden=!onLoopFade;
 const fadeCaption=element("span","crossfade"),fadeInput=element("input");fadeInput.type="number";fadeInput.min="0";fadeInput.step=".001";fadeInput.setAttribute("aria-label","Loop crossfade in seconds");explainLabel(fadeCaption,"sample loop crossfade");fadeField.append(fadeCaption,fadeInput);timing.append(fadeField);
 const actions=element("div");actions.className="trim-actions";
 const detect=element("button");detect.type="button";detect.className="vocal-icon-button";
 setIconButton(detect,"onset","trim the silent lead-in to the first detected sound");detect.hidden=!onFindStart;
 const restore=element("button");restore.type="button";restore.className="vocal-icon-button";
 setIconButton(restore,"restore","restore the original recording start");
 const restoreEnd=element("button");restoreEnd.type="button";restoreEnd.className="vocal-icon-button";restoreEnd.hidden=!onTrimEnd;setIconButton(restoreEnd,"restore","restore the original recording end");
 actions.append(detect,restore,restoreEnd);controls.append(timing,actions);
 wrapper.append(controls,plot,toolbar);
 const show=()=>{
  // Keep the visible source-time window fixed while dragging the trim handle.
  const w=drag?.window??waveformWindow(duration,position(),zoom);
  startLabel.textContent=w.start.toFixed(3)+"s";
  endLabel.textContent=w.end.toFixed(3)+"s";
  time.textContent=(Math.abs(value-applied)<.0005?"start ":"preview start ")+value.toFixed(3)+"s · end "+end.toFixed(3)+"s · keep "+(end-value).toFixed(3)+"s";
  const x=waveformXAtTime(value,w),right=waveformXAtTime(end,w);
  const fx=waveformXAtTime(end-fade,w);fadeShade.setAttribute("x",String(fx));fadeShade.setAttribute("width",String(Math.max(0,right-fx)));fadeMarker.setAttribute("x1",String(fx));fadeMarker.setAttribute("x2",String(fx));fadeHit.setAttribute("x",String(clamp(fx-8,0,464)));fadeHit.setAttribute("aria-valuemin","0");fadeHit.setAttribute("aria-valuemax",String(maxFade()));fadeHit.setAttribute("aria-valuenow",String(fade));fadeHit.setAttribute("aria-valuetext",fade.toFixed(3)+" seconds");fadeInput.max=String(maxFade());if(document.activeElement!==fadeInput)fadeInput.value=fade.toFixed(3);
  if(regionKind==="loop"){endHit.setAttribute("aria-label","loop end");time.textContent+=" · repeat "+Math.max(0,end-value-fade).toFixed(3)+"s";}
  endShade.setAttribute("x",String(right));endShade.setAttribute("width",String(480-right));endMarker.setAttribute("x1",String(right));endMarker.setAttribute("x2",String(right));endHit.setAttribute("x",String(clamp(right-12,0,456)));endFlag.style.left=(right/480*100)+"%";
  endHit.setAttribute("aria-valuemin",String(value+.011));endHit.setAttribute("aria-valuemax",String(upper));endHit.setAttribute("aria-valuenow",String(end));endHit.setAttribute("aria-valuetext",end.toFixed(3)+" seconds");
  input.max=String(Math.max(0,end-.011));endInput.min=String(value+.011);if(document.activeElement!==endInput)endInput.value=end.toFixed(3);restoreEnd.disabled=end===upper&&appliedEnd===upper;
  flag.style.left=Math.min(92,x/480*100)+"%";
  shade.setAttribute("width",String(x));marker.setAttribute("x1",String(x));marker.setAttribute("x2",String(x));
  hit.setAttribute("x",String(clamp(x-12,0,456)));
  hit.setAttribute("aria-valuemax",String(end-.011));hit.setAttribute("aria-valuenow",String(value));hit.setAttribute("aria-valuetext",value.toFixed(3)+" seconds");
  if(document.activeElement!==input)input.value=value.toFixed(3);
  restore.disabled=value===lower&&applied===lower;
  const first=w.start+recording.trimSeconds,last=w.end+recording.trimSeconds;
  const levels=buffer?
   waveformPeaksFromBuffer(buffer,first,last):
   waveformPeaksFromOverview(recording.waveform,recording.durationSeconds,first,last);
  path.setAttribute("d",levels.map((p,i)=>{
   const x=(i+.5)/levels.length*480,h=Math.max(.5,p*43);
   return "M"+x.toFixed(2)+","+(50-h).toFixed(2)+"V"+(50+h).toFixed(2);
  }).join(" "));
 };
 const preview=(next,edge=active)=>{
  active=edge;edgeByAsset.set(recording.id,active);
  if(edge==="fade")fade=Math.round(clamp(end-next,0,maxFade())*1000)/1000;
  else if(edge==="end")end=Math.round(clamp(next,value+.011,upper)*1000)/1000;
  else value=Math.max(lower,Math.min(normalizeTrimSeconds(next,duration),Math.floor((end-.011)*1000)/1000));
  show();onPreview(value);
 };
 wrapper.setTrimPreview=preview;
 const commit=(next,edge=active)=>{
  preview(next,edge);
  const changed=edge==="fade"?fade!==appliedFade:edge==="end"?end!==appliedEnd:value!==applied;
  if(edge==="fade")appliedFade=fade;else if(edge==="end")appliedEnd=end;else applied=value;
  show();if(changed){if(edge==="fade")onLoopFade?.(fade);else if(edge==="end")onTrimEnd?.(Math.round((duration-end)*1000)/1000);else onTrim(value);}
 };
 fadeHit.addEventListener("focus",()=>{active="fade";edgeByAsset.set(recording.id,active);show();});
 fadeInput.addEventListener("change",()=>{if(fadeInput.reportValidity()&&Number.isFinite(fadeInput.valueAsNumber))commit(end-fadeInput.valueAsNumber,"fade");});
 const typed=()=>{if(input.reportValidity()&&Number.isFinite(input.valueAsNumber))commit(input.valueAsNumber,"start");};
 input.addEventListener("input",()=>{if(input.validity.valid&&Number.isFinite(input.valueAsNumber))preview(input.valueAsNumber,"start");});
 input.addEventListener("change",typed);
 input.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();typed();}});
 restore.addEventListener("click",()=>commit(lower,"start"));restoreEnd.addEventListener("click",()=>commit(upper,"end"));
 const typedEnd=()=>{if(endInput.reportValidity()&&Number.isFinite(endInput.valueAsNumber))commit(endInput.valueAsNumber,"end");};
 endInput.addEventListener("input",()=>{if(endInput.validity.valid&&Number.isFinite(endInput.valueAsNumber))preview(endInput.valueAsNumber,"end");});endInput.addEventListener("change",typedEnd);endInput.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();typedEnd();}});hit.addEventListener("focus",()=>{active="start";edgeByAsset.set(recording.id,active);show();});endHit.addEventListener("focus",()=>{active="end";edgeByAsset.set(recording.id,active);show();});
 detect.addEventListener("click",async()=>{
  detect.disabled=true;
  try{const at=await onFindStart();if(!wrapper.isConnected)return;
   if(at===null)throw Error("No clear onset detected");commit(at,"start");
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
  const currentWindow=waveformWindow(duration,position(),zoom);
  const px=(e.clientX-rect.left)/rect.width*480;
  active=onLoopFade&&e.target===fadeHit?"fade":onTrimEnd&&(e.target===endHit||e.target!==hit&&Math.abs(px-waveformXAtTime(end,currentWindow))<Math.abs(px-waveformXAtTime(value,currentWindow)))?"end":"start";edgeByAsset.set(recording.id,active);
  const window=currentWindow;
  const pointerX=(e.clientX-rect.left)/rect.width*480;
  drag={pointerId:e.pointerId,initial:position(),window,left:rect.left,width:rect.width,
   grabOffset:e.target===hit||e.target===endHit||e.target===fadeHit?pointerX-waveformXAtTime(position(),window):0};
  (active==="fade"?fadeHit:active==="end"?endHit:hit).focus({preventScroll:true});
  svg.setPointerCapture(e.pointerId);
  if(e.target!==hit&&e.target!==endHit&&e.target!==fadeHit)preview(waveformTimeAtX(pointerX,window));
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
  show();commit(position());
 };
 svg.addEventListener("pointerup",finish);svg.addEventListener("pointercancel",finish);
 svg.addEventListener("lostpointercapture",finish);
 svg.addEventListener("keydown",e=>{
  let target;const at=position();
  const delta=e.shiftKey?.01:.001;
  if(e.key==="ArrowLeft"||e.key==="ArrowDown")target=at-delta;
  else if(e.key==="ArrowRight"||e.key==="ArrowUp")target=at+delta;
  else if(e.key==="PageDown")target=at-.05;
  else if(e.key==="PageUp")target=at+.05;
  else if(e.key==="Home")target=active==="fade"?end-maxFade():active==="end"?value+.011:lower;
  else if(e.key==="End")target=active==="fade"?end:active==="end"?upper:Math.max(lower,end-.011);
  else if(e.key==="Escape"&&drag){const previous=drag.initial;drag=null;preview(previous);e.preventDefault();return;}
  else return;
  e.preventDefault();target=active==="fade"?clamp(target,end-maxFade(),end):active==="end"?clamp(target,value+.011,upper):Math.max(lower,normalizeTrimSeconds(target,duration));
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
