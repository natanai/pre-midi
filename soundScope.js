import {createAnalysisQueue} from './src/hosts/analysis-queue.js';
import {sampleSourceRequest} from './src/dsp/source-processing.js';
import {postTailSeconds} from './src/dsp/post-processing.js';
import {prepareProcessorMix} from './src/hosts/web/processor-mix.js';
import {effectiveDelayEffects} from "./src/dsp/processing-chain.js";
import {vocalEventFromPatch} from "./vocalAudioView.js";
import {scheduleVocal,prepareVocalSource} from "./songAudio.js";
import {vocalSourceRange} from "./vocalEffects.js";
// The scope measures real playback PCM; it is not a separate illustrative synth.
import {movement,pitchCents} from "./expression.js";
import {envelopeLevelAt} from "./src/dsp/amplitude-envelope.js";
import {effectTailSeconds} from "./src/dsp/effect-tail.js";
import {routeValueAt,smoothingAlpha} from "./src/dsp/modulation.js";
import {planSynthVoice} from "./src/dsp/synth-voice.js";
import {scheduleSynthPlan} from "./audio.js";
import {scheduleSample,sampleForNote,prepareSampleSource} from "./sampler.js";
import {getAsset} from "./assetRegistry.js";
import {nativeEnabled,nativeRequest,prepareNativePlans,nativeRequiredAssets,prepareNativeAssets,renderNative} from "./src/hosts/native/session.js";

const NS="http://www.w3.org/2000/svg",RATE=44100,HOLD=1.25,MAX_WINDOW=12,COUNT=300,TIME_WIDTH=720;
const renderLatest=createAnalysisQueue();
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
 const length=patch.type==="sample"?sampleLife+postTailSeconds(patch)+effectTailSeconds(patch)+.08:
  HOLD+patch.envelope.release+postTailSeconds(patch)+effectTailSeconds(effectiveDelayEffects(patch,patch.effects))+.08;
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
// Zoom to a few cycles of the real audio, rather than manufacturing a wave
// from patch parameters. All sound edits use the same fixed amplitude mapping;
// neither channel nor patch is normalized independently.
export function scopeWaveformData(buffer,referencePitch=60,count=620,atSeconds=null){
 const rate=buffer.sampleRate;
 const fundamental=440*2**((referencePitch-69)/12);
 const size=Math.min(buffer.length,Math.max(2,Math.round(rate*clamp(7/fundamental,.018,.12))));
 const channelData=[buffer.getChannelData(0),
  buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1))];
 // A slow attack or plucked transient should not leave a mostly empty wave.
 // Select one genuinely audible slice in the first held second, using the
 // identical timing and sample indices for the left and right channels.
 const latest=Math.max(0,atSeconds===null?Math.min(buffer.length-size,Math.round(rate*1.08)):buffer.length-size);
 let start=atSeconds===null?0:Math.round(rate*clamp(atSeconds,0,latest/rate)),best=-1;
 if(atSeconds===null)for(let k=0;k<15;k++){
  const candidate=Math.min(latest,Math.round(rate*(.02+k*.072)));
  let energy=0;
  for(let i=0;i<64;i++){
   const at=candidate+Math.round((size-1)*i/63);
   energy+=channelData[0][at]**2+channelData[1][at]**2;
  }
  const preference=1-.12*Math.abs(candidate/rate-.24);
  if(energy*preference>best){best=energy*preference;start=candidate;}
 }
 const countPoints=Math.max(2,count);
 const channels=channelData.map(data=>Array.from({length:countPoints},(_,i)=>
  data[start+Math.round((size-1)*i/(countPoints-1))]));
 return {channels,startSeconds:start/rate,windowSeconds:size/rate};
}
function waveformPath(samples){
 return samples.map((value,i)=>(i?"L":"M")+(i/(samples.length-1)*TIME_WIDTH).toFixed(2)+" "+
  (76-47*Math.tanh(value*1.7)).toFixed(2)).join(" ");
}
function envelopePath(bins,channel){
 // One measured stereo channel above and one below the middle line, so
 // panning changes the display even if the mono waveform's timbre is similar.
 const direction=channel===0?-1:1;
 const point=(bin,i)=>(i/(bins.length-1)*TIME_WIDTH).toFixed(2)+" "+
  (172+direction*17*Math.tanh(Math.max(-bin.low,bin.high)*1.7)).toFixed(2);
 return bins.map((bin,i)=>(i?"L":"M")+point(bin,i)).join(" ")+" "+
  bins.slice().reverse().map((bin,i)=>
   "L"+((bins.length-i-1)/(bins.length-1)*TIME_WIDTH).toFixed(2)+" 172").join(" ")+" Z";
}
function pitchPath(patch,seconds,referencePitch,oscillator=0){
 const motion=movement(patch),slot=patch.type==="synth"?patch.oscillators[oscillator]:null;
 const zone=patch.type==="sample"?sampleForNote(patch,referencePitch,1):null;
 // Native and Web Audio both apply the sampler's transpose to the playback
 // rate. Without pitch follow, the sample root itself determines the pitch.
 const base=slot?slot.octave*12+slot.detune/100:
  patch.followPitch?patch.transpose:(zone?.root??referencePitch)+patch.transpose-referencePitch;
 const routes=slot?(patch.modulation?.routes??[]).filter(route=>
  route.target==="oscillators."+oscillator+".detune"):[];
 const states=routes.map(()=>0),step=seconds/(COUNT-1);
 return Array.from({length:COUNT},(_,i)=>{
  const t=i*step;
  const vibrato=motion.depth&&t<HOLD+.02?
   motion.depth*Math.sin(2*Math.PI*motion.rate*t)*clamp((t-Math.min(motion.delay,HOLD-.005))/.13):0;
  let cents=0;
  routes.forEach((route,index)=>{
   const desired=routeValueAt(route,{elapsed:t,gate:HOLD,velocity:1,pitch:referencePitch});
   const alpha=smoothingAlpha(route.smoothing,1/step);
   states[index]+=alpha*(desired-states[index]);
   cents+=states[index];
  });
  const semitones=base+(pitchCents({bend:patch.bend},motion,Math.min(t,HOLD),HOLD)+vibrato+cents)/100;
  const distance=clamp(Math.sign(semitones)*Math.log1p(Math.abs(semitones)*3)/Math.log(37)*22,-22,22);
  return (i?"L":"M")+(i/(COUNT-1)*TIME_WIDTH).toFixed(2)+" "+(232-distance).toFixed(2);
 }).join(" ");
}
async function vocalScope(patch,context,level,isCurrent){
 const event=vocalEventFromPatch(patch,context,level),unit=60/context.bpm/4;
 const life=vocalSourceRange(event.recording,event.clip,unit).duration;
 const seconds=Math.min(MAX_WINDOW,Math.max(2.2,life+postTailSeconds(patch)+effectTailSeconds(event.clip.effects)+.08));
 if(nativeEnabled()){
  const onset={kind:"vocal",event,at:0};const status=await nativeRequest({action:"status"});
  const rate=status.sampleRate||RATE,assets=await prepareNativeAssets(nativeRequiredAssets([onset]),{...status,sampleRate:rate},{isCurrent});
  const frames=Math.ceil(seconds*rate),pcm=new Float32Array(await renderNative(await prepareNativePlans([onset],assets,unit,isCurrent),{rate,frames,cycle:seconds,gain:1}));
  const channels=[new Float32Array(frames),new Float32Array(frames)];
  for(let n=0;n<frames;n++){channels[0][n]=pcm[2*n];channels[1][n]=pcm[2*n+1];}
  return {buffer:{length:frames,sampleRate:rate,numberOfChannels:2,getChannelData:c=>channels[c]},seconds,clipped:seconds<life};
 }
 const offline=new OfflineAudioContext(2,Math.ceil(seconds*RATE),RATE),bytes=getAsset(event.recording.id);
 if(!bytes)throw Error("Recording audio is missing");
 await prepareProcessorMix(offline,patch);
 const buffer=await offline.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const decoded=new Map([[event.recording.id,buffer]]);await prepareVocalSource(offline,decoded,event);
 scheduleVocal(offline,offline.destination,event,0,unit,decoded);
 return {buffer:await offline.startRendering(),seconds,clipped:seconds<life};
}
async function webAudio(patch,beat,level,pitch,automation){
 let buffer=null,zone=null;
 if(patch.type==="sample"){
  zone=sampleForNote(patch,pitch,1);
  if(!zone||!beat?.samples?.some(asset=>asset.id===zone.assetId))throw Error("Recording is missing from this beat");
  const bytes=getAsset(zone.assetId);
  if(!bytes)throw Error("Recording bytes are unavailable");
  const decoder=new OfflineAudioContext(2,1,RATE);
  buffer=await decoder.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 }
 const request=buffer?sampleSourceRequest(patch,{pitch,velocity:1},zone,buffer.duration):null,original=request?request.region.sourceLength*request.recipe.time/request.rate:0;
 const life=buffer?(patch.oneShot?original:Math.min(original,HOLD+patch.release)):0;
 const seconds=scopeWindowSeconds(patch,life),context=new OfflineAudioContext(2,Math.ceil(seconds*RATE),RATE);
 await prepareProcessorMix(context,patch);
 const voice={patch,volume:level},note={pitch,velocity:1};
 if(buffer){const decoded=new Map([[zone.assetId,buffer]]);await prepareSampleSource(context,decoded,patch,note);scheduleSample(context,context.destination,voice,note,0,HOLD,beat,decoded);}
 else scheduleSynthPlan(context,context.destination,planSynthVoice(voice,note,0,HOLD,
  automation?{unit:60/(beat?.bpm??120)/4,automation,timeline:{step:0,unit:60/(beat?.bpm??120)/4,
   limitStep:(beat?.bars??8)*16}}:{unit:60/(beat?.bpm??120)/4}));
 const output=await context.startRendering();
 const full=patch.type==="sample"?life+postTailSeconds(patch)+effectTailSeconds(patch)+.08:HOLD+patch.envelope.release+postTailSeconds(patch)+effectTailSeconds(effectiveDelayEffects(patch,patch.effects))+.08;
 return {buffer:output,seconds,clipped:full>MAX_WINDOW};
}
async function nativeAudio(patch,beat,level,pitch,automation,isCurrent){
 const event={kind:"note",instrument:{patch,volume:level,...(automation?{automation}:{})},
  note:{pitch,velocity:1},at:0,duration:HOLD,
  ...(automation?{timeline:{step:0,unit:60/(beat?.bpm??120)/4,
   limitStep:(beat?.bars??8)*16}}:{})};
 const ids=nativeRequiredAssets([event]);
 // Match the configured native device rate even for purely synthesized sounds.
 const status=await nativeRequest({action:"status"});
 const rate=status?.sampleRate||RATE;
 const assets=ids.size?await prepareNativeAssets(ids,{...status,sampleRate:rate},{isCurrent}):new Map();
 const zone=patch.type==="sample"?sampleForNote(patch,pitch,1):null;
 const stored=zone?assets.get(zone.assetId):null;
 const request=stored?sampleSourceRequest(patch,{pitch,velocity:1},zone,stored.duration):null,original=request?request.region.sourceLength*request.recipe.time/request.rate:0;
 const life=zone?(patch.oneShot?original:Math.min(original,HOLD+patch.release)):0;
 const seconds=scopeWindowSeconds(patch,life),frames=Math.ceil(seconds*rate);
 const pcm=new Float32Array(await renderNative(await prepareNativePlans([event],assets,60/(beat?.bpm??120)/4,isCurrent),
  {rate,frames,cycle:seconds,gain:1}));
 if(pcm.length<frames*2)throw Error("Incomplete native waveform");
 const channels=[new Float32Array(frames),new Float32Array(frames)];
 for(let i=0;i<frames;i++){channels[0][i]=pcm[2*i];channels[1][i]=pcm[2*i+1];}
 const full=zone?life+postTailSeconds(patch)+effectTailSeconds(patch)+.08:HOLD+patch.envelope.release+postTailSeconds(patch)+effectTailSeconds(effectiveDelayEffects(patch,patch.effects))+.08;
 return {buffer:{length:frames,sampleRate:rate,numberOfChannels:2,getChannelData:c=>channels[c]},
  seconds,clipped:full>MAX_WINDOW};
}
export async function renderScopeAudio(patch,beat,level=1,pitch=60,automation=null,isCurrent=()=>true){
 // Native mode must not silently render a Web Audio substitute.
 if(patch.type==="vocal")return vocalScope(patch,beat,level,isCurrent);
 return nativeEnabled()?nativeAudio(patch,beat,level,pitch,automation,isCurrent):webAudio(patch,beat,level,pitch,automation);
}
export function disposeSignalDisplay(root){mounted.get(root)?.dispose();}
export function createSignalDisplay(root,patch,beat,accent,initialLevel=1,referencePitch=60,automation=null,soundId=null){
 const previous=mounted.get(root);
 const previousState=previous?.soundId===soundId?previous.snapshot?.():null;
 previous?.dispose();
 root.replaceChildren();
 const wrapper=document.createElement("div");wrapper.className="signal-scope";
 wrapper.style.setProperty("--scope-accent",accent);
 const head=document.createElement("div");head.className="signal-scope-header";
 const title=document.createElement("span");title.className="signal-scope-title";
 title.textContent="waveform";
 const legend=document.createElement("span");legend.className="signal-scope-legend";legend.textContent="rendering";
 const compare=document.createElement("button");compare.type="button";
 compare.className="signal-scope-compare";compare.textContent="a/b";
 compare.setAttribute("aria-label","Hold waveform for comparison");
 compare.setAttribute("aria-pressed","false");
 head.append(title,legend,compare);
 const svg=node("svg",{viewBox:"0 0 720 264",preserveAspectRatio:"none",role:"img",
  "aria-label":"Measured audio waveform, stereo amplitude over time, and pitch movement"});
 svg.classList.add("signal-scope-graph");
 const guides=node("path",{d:"M0 76 H720 M0 132 H720 M0 172 H720 M0 198 H720 M0 232 H720",class:"signal-scope-guides"});
 const waveRight=node("path",{class:"signal-waveform signal-waveform-right",fill:"none","stroke-width":"1"});
 const waveLeft=node("path",{class:"signal-waveform signal-waveform-left",fill:"none","stroke-width":"1.65"});
 const left=node("path",{class:"signal-wave signal-amplitude-left",fill:"var(--scope-accent)",stroke:"none"});
 const right=node("path",{class:"signal-wave signal-amplitude-right",fill:"var(--scope-accent)",stroke:"none"});
 const pitches=[node("path",{class:"signal-pitch",fill:"none","stroke-width":"1.9"}),
  node("path",{class:"signal-pitch",fill:"none","stroke-width":"1.3","stroke-dasharray":"4 3",opacity:".65"})];
 // HTML labels remain legible regardless of the graph's SVG scaling.
 const chart=document.createElement("div");chart.className="signal-scope-chart";
 const label=(kind,value)=>{
  const el=document.createElement("span");
  el.className="signal-chart-label "+kind;el.textContent=value;return el;
 };
 const waveLabel=label("signal-chart-wave",""),end=label("signal-chart-end","");
 const gate=node("path",{class:"signal-scope-guides"});
 const reference=node("path",{class:"signal-scope-reference",fill:"none"});
 const marker=node("path",{class:"signal-scope-marker",fill:"none"});
 const seek=node("rect",{x:"0",y:"150",width:"720",height:"47",fill:"transparent",
  class:"signal-scope-seek",tabindex:"0",role:"slider",
  "aria-label":"Waveform position","aria-valuemin":"0","aria-valuemax":"0","aria-valuenow":"0"});
 svg.append(guides,reference,waveRight,waveLeft,left,right,...pitches,gate,marker,seek);
 chart.append(svg,waveLabel,label("signal-chart-time","l / r · time"),
  label("signal-chart-pitch","pitch"),end);
 wrapper.append(head,chart);root.append(wrapper);
 let revision=0,disposed=false,timer=null,currentLevel=initialLevel;
 let latestBuffer=null,latestSeconds=0;
 let seekSeconds=previousState?.seekSeconds??null,referenceBuffer=previousState?.referenceBuffer??null;
 if(referenceBuffer){
  compare.setAttribute("aria-pressed","true");
  compare.setAttribute("aria-label","Clear waveform comparison");
 }
 function paintWave(){
  if(!latestBuffer)return;
  const wave=scopeWaveformData(latestBuffer,referencePitch,620,seekSeconds);
  waveLeft.setAttribute("d",waveformPath(wave.channels[0]));
  waveRight.setAttribute("d",waveformPath(wave.channels[1]));
  waveLabel.textContent=Math.round(wave.windowSeconds*1000)+" ms · "+wave.startSeconds.toFixed(2)+"s";
  if(referenceBuffer){
   const captured=scopeWaveformData(referenceBuffer,referencePitch,620,wave.startSeconds);
   reference.setAttribute("d",waveformPath(captured.channels[0]));
  }else reference.removeAttribute("d");
  const max=Math.max(0,latestSeconds-wave.windowSeconds);
  const selected=seekSeconds===null?wave.startSeconds:clamp(seekSeconds,0,max);
  marker.setAttribute("d","M"+(selected/Math.max(.01,latestSeconds)*720).toFixed(2)+" 150 V197");
  seek.setAttribute("aria-valuemax",latestSeconds.toFixed(2));
  seek.setAttribute("aria-valuenow",selected.toFixed(2));
  seek.setAttribute("aria-valuetext",selected.toFixed(2)+" seconds");
 }
 const seekTo=fraction=>{
  if(!latestBuffer)return;
  seekSeconds=clamp(fraction,0,1)*latestSeconds;
  paintWave();
 };
 seek.addEventListener("pointerdown",event=>{
  if(!latestBuffer)return;
  event.preventDefault();
  const r=svg.getBoundingClientRect();
  seekTo((event.clientX-r.left)/r.width);
  seek.focus({preventScroll:true});
  seek.setPointerCapture(event.pointerId);
 });
 seek.addEventListener("pointermove",event=>{
  if(!seek.hasPointerCapture(event.pointerId))return;
  const r=svg.getBoundingClientRect();seekTo((event.clientX-r.left)/r.width);
 });
 seek.addEventListener("pointerup",event=>{
  if(seek.hasPointerCapture(event.pointerId))seek.releasePointerCapture(event.pointerId);
 });
 seek.addEventListener("keydown",event=>{
  if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
  event.preventDefault();
  const current=seekSeconds??0;
  seekSeconds=event.key==="Home"?0:event.key==="End"?latestSeconds:
   clamp(current+(event.key==="ArrowRight"?.05:-.05),0,latestSeconds);
  paintWave();
 });
 compare.addEventListener("click",()=>{
  if(!latestBuffer)return;
  if(referenceBuffer){referenceBuffer=null;compare.setAttribute("aria-pressed","false");
   compare.setAttribute("aria-label","Hold waveform for comparison");}
  else{referenceBuffer=latestBuffer;seekSeconds=scopeWaveformData(latestBuffer,referencePitch).startSeconds;
   compare.setAttribute("aria-pressed","true");compare.setAttribute("aria-label","Clear waveform comparison");}
  paintWave();
 });
 function update(nextPatch,level=currentLevel){
  currentLevel=level;const token=++revision;
  clearTimeout(timer);
  timer=setTimeout(()=>{
   const current=()=>!disposed&&token===revision;
   void renderLatest(current,()=>renderScopeAudio(nextPatch,beat,currentLevel,referencePitch,automation,current)).then(result=>{
    if(!result)return;const {buffer,seconds,clipped}=result;
    if(disposed||token!==revision)return;
    latestBuffer=buffer;latestSeconds=seconds;
    paintWave();
    const wave=scopeWaveformData(buffer,referencePitch,620,seekSeconds);
    const [l,r]=scopeAudioBins(buffer);
    left.setAttribute("d",envelopePath(l,0));right.setAttribute("d",envelopePath(r,1));
    pitches[0].setAttribute("d",pitchPath(nextPatch,seconds,referencePitch,0));
    const second=nextPatch.type==="synth"&&(nextPatch.oscillators[1].level>0||
     (nextPatch.modulation?.routes??[]).some(route=>route.target==="oscillators.1.level"));
    if(second)pitches[1].setAttribute("d",pitchPath(nextPatch,seconds,referencePitch,1));
    else pitches[1].removeAttribute("d");
    gate.setAttribute("d","M"+(HOLD/seconds*TIME_WIDTH).toFixed(2)+" 151 V193");
    end.textContent=seconds.toFixed(1)+"s";
    legend.textContent=(clipped?"first ":"")+seconds.toFixed(1)+"s";
    svg.setAttribute("aria-label","Measured "+Math.round(wave.windowSeconds*1000)+
     " millisecond stereo waveform at "+wave.startSeconds.toFixed(2)+" seconds, loudness over "+
     seconds.toFixed(1)+" seconds, and pitch movement"+(clipped?"; longer tail clipped":""));
    wrapper.removeAttribute("title");
   }).catch(error=>{
    if(disposed||token!==revision)return;
    latestBuffer=null;latestSeconds=0;reference.removeAttribute("d");marker.removeAttribute("d");
    waveLeft.removeAttribute("d");waveRight.removeAttribute("d");
    left.removeAttribute("d");right.removeAttribute("d");waveLabel.textContent="";
    pitches.forEach(line=>line.removeAttribute("d"));gate.removeAttribute("d");end.textContent="";
    legend.textContent="preview unavailable";wrapper.title=String(error.message||error);
   });
  },token===1?0:70);
 }
 mounted.set(root,{soundId,snapshot:()=>({seekSeconds,referenceBuffer}),dispose(){disposed=true;revision++;clearTimeout(timer);}});
 update(patch,initialLevel);
 return update;
}
