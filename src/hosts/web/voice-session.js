import {VoiceAllocator,STEAL_FADE_SECONDS} from "../../dsp/voice-allocator.js";
import {delayTailSeconds} from "../../dsp/effect-tail.js";
export const isOffline=context=>typeof OfflineAudioContext!=="undefined"&&context instanceof OfflineAudioContext;
const disconnect=node=>{try{node.disconnect();}catch{}};
// A stop gate only ever goes from unity to zero; it never cancels authored ADSR.
// Schedule a fade before source termination, including already-queued notes.
export function ownVoice(context,{sources,nodes,gate,start,release,end,priority=0}){
 let finish=end,disposed=false,onDispose=()=>{};
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
 return {start,release,priority,get end(){return finish;},get disposed(){return disposed;},
  set onDispose(callback){onDispose=callback;},
  stop(at){
   const when=Math.max(context.currentTime,at),fadeEnd=when<=start?when:when+STEAL_FADE_SECONDS;
   if(fadeEnd>=finish)return finish;
   if(when<=start){
    finish=context.currentTime;
    for(const source of sources){try{source.stop(context.currentTime);}catch{}}
    dispose();return finish;
   }
   finish=fadeEnd;
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
  this.voices=new Map();this.buses=new Map();this.end=0;this.closed=false;this.steals=0;this.chronological=chronological;
 }
 adopt(voice){
  if(!voice)return;
  if(this.closed){voice.stop(this.context.currentTime);return voice;}
  const now=isOffline(this.context)&&this.chronological?voice.start:this.context.currentTime;
  if(voice.end<=now){voice.dispose();return voice;}
  const start=Math.max(voice.start,now);
  const allocation=this.allocator.admit({start,release:Math.max(start,voice.release),end:voice.end,priority:voice.priority},now);
  for(const steal of allocation.steals){this.voices.get(steal.id)?.stop(steal.at);this.steals++;}
  this.voices.set(allocation.id,voice);this.end=Math.max(this.end,voice.end);
  voice.onDispose=()=>this.voices.delete(allocation.id);
  return voice;
 }
 delay(effects,inputEnd){
  const key=JSON.stringify([effects.delayMix,effects.delayTime,effects.delayFeedback]);
  let bus=this.buses.get(key);
  if(!bus){
   const context=this.context,send=context.createGain(),delay=context.createDelay(1.2),feedback=context.createGain(),wet=context.createGain();
   send.gain.value=effects.delayMix*.55;delay.delayTime.value=effects.delayTime;
   feedback.gain.value=effects.delayFeedback;wet.gain.value=.8;
   send.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(this.destination);
   bus={input:send,nodes:[send,delay,feedback,wet],end:0};this.buses.set(key,bus);
  }
  bus.end=Math.max(bus.end,inputEnd+delayTailSeconds(effects));
  this.end=Math.max(this.end,bus.end);
  return bus.input;
 }
 sweep(){
  const now=this.context.currentTime;this.allocator.prune(now);
  for(const [key,bus] of this.buses)if(now>=bus.end){bus.nodes.forEach(disconnect);this.buses.delete(key);}
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
