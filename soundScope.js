// The scope measures real playback PCM; it is not a separate illustrative synth.
import {movement,pitchCents} from "./expression.js";
import {envelopeLevelAt} from "./src/dsp/amplitude-envelope.js";
import {delayTailSeconds} from "./src/dsp/effect-tail.js";
import {routeValueAt,smoothingAlpha} from "./src/dsp/modulation.js";
import {planSynthVoice} from "./src/dsp/synth-voice.js";
import {scheduleSynthPlan} from "./audio.js";
import {scheduleSample,sampleForNote} from "./sampler.js";
import {getAsset} from "./assetRegistry.js";
import {nativeEnabled,nativeRequest,nativePlans,nativeRequiredAssets,prepareNativeAssets,renderNative} from "./src/hosts/native/session.js";

const NS="http://www.w3.org/2000/svg",RATE=44100,HOLD=1.25,MAX_WINDOW=12,COUNT=300,TIME_WIDTH=720;
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
// Zoom to a few cycles of the real audio, rather than manufacturing a wave
// from patch parameters. All sound edits use the same fixed amplitude mapping;
// neither channel nor patch is normalized independently.
export function scopeWaveformData(buffer,referencePitch=60,count=620){
 const rate=buffer.sampleRate;
 const fundamental=440*2**((referencePitch-69)/12);
 const size=Math.min(buffer.length,Math.max(2,Math.round(rate*clamp(7/fundamental,.018,.12))));
 const channelData=[buffer.getChannelData(0),
  buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1))];
 // A slow attack or plucked transient should not leave a mostly empty wave.
 // Select one genuinely audible slice in the first held second, using the
 // identical timing and sample indices for the left and right channels.
 const latest=Math.max(0,Math.min(buffer.length-size,Math.round(rate*1.08)));
 let start=0,best=-1;
 for(let k=0;k<15;k++){
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
 const rate=zone?(patch.followPitch?2**((pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12)):1;
 const original=buffer?buffer.duration/rate:0;
 const life=buffer?(patch.oneShot?original:Math.min(original,HOLD+patch.release)):0;
 const seconds=scopeWindowSeconds(patch,life),context=new OfflineAudioContext(2,Math.ceil(seconds*RATE),RATE);
 const voice={patch,volume:level},note={pitch,velocity:1};
 if(buffer)scheduleSample(context,context.destination,voice,note,0,HOLD,beat,new Map([[zone.assetId,buffer]]));
 else scheduleSynthPlan(context,context.destination,planSynthVoice(voice,note,0,HOLD,
  automation?{automation,timeline:{step:0,unit:60/(beat?.bpm??120)/4,
   limitStep:(beat?.bars??8)*16}}:{}));
 const output=await context.startRendering();
 const full=patch.type==="sample"?life+.08:HOLD+patch.envelope.release+delayTailSeconds(patch.effects)+.08;
 return {buffer:output,seconds,clipped:full>MAX_WINDOW};
}
async function nativeAudio(patch,beat,level,pitch,automation){
 const event={kind:"note",instrument:{patch,volume:level,...(automation?{automation}:{})},
  note:{pitch,velocity:1},at:0,duration:HOLD,
  ...(automation?{timeline:{step:0,unit:60/(beat?.bpm??120)/4,
   limitStep:(beat?.bars??8)*16}}:{})};
 const ids=nativeRequiredAssets([event]);
 // Match the configured native device rate even for purely synthesized sounds.
 const status=await nativeRequest({action:"status"});
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
export async function renderScopeAudio(patch,beat,level=1,pitch=60,automation=null){
 // Native mode must not silently render a Web Audio substitute.
 return nativeEnabled()?nativeAudio(patch,beat,level,pitch,automation):webAudio(patch,beat,level,pitch,automation);
}
export function createSignalDisplay(root,patch,beat,accent,initialLevel=1,referencePitch=60,automation=null){
 mounted.get(root)?.dispose();
 root.replaceChildren();
 const wrapper=document.createElement("div");wrapper.className="signal-scope";
 wrapper.style.setProperty("--scope-accent",accent);
 const head=document.createElement("div");head.className="signal-scope-header";
 const title=document.createElement("span");title.className="signal-scope-title";
 title.textContent="waveform";
 const legend=document.createElement("span");legend.className="signal-scope-legend";legend.textContent="rendering";
 head.append(title,legend);
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
 const label=(x,y,content)=>{const el=node("text",{x,y,class:"signal-axis"});el.textContent=content;return el;};
 const waveLabel=label(8,13,"waveform"),end=label(671,146,"");
 const gate=node("path",{class:"signal-scope-guides"});
 svg.append(guides,waveRight,waveLeft,left,right,...pitches,waveLabel,
  label(8,146,"l / r · time"),label(8,212,"pitch"),end,gate);
 wrapper.append(head,svg);root.append(wrapper);
 let revision=0,disposed=false,timer=null,currentLevel=initialLevel;
 function update(nextPatch,level=currentLevel){
  currentLevel=level;const token=++revision;
  clearTimeout(timer);
  timer=setTimeout(()=>{
   void renderScopeAudio(nextPatch,beat,currentLevel,referencePitch,automation).then(({buffer,seconds,clipped})=>{
    if(disposed||token!==revision)return;
    const wave=scopeWaveformData(buffer,referencePitch);
    waveLeft.setAttribute("d",waveformPath(wave.channels[0]));
    waveRight.setAttribute("d",waveformPath(wave.channels[1]));
    waveLabel.textContent="waveform · "+Math.round(wave.windowSeconds*1000)+"ms";
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
    waveLeft.removeAttribute("d");waveRight.removeAttribute("d");
    left.removeAttribute("d");right.removeAttribute("d");waveLabel.textContent="waveform";
    pitches.forEach(line=>line.removeAttribute("d"));gate.removeAttribute("d");end.textContent="";
    legend.textContent="preview unavailable";wrapper.title=String(error.message||error);
   });
  },token===1?0:70);
 }
 mounted.set(root,{dispose(){disposed=true;revision++;clearTimeout(timer);}});
 update(patch,initialLevel);
 return update;
}
