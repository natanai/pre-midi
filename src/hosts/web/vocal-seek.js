import {needsDynamics} from './dynamics.js';
import {prepareProcessorMix} from './processor-mix.js';
import {vocalSourceRange} from "../../../vocalEffects.js";
import {delayTailSeconds} from "../../dsp/effect-tail.js";
import {scheduleVocal} from "../../../songAudio.js";
import {ownVoice} from "./voice-session.js";
import {processorBypassed} from '../../dsp/processing-chain.js';

// A seek continuation is temporary rendered audio from the canonical graph,
// never an asset, WAV, preset, or project field. This restores Web Audio's
// otherwise inaccessible filter, oversampler and delay history without another
// DSP implementation. All authored controls remain on the original Clip.
export class VocalSeekCache{
 constructor({render,maxBytes=64*1024*1024,maxEntries=8}={}){
  this.render=render??renderVocalSeek;this.maxBytes=maxBytes;this.maxEntries=maxEntries;
  this.entries=new Map();this.pending=new Map();this.bytes=0;this.queue=Promise.resolve();
  this.buffers=new WeakMap();this.sequence=0;
 }
 key(request){
  if(!this.buffers.has(request.buffer))this.buffers.set(request.buffer,++this.sequence);
  const {recording,clip}=request.event;
  return JSON.stringify([this.buffers.get(request.buffer),request.sampleRate,request.phase,
   request.unit,recording.trimSeconds,recording.durationSeconds,
   clip.trimStartSeconds??0,clip.trimEndSeconds??0,clip.lengthSteps,clip.gain??1,clip.effects??null]);
 }
 get(request){
  const key=this.key(request),cached=this.entries.get(key);
  if(cached){this.entries.delete(key);this.entries.set(key,cached);return Promise.resolve(cached.value);}
  if(this.pending.has(key))return this.pending.get(key);
  // Only one OfflineAudioContext renders at a time; repeated seeks at the
  // same settings share the completed render or its in-flight preparation.
  const task=this.queue.then(()=>this.render(request)).then(value=>{
   const bytes=value.buffer.length*value.buffer.numberOfChannels*4;
   if(bytes<=this.maxBytes){
    while(this.entries.size&&(this.bytes+bytes>this.maxBytes||this.entries.size>=this.maxEntries)){
     const oldest=this.entries.keys().next().value;this.bytes-=this.entries.get(oldest).bytes;this.entries.delete(oldest);
    }
    this.entries.set(key,{value,bytes});this.bytes+=bytes;
   }
   return value;
  }).finally(()=>this.pending.delete(key));
  this.pending.set(key,task);this.queue=task.catch(()=>{});return task;
 }
}
export function vocalSeekEvents(song,step,decoded){
 if(song?.kind!=="song"||!(step>0))return [];
 const unit=60/song.bpm/4,recordings=new Map(song.recordings.map(r=>[r.id,r]));
 const entries=[];
 for(const track of song.tracks){
  if(track.kind!=="vocal")continue;
  for(const clip of track.clips){
   if(clip.startStep>=step)continue;
   const recording=recordings.get(clip.recordingId),buffer=recording&&decoded.get(recording.id);
   if(!buffer)continue;
   const range=vocalSourceRange(recording,clip,unit,0,{sourceDuration:buffer.duration}),fx=range.fx;
   if(!(fx.filter&&!processorBypassed(fx,'filter'))&&!(fx.drive>0&&!processorBypassed(fx,'drive'))&&!(fx.delayMix>0&&!processorBypassed(fx,'delay'))&&!needsDynamics(fx))continue;
   const elapsed=(step-clip.startStep)*unit,tail=delayTailSeconds(fx);
   if(elapsed>=range.duration+tail)continue;
   entries.push({event:structuredClone({recording,clip,track:{id:track.id,kind:"vocal"}}),buffer,unit,elapsed,range,tail});
  }
 }
 return entries;
}
export async function renderVocalSeek(request){
 const {event,buffer,sampleRate,phase,unit,range,tail}=request;
 if(typeof OfflineAudioContext!=="function")throw Error("This browser cannot prepare effectful vocal seeks");
 const seconds=phase+range.duration+tail+.02;
 const context=new OfflineAudioContext(2,Math.max(1,Math.ceil(seconds*sampleRate)),sampleRate);await prepareProcessorMix(context,event.clip.effects);
 scheduleVocal(context,context.destination,event,phase,unit,new Map([[event.recording.id,buffer]]),
  {sourceRange:range,controlStart:phase});
 return {buffer:await context.startRendering(),phase,duration:range.duration,tail};
}
const cache=new VocalSeekCache();
export async function prepareVocalSeek(song,step,decoded,sampleRate,{cycleStart=0,isCurrent=()=>true,seekCache=cache}={}){
 const prepared=new Map();
 for(const entry of vocalSeekEvents(song,step,decoded)){
  if(!isCurrent())throw Error("Playback request cancelled");
  const frames=(cycleStart+entry.event.clip.startStep)*entry.unit*sampleRate;
  let phase=((frames%128)+128)%128;
  if(phase<1e-7||128-phase<1e-7)phase=0;
  const rendered=await seekCache.get({...entry,sampleRate,phase:phase/sampleRate});
  if(!isCurrent())throw Error("Playback request cancelled");
  prepared.set(entry.event.clip.id,{...rendered,elapsed:entry.elapsed,clipId:entry.event.clip.id});
 }
 return prepared;
}
export function scheduleVocalSeek(context,destination,prepared,start,session,{fadeIn=false}={}){
 const {buffer,phase,elapsed,duration,clipId}=prepared;
 const first=Math.max(0,Math.ceil((phase+elapsed)*buffer.sampleRate-1e-9));
 if(first>=buffer.length)return;
 const source=context.createBufferSource(),gate=context.createGain();source.buffer=buffer;
 if(fadeIn){gate.gain.setValueAtTime(0,start);gate.gain.linearRampToValueAtTime(1,start+.005);}
 source.connect(gate);gate.connect(destination);
 const end=start+(buffer.length-first)/buffer.sampleRate;
 source.start(start,first/buffer.sampleRate);source.stop(end);
 const voice=ownVoice(context,{sources:[source],nodes:[gate],gate,start,
  release:Math.max(start,start+duration-elapsed),end,priority:elapsed<duration?1:0});
 voice.vocalClipId=clipId;
 if(session){
  if(elapsed<duration)session.adopt(voice,{allocationEnd:start+duration-elapsed});
  else session.addHistory(voice);
 }
 return voice;
}
