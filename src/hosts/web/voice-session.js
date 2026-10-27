import {VoiceAllocator,STEAL_FADE_SECONDS} from "../../dsp/voice-allocator.js";
import {delayTailSeconds} from "../../dsp/effect-tail.js";
export const isOffline=context=>typeof OfflineAudioContext!=="undefined"&&context instanceof OfflineAudioContext;
const disconnect=node=>{try{node.disconnect();}catch{}};
// A stop gate only ever goes from unity to zero; it never cancels authored ADSR.
// Schedule a fade before source termination, including already-queued notes.
export function ownVoice(context,{sources,nodes,gate,start,release,end,priority=0}){
 let finish=end,disposed=false,cancelled=false,retiring=false,retireAt=Infinity,onDispose=()=>{};
 const naturalEnd=context.createBufferSource();
 naturalEnd.buffer=context.createBuffer(1,1,context.sampleRate);
 sources.push(naturalEnd);naturalEnd.start(end);
 const dispose=()=>{
  if(disposed)return;disposed=true;
  for(const source of sources)disconnect(source);
  for(const node of nodes)disconnect(node);
  onDispose();
 };
 naturalEnd.onended=dispose;
 return {start,release,priority,admitted:false,get cancelled(){return cancelled;},get retiring(){return retiring&&context.currentTime>=retireAt;},get end(){return finish;},get disposed(){return disposed;},
  set onDispose(callback){onDispose=callback;},
  discard(){
   cancelled=true;finish=context.currentTime;
   gate.gain.cancelScheduledValues(context.currentTime);gate.gain.setValueAtTime(0,context.currentTime);
   for(const source of sources){try{source.stop(context.currentTime);}catch{}}
   dispose();
  },
  stop(at){
   const when=Math.max(context.currentTime,at),fadeEnd=when<=start?when:when+STEAL_FADE_SECONDS;
   if(fadeEnd>=finish)return finish;
   if(when<=start){
    cancelled=true;finish=context.currentTime;
    for(const source of sources){try{source.stop(context.currentTime);}catch{}}
    dispose();return finish;
   }
   retiring=true;retireAt=when;finish=fadeEnd;
   gate.gain.cancelScheduledValues(when);
   if(when<=start)gate.gain.setValueAtTime(0,when);
   else{gate.gain.setValueAtTime(1,when);gate.gain.linearRampToValueAtTime(0,fadeEnd);}
   for(const source of sources){try{source.stop(fadeEnd);}catch{}}
   return finish;
  },dispose};
}
export class VoiceSession{
 constructor(context,destination,{maxVoices=64,chronological=false}={}){
  this.context=context;this.destination=destination;this.allocator=new VoiceAllocator(maxVoices);
  this.voices=new Map();this.buses=new Map();this.admitted=0;this.rejected=0;this.closed=false;this.steals=0;this.chronological=chronological;
 }
 adopt(voice){
  if(!voice)return;
  if(this.closed){voice.discard();this.rejected++;return voice;}
  const now=isOffline(this.context)&&this.chronological?voice.start:this.context.currentTime;
  if(voice.end<=now){voice.dispose();return voice;}
  const start=Math.max(voice.start,now);
  const allocation=this.allocator.admit({start,release:Math.max(start,voice.release),end:voice.end,priority:voice.priority},now);
  if(allocation.status==="rejected"){voice.discard();this.rejected++;return voice;}
  voice.admitted=true;this.admitted++;
  for(const steal of allocation.steals){this.voices.get(steal.id)?.stop(steal.at);this.steals++;}
  this.voices.set(allocation.id,voice);
  voice.onDispose=()=>this.voices.delete(allocation.id);
  return voice;
 }
 get end(){
  return Math.max(0,...[...this.voices.values()].map(voice=>voice.end),...[...this.buses.values()].map(bus=>bus.end));
 }
 get diagnostics(){
  const now=this.context.currentTime;
  return {voices:this.voices.size,buses:this.buses.size,limit:this.allocator.limit,admitted:this.admitted,rejected:this.rejected,
   steals:this.steals,stolen:this.steals,active:this.allocator.activeAt(now),
   queued:this.allocator.records.filter(voice=>voice.start>now&&voice.end>voice.start).length,
   retiring:[...this.voices.values()].filter(voice=>voice.retiring&&voice.end>now).length};
 }
 delay(effects,voice){
  const key=JSON.stringify([effects.delayMix,effects.delayTime,effects.delayFeedback]);
  let bus=this.buses.get(key);
  if(!bus){
   const context=this.context,send=context.createGain(),delay=context.createDelay(1.2),feedback=context.createGain(),wet=context.createGain();
   send.gain.value=effects.delayMix*.55;delay.delayTime.value=effects.delayTime;
   feedback.gain.value=effects.delayFeedback;wet.gain.value=.8;
   send.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(this.destination);
   bus={input:send,nodes:[send,delay,feedback,wet],inputs:new Set(),tail:delayTailSeconds(effects),
    get end(){return Math.max(0,...[...this.inputs].filter(voice=>!voice.cancelled).map(voice=>voice.end+this.tail));}};this.buses.set(key,bus);
  }
  bus.inputs.add(voice);
  return bus.input;
 }
 sweep(){
  const now=this.context.currentTime;this.allocator.prune(now);
  for(const [key,bus] of this.buses){
   for(const voice of bus.inputs)if(voice.cancelled||now>=voice.end+bus.tail)bus.inputs.delete(voice);
   if(!bus.inputs.size){bus.nodes.forEach(disconnect);this.buses.delete(key);}
  }
 }
 stop(at=this.context.currentTime){
  if(this.closed)return;this.closed=true;
  if(!this.voices.size&&!this.buses.size){this.allocator.clear();return;}
  let end=at;
  for(const voice of this.voices.values())end=Math.max(end,voice.stop(at));
  for(const bus of this.buses.values()){
   const wet=bus.nodes.at(-1);wet.gain.cancelScheduledValues(at);wet.gain.setValueAtTime(.8,at);wet.gain.linearRampToValueAtTime(0,at+STEAL_FADE_SECONDS);
  }
  // Audio-time cleanup keeps working if the UI timer is throttled or suspended.
  const deadline=this.context.createBufferSource();deadline.buffer=this.context.createBuffer(1,1,this.context.sampleRate);
  deadline.onended=()=>{for(const voice of this.voices.values())voice.dispose();this.voices.clear();for(const bus of this.buses.values())bus.nodes.forEach(disconnect);this.buses.clear();this.allocator.clear();disconnect(deadline);};
  deadline.start(Math.max(end,at+STEAL_FADE_SECONDS)+.001);
 }
}
