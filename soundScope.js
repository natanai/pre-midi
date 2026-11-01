// The scope measures real playback PCM; it is not a separate illustrative synth.
import {movement,pitchCents} from "./expression.js";
import {envelopeLevelAt} from "./src/dsp/amplitude-envelope.js";
import {delayTailSeconds} from "./src/dsp/effect-tail.js";
import {planSynthVoice} from "./src/dsp/synth-voice.js";
import {scheduleSynthPlan} from "./audio.js";
import {scheduleSample,sampleForNote} from "./sampler.js";
import {getAsset} from "./assetRegistry.js";
import {nativeEnabled,nativeRequest,nativePlans,nativeRequiredAssets,prepareNativeAssets,renderNative} from "./src/hosts/native/session.js";

const NS="http://www.w3.org/2000/svg",RATE=22050,HOLD=1.25,MAX_WINDOW=12,COUNT=300,TIME_WIDTH=510;
const mounted=new WeakMap();
const clamp=(v,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
const node=(type,attributes={})=>{
 const element=document.createElementNS(NS,type);
 for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));
 return element;
};
// Compatibility helper: the drawn scope does not use this approximation.
export function scopeAmplitudeAt(patch,t){
 if(patch.type==="sample"){
  if(t<patch.attack)return clamp(t/Math.max(.001,patch.attack));
  return t<=HOLD?1:1-clamp((t-HOLD)/patch.release);
 }
 const envelope=patch.envelope;
 return t<=HOLD?envelopeLevelAt(envelope,1,t):
  envelopeLevelAt(envelope,1,HOLD)*(1-clamp((t-HOLD)/envelope.release));
}
export function scopeWindowSeconds(patch,sampleLife=0){
 const length=patch.type==="sample"?sampleLife+.08:
  HOLD+patch.envelope.release+delayTailSeconds(patch.effects)+.08;
 return clamp(Math.max(2.2,length),2.2,MAX_WINDOW);
}
// Per-channel extrema preserve waveform dynamics and delay tails. Never
// normalize each new dial position: changing volume must change the drawing.
export function scopeAudioBins(buffer,count=COUNT){
 const channels=[];
 for(let c=0;c<Math.min(buffer.numberOfChannels,2);c++){
  const samples=buffer.getChannelData(c),bins=[];
  for(let i=0;i<count;i++){
   const from=Math.floor(i*samples.length/count),to=Math.max(from+1,Math.floor((i+1)*samples.length/count));
   let low=0,high=0,rms=0;
   for(let j=from;j<Math.min(to,samples.length);j++){
    const v=samples[j];low=Math.min(low,v);high=Math.max(high,v);rms+=v*v;
   }
   bins.push({low,high,rms:Math.sqrt(rms/Math.max(1,to-from))});
  }
  channels.push(bins);
 }
 return channels.length===1?[channels[0],channels[0]]:channels;
}
function envelopePath(bins){
 const point=(bin,i,top)=>(i/(bins.length-1)*TIME_WIDTH).toFixed(2)+" "+
  clamp(48-(top?bin.high:bin.low)*85,15,81).toFixed(2);
 return bins.map((bin,i)=>(i?"L":"M")+point(bin,i,true)).join(" ")+" "+
  bins.slice().reverse().map((bin,i)=>"L"+point(bin,bins.length-i-1,false)).join(" ")+" Z";
}
function detailPath(buffer){
 // 20ms of actual output, providing a timbre view alongside the seconds-long
 // amplitude view. In particular, filters and distortion alter these samples.
 const left=buffer.getChannelData(0),right=buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1));
 const n=170,size=Math.max(1,Math.floor(.02*buffer.sampleRate));
 const start=Math.min(Math.floor(.3*buffer.sampleRate),Math.max(0,buffer.length-size));
 return Array.from({length:n},(_,i)=>{
  const at=start+Math.round(i/(n-1)*(size-1));
  return (i?"L":"M")+(522+i/(n-1)*191).toFixed(2)+" "+
   clamp(48-(left[at]+right[at])*.5*93,15,81).toFixed(2);
 }).join(" ");
}
function pitchPath(patch,seconds){
 const motion=movement(patch);
 return Array.from({length:COUNT},(_,i)=>{
  const t=i/(COUNT-1)*seconds;
  const vibrato=motion.depth&&t<HOLD+.02?
   motion.depth*Math.sin(2*Math.PI*motion.rate*t)*clamp((t-Math.min(motion.delay,HOLD-.005))/.13):0;
  const semitones=(pitchCents({bend:patch.bend},motion,Math.min(t,HOLD),HOLD)+vibrato)/100;
  const distance=Math.sign(semitones)*Math.log1p(Math.abs(semitones)*3)/Math.log(37)*31;
  return (i?"L":"M")+(i/(COUNT-1)*720).toFixed(2)+" "+(123-distance).toFixed(2);
 }).join(" ");
}
async function webAudio(patch,beat,level,pitch){
 let buffer=null,zone=null;
 if(patch.type==="sample"){
  zone=sampleForNote(patch,pitch,1);
  if(!zone||!beat?.samples?.some(asset=>asset.id===zone.assetId))throw Error("Recording is missing from this beat");
  const bytes=getAsset(zone.assetId);
  if(!bytes)throw Error("Recording bytes are unavailable");
  const decoder=new OfflineAudioContext(2,1,RATE);
  buffer=await decoder.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 }
 const rate=zone?(patch.followPitch?2**((pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12)):1;
 const original=buffer?buffer.duration/rate:0;
 const life=buffer?(patch.oneShot?original:Math.min(original,HOLD+patch.release)):0;
 const seconds=scopeWindowSeconds(patch,life),context=new OfflineAudioContext(2,Math.ceil(seconds*RATE),RATE);
 const voice={patch,volume:level},note={pitch,velocity:1};
 if(buffer)scheduleSample(context,context.destination,voice,note,0,HOLD,beat,new Map([[zone.assetId,buffer]]));
 else scheduleSynthPlan(context,context.destination,planSynthVoice(voice,note,0,HOLD));
 const output=await context.startRendering();
 const full=patch.type==="sample"?life+.08:HOLD+patch.envelope.release+delayTailSeconds(patch.effects)+.08;
 return {buffer:output,seconds,clipped:full>MAX_WINDOW};
}
async function nativeAudio(patch,level,pitch){
 const event={kind:"note",instrument:{patch,volume:level},note:{pitch,velocity:1},at:0,duration:HOLD};
 const ids=nativeRequiredAssets([event]);
 const status=ids.size?await nativeRequest({action:"status"}):null;
 const rate=status?.sampleRate||RATE;
 const assets=ids.size?await prepareNativeAssets(ids,status):new Map();
 const zone=patch.type==="sample"?sampleForNote(patch,pitch,1):null;
 const stored=zone?assets.get(zone.assetId):null;
 const speed=zone?(patch.followPitch?2**((pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12)):1;
 const original=stored?stored.duration/speed:0;
 const life=zone?(patch.oneShot?original:Math.min(original,HOLD+patch.release)):0;
 const seconds=scopeWindowSeconds(patch,life),frames=Math.ceil(seconds*rate);
 const pcm=new Float32Array(await renderNative(nativePlans([event],assets),
  {rate,frames,cycle:seconds,gain:1}));
 if(pcm.length<frames*2)throw Error("Incomplete native waveform");
 const channels=[new Float32Array(frames),new Float32Array(frames)];
 for(let i=0;i<frames;i++){channels[0][i]=pcm[2*i];channels[1][i]=pcm[2*i+1];}
 const full=zone?life+.08:HOLD+patch.envelope.release+delayTailSeconds(patch.effects)+.08;
 return {buffer:{length:frames,sampleRate:rate,numberOfChannels:2,getChannelData:c=>channels[c]},
  seconds,clipped:full>MAX_WINDOW};
}
export async function renderScopeAudio(patch,beat,level=1,pitch=60){
 // Native mode must not silently render a Web Audio substitute.
 return nativeEnabled()?nativeAudio(patch,level,pitch):webAudio(patch,beat,level,pitch);
}
export function createSignalDisplay(root,patch,beat,accent,initialLevel=1,referencePitch=60){
 mounted.get(root)?.dispose();
 root.replaceChildren();
 const wrapper=document.createElement("div");wrapper.className="signal-scope";
 wrapper.style.setProperty("--scope-accent",accent);
 const head=document.createElement("div");head.className="signal-scope-header";
 const title=document.createElement("span");title.className="signal-scope-title";
 title.textContent=patch.type==="sample"?"RECORDED SOUND":"SOUND SHAPE";
 const legend=document.createElement("span");legend.className="signal-scope-legend";legend.textContent="rendering";
 head.append(title,legend);
 const svg=node("svg",{viewBox:"0 0 720 164",preserveAspectRatio:"none",role:"img",
  "aria-label":"Rendered stereo sound envelope, waveform detail, and pitch movement"});
 svg.classList.add("signal-scope-graph");
 const guides=node("path",{d:"M0 48 H720 M0 120 H720 M516 15 V81",class:"signal-scope-guides"});
 const left=node("path",{class:"signal-wave",fill:"var(--scope-accent)",stroke:"none",opacity:".5"});
 const right=node("path",{class:"signal-wave",fill:"var(--scope-accent)",stroke:"none",opacity:".3"});
 const detail=node("path",{class:"signal-wave",fill:"none","stroke-width":"1.2"});
 const pitch=node("path",{class:"signal-pitch",fill:"none","stroke-width":"2"});
 const label=(x,y,content)=>{const el=node("text",{x,y,class:"signal-axis"});el.textContent=content;return el;};
 const end=label(464,93,""),gate=node("path",{class:"signal-scope-guides"});
 svg.append(guides,left,right,detail,pitch,label(8,12,"TIME"),label(522,12,"20ms"),
  label(8,86,"PITCH"),end,gate);
 wrapper.append(head,svg);root.append(wrapper);
 let revision=0,disposed=false,timer=null,currentLevel=initialLevel;
 function update(nextPatch,level=currentLevel){
  currentLevel=level;const token=++revision;
  clearTimeout(timer);
  timer=setTimeout(()=>{
   void renderScopeAudio(nextPatch,beat,currentLevel,referencePitch).then(({buffer,seconds,clipped})=>{
    if(disposed||token!==revision)return;
    const [l,r]=scopeAudioBins(buffer);
    left.setAttribute("d",envelopePath(l));right.setAttribute("d",envelopePath(r));
    detail.setAttribute("d",detailPath(buffer));pitch.setAttribute("d",pitchPath(nextPatch,seconds));
    gate.setAttribute("d","M"+(HOLD/seconds*TIME_WIDTH).toFixed(2)+" 15 V81");
    end.textContent=seconds.toFixed(1)+"s";
    legend.textContent="L / R · "+(clipped?"first ":"")+seconds.toFixed(1)+"s";
    svg.setAttribute("aria-label","Actual left and right audio over "+seconds.toFixed(1)+
     " seconds, 20 millisecond waveform detail, and pitch movement"+(clipped?"; longer tail clipped":""));
    wrapper.removeAttribute("title");
   }).catch(error=>{
    if(disposed||token!==revision)return;
    left.removeAttribute("d");right.removeAttribute("d");detail.removeAttribute("d");
    pitch.removeAttribute("d");gate.removeAttribute("d");end.textContent="";
    legend.textContent="preview unavailable";wrapper.title=String(error.message||error);
   });
  },token===1?0:70);
 }
 mounted.set(root,{dispose(){disposed=true;revision++;clearTimeout(timer);}});
 update(patch,initialLevel);
 return update;
}
