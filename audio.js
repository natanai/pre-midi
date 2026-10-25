import {resolveEvent} from "./soundModel.js";
import {eventsAtStep} from "./arrangement.js";
import { decodeSamples, scheduleSample, sampleForNote } from "./sampler.js";
import { strumOffset } from "./guitarTiming.js";
import { movement, schedulePitch, scheduleMovementLfo } from "./expression.js";
import {setOscillatorWave} from "./harmonics.js";
import {validatePatch} from "./synth.js";
import {driveCurve} from "./audioEffects.js";
// One synthesis engine for live transport, pitch preview and offline WAV output.
// Everything audible comes from the resolved sound patch stored in the score.
export const secondsPerStep = doc => 60/doc.bpm/4;
export const frequency = pitch => 440*2**((pitch-69)/12);
const noiseBuffers=new WeakMap();
const sampleCaches=new WeakMap();
const bufferCache=ctx=>{if(!sampleCaches.has(ctx))sampleCaches.set(ctx,new Map());return sampleCaches.get(ctx);};
export async function primeSamples(score){if(context)await decodeSamples(context,score,bufferCache(context));}
function noiseBuffer(ctx) {
 let data=noiseBuffers.get(ctx);
 if(data)return data;
 const samples=Math.ceil(ctx.sampleRate*2),buffer=ctx.createBuffer(1,samples,ctx.sampleRate);
 const channel=buffer.getChannelData(0);
 let seed=0x7f41a08b;
 for(let i=0;i<samples;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  channel[i]=((seed/4294967296)*2-1)*.85;
 }
 noiseBuffers.set(ctx,buffer);
 return buffer;
}
export const stepEvents = eventsAtStep;
function soundNote(ctx,destination,instrument,event,start,duration,score) {
 if(instrument.sounds){
  const resolved=resolveEvent(instrument,event);
  if(!resolved)return;
  if(instrument.layout==="rack"&&resolved.voice.patch.type==="synth")
   duration=Math.max(.015,resolved.voice.patch.envelope.attack+resolved.voice.patch.envelope.decay);
  instrument=resolved.voice;event=resolved.note;
 }
 if(instrument.patch.type==="sample"){
  scheduleSample(ctx,destination,instrument,event,start,duration,score,bufferCache(ctx));
  return;
 }
 const patch=instrument.patch,off=start+Math.max(.015,duration),env=patch.envelope;
 const motion=movement(patch);
 const end=off+env.release+.012,cleanupAt=end+(patch.effects.delayMix>0?2.4:.15);
 const sources=[],nodes=[];
 const add=node=>{nodes.push(node);return node;};
 const mix=add(ctx.createGain());
 const sourceLevel=patch.oscillators.reduce((sum,osc)=>sum+osc.level,0)+patch.noise;
 const norm=sourceLevel>0?1/Math.max(1,sourceLevel):0;
 const peak=Math.max(.000001,Math.min(.31,instrument.volume*event.velocity*.27)*norm);
 for(const slot of patch.oscillators){
  if(!slot.level)continue;
  const oscillator=ctx.createOscillator();
  const gain=add(ctx.createGain());
  setOscillatorWave(ctx,oscillator,slot);
  oscillator.frequency.setValueAtTime(Math.min(18000,frequency(event.pitch)*2**slot.octave),start);
  schedulePitch(ctx,oscillator.detune,{...event,bend:event.bend??patch.bend},motion,start,duration,slot.detune);
  gain.gain.value=slot.level;
  oscillator.connect(gain);gain.connect(mix);
  oscillator.start(start);oscillator.stop(end);
  sources.push(oscillator);
 }
 if(patch.noise>0) {
  const source=ctx.createBufferSource(),gain=add(ctx.createGain());
  source.buffer=noiseBuffer(ctx);source.loop=true;
  gain.gain.setValueAtTime(patch.noise,start);
   if((patch.noiseDecay??0)>0)gain.gain.setTargetAtTime(0,start,Math.max(.002,patch.noiseDecay/5));
  source.connect(gain);gain.connect(mix);
  source.start(start);source.stop(end);
  sources.push(source);
 }
 const filter=add(ctx.createBiquadFilter());
 filter.type=patch.filter.type;
 const sweep=patch.filter.sweep??0;
  if(sweep!==0){
   const first=Math.max(50,Math.min(14000,patch.filter.cutoff*2**sweep));
   filter.frequency.setValueAtTime(first,start);
   filter.frequency.exponentialRampToValueAtTime(patch.filter.cutoff,
    start+Math.min(duration,patch.filter.sweepTime??.2));
  }else filter.frequency.setValueAtTime(patch.filter.cutoff,start);
 filter.Q.setValueAtTime(patch.filter.resonance,start);
 mix.connect(filter);
 if(motion.tone>0)scheduleMovementLfo(ctx,filter.frequency,start,duration,
  motion.toneRate,patch.filter.cutoff*motion.tone*.8);
 let signal=filter;
 if(patch.effects.drive>0){
  const shaper=add(ctx.createWaveShaper());
  shaper.curve=driveCurve(patch.effects.drive);
  shaper.oversample="none";
  const compensation=add(ctx.createGain());
  compensation.gain.value=1/(1+patch.effects.drive*1.1);
  signal.connect(shaper);shaper.connect(compensation);signal=compensation;
 }
 const amp=add(ctx.createGain());
 const attack=Math.min(env.attack,Math.max(.003,(off-start)*.8));
 const attackEnd=start+Math.max(.002,attack);
 const decayEnd=Math.min(off,attackEnd+env.decay);
 amp.gain.setValueAtTime(0,start);
 amp.gain.linearRampToValueAtTime(peak,attackEnd);
 const sustain=peak*env.sustain;
 if(decayEnd>attackEnd)amp.gain.linearRampToValueAtTime(sustain,decayEnd);
 else if(off>attackEnd)amp.gain.setValueAtTime(peak,off);
 const atOff=decayEnd<=attackEnd?peak:sustain;
 amp.gain.setValueAtTime(atOff,off);
 amp.gain.linearRampToValueAtTime(.000001,end);
 signal.connect(amp);
 const pan=add(ctx.createStereoPanner());
 pan.pan.value=patch.pan;
const pulse=add(ctx.createGain());
 pulse.gain.setValueAtTime(1,start);
 if(motion.tremolo>0)scheduleMovementLfo(ctx,pulse.gain,start,duration,
  motion.tremoloRate,motion.tremolo*.45);
 amp.connect(pulse);pulse.connect(pan);
 const fx=patch.effects,mixAmount=fx.delayMix;
 const dry=add(ctx.createGain());
 dry.gain.value=1-mixAmount*.4;
 pan.connect(dry);dry.connect(destination);
 if(mixAmount>0) {
  const send=add(ctx.createGain()),delay=add(ctx.createDelay(1.2)),
   feedback=add(ctx.createGain()),wet=add(ctx.createGain());
  send.gain.value=mixAmount*.55;
  delay.delayTime.value=fx.delayTime;
  feedback.gain.value=fx.delayFeedback;
  wet.gain.value=.8;
  pan.connect(send);send.connect(delay);
  delay.connect(feedback);feedback.connect(delay);
  delay.connect(wet);wet.connect(destination);
 }
 // Keep echo tails audible before detaching the voice. Offline contexts dispose
 // their graph after rendering; timers are needed only for ongoing live sessions.
 if(typeof OfflineAudioContext==="undefined" || !(ctx instanceof OfflineAudioContext)) {
  const ms=Math.max(0,(cleanupAt-ctx.currentTime)*1000);
  setTimeout(()=>{
   for(const source of sources){try{source.disconnect();}catch{}}
   for(const node of nodes){try{node.disconnect();}catch{}}
  },ms+30);
 }
}
function eventOffset(instrument,note,notes){
 if(instrument.layout==="rack")return 0;
 const voice=instrument.sounds?resolveEvent(instrument,note)?.voice:instrument;
 return voice?strumOffset(voice,note,notes):0;
}
function renderBar(ctx,out,score,bar,start) {
 const unit=secondsPerStep(score);
 for(let step=0;step<16;step++){
  for(const event of stepEvents(score,bar*16+step)){
   soundNote(ctx,out,event.instrument,event.note,
    start+step*unit+eventOffset(event.instrument,event.note,event.chunk.notes),
    event.note.duration*unit,score);
  }
 }
}
let context;
export async function audition(instrument,pitch,score=null,expression=null) {
 let hitDuration=null;
 if(instrument.sounds){
  const sound=instrument.sounds.find(sound=>sound.id===expression?.soundId)||instrument.sounds[0];
  pitch=instrument.layout==="rack"?sound.referencePitch:pitch;
  if(instrument.layout==="rack"&&sound.patch.type==="synth")hitDuration=Math.max(.015,sound.patch.envelope.attack+sound.patch.envelope.decay);
  instrument={patch:sound.patch,volume:instrument.volume*sound.gain};
 }
 context||=new AudioContext();
 if(context.state!=="running")await context.resume();
 if(score){
  const zone=instrument.patch?.type==="sample"?sampleForNote(instrument.patch,pitch,expression?.velocity??.8):null;
  await decodeSamples(context,score,bufferCache(context),new Set(zone?[zone.assetId]:[]));
 }
 soundNote(context,context.destination,instrument,
  {pitch,velocity:expression?.velocity??.8,bend:expression?.bend},
  context.currentTime+.01,hitDuration??expression?.duration??.24,score);
}
// Preview a real acoustic chord through the exact same sample voice and
// strumOffset implementation used by timeline playback and WAV export.
export async function auditionChord(instrument,pitches,score,velocity=.85) {
 if(instrument.sounds)instrument={patch:instrument.sounds[0].patch,volume:instrument.volume*instrument.sounds[0].gain};
 context||=new AudioContext();
 if(context.state!=="running")await context.resume();
 const notes=pitches.map((pitch,index)=>({
  id:"preview-"+index,pitch,start:0,duration:8,velocity
 }));
 const needs=new Set(notes.map(n=>instrument.patch.type==="sample"?
  sampleForNote(instrument.patch,n.pitch,n.velocity)?.assetId:null).filter(Boolean));
 await decodeSamples(context,score,bufferCache(context),needs);
 const now=context.currentTime+.04,duration=.8;
 for(const note of notes){
  soundNote(context,context.destination,instrument,note,
   now+strumOffset(instrument,note,notes),duration,score);
 }
}
export async function play(score,{loop=false,onPosition=()=>{},onProgress=()=>{},onStop=()=>{}}={}) {
 context||=new AudioContext();
 if(context.state!=="running")await context.resume();
 const ctx=context,out=ctx.createGain(),read=typeof score==="function"?score:()=>score;
 await decodeSamples(ctx,read(),bufferCache(ctx));
 const loops=()=>typeof loop==="function"?loop():loop;
 out.gain.value=.85;out.connect(ctx.destination);
 let scheduled=0,nextTime=ctx.currentTime+.07,shown=-1,stopped=false,timer,activeStep=null;
 const queue=[];
 function stop() {
  if(stopped)return;
  stopped=true;clearInterval(timer);
  const now=ctx.currentTime;
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(Math.max(0,out.gain.value),now);
  out.gain.linearRampToValueAtTime(0,now+.025);
  setTimeout(()=>{try{out.disconnect();}catch{}},150);
  onStop();
 }
 function tick() {
  if(stopped)return;
  let guarded=0;
  while(nextTime<ctx.currentTime+.095 && guarded++<24) {
   const current=read(),cycle=current.bars*16;
   if(!loops()&&scheduled>=cycle)break;
   const step=scheduled%cycle,barIndex=Math.floor(step/16),unit=secondsPerStep(current);
   void decodeSamples(ctx,current,bufferCache(ctx)).catch(console.warn);
   for(const event of stepEvents(current,scheduled))
    soundNote(ctx,out,event.instrument,event.note,
     nextTime+eventOffset(event.instrument,event.note,event.chunk.notes),
     event.note.duration*unit,current);
   queue.push({time:nextTime,barIndex,step:step%16,absolute:scheduled,unit});
   nextTime+=unit;scheduled++;
  }
  while(queue.length&&queue[0].time<=ctx.currentTime) {
   const now=queue.shift();
   activeStep=now;
   if(now.absolute!==shown) {shown=now.absolute;onPosition(now.barIndex,now.step);}
  }
  if(activeStep) {
   const elapsed=Math.max(0,ctx.currentTime-activeStep.time);
   onProgress(activeStep.barIndex,Math.min(16,activeStep.step+Math.min(1,elapsed/activeStep.unit)));
  }
  const current=read();
  if(!loops()&&scheduled>=current.bars*16&&ctx.currentTime>nextTime+1.1)stop();
 }
 timer=setInterval(tick,25);tick();return {stop};
}
function pcmWav(buffer) {
 const ch=Math.min(2,buffer.numberOfChannels),size=buffer.length*ch*2;
 const result=new ArrayBuffer(44+size),v=new DataView(result);
 const data=Array.from({length:ch},(_,c)=>buffer.getChannelData(c));
 const label=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
 label(0,"RIFF");v.setUint32(4,36+size,true);label(8,"WAVE");label(12,"fmt ");
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);
 v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*ch*2,true);
 v.setUint16(32,ch*2,true);v.setUint16(34,16,true);
 label(36,"data");v.setUint32(40,size,true);
 let pos=44;
 for(let i=0;i<buffer.length;i++)for(let c=0;c<ch;c++) {
  const n=Math.max(-1,Math.min(1,data[c][i]));
  v.setInt16(pos,n<0?n*32768:n*32767,true);pos+=2;
 }
 return new Blob([result],{type:"audio/wav"});
}
// The converter renders the same voice as transport, audition, and WAV export.
// No approximate JavaScript synthesizer is used to judge a candidate patch.
export async function renderSynthBuffer(patch,pitch,duration,{sampleRate=22050,seconds=duration+patch.envelope.release+.012}={}){
 const issues=validatePatch(patch);
 if(patch.type!=="synth"||issues.length)throw Error(issues.join("\n")||"Choose a synth patch.");
 if(!Number.isFinite(pitch)||pitch<0||pitch>127||!Number.isFinite(duration)||duration<=0||duration>4||
  !Number.isFinite(seconds)||seconds<=0||seconds>8)throw Error("Invalid synth preview duration or pitch.");
 const ctx=new OfflineAudioContext(1,Math.ceil(seconds*sampleRate),sampleRate);
 soundNote(ctx,ctx.destination,{patch,volume:1},{pitch,velocity:1},0,duration,null);
 return ctx.startRendering();
}
export async function wav(score) {
 // Decode once, before choosing the render length: full one-shot tails can
 // extend beyond the old fixed 4.5-second pad. AudioBuffers are reusable.
 const decoder=new OfflineAudioContext(2,1,44100),decoded=new Map();
 await decodeSamples(decoder,score,decoded);
 let seconds=score.bars*16*secondsPerStep(score)+4.5;
 const unit=secondsPerStep(score);
 for(let bar=0;bar<score.bars;bar++)for(const instrument of score.instruments){
  const chunk=instrument.chunks.find(chunk=>chunk.id===instrument.timeline[bar]);
  for(const event of chunk?.notes||[]){
   const resolved=resolveEvent(instrument,event);if(!resolved)continue;
   const patch=resolved.voice.patch;
   let tail;
   if(patch.type==="sample"){
    const zone=sampleForNote(patch,resolved.note.pitch,event.velocity),buffer=zone&&decoded.get(zone.assetId);
    const rate=zone?(patch.followPitch?2**((resolved.note.pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12)):1;
    const length=buffer?buffer.duration/rate:0;
    tail=patch.oneShot?length:Math.min(length,event.duration*unit+patch.release);
   }else{
    const gate=instrument.layout==="rack"?Math.max(.015,patch.envelope.attack+patch.envelope.decay):event.duration*unit;
    tail=gate+patch.envelope.release+(patch.effects.delayMix>0?2.4:.15)+.012;
   }
   seconds=Math.max(seconds,(bar*16+event.start)*unit+eventOffset(instrument,event,chunk.notes)+tail+.02);
  }
 }
 const ctx=new OfflineAudioContext(2,Math.ceil(seconds*44100),44100);
 sampleCaches.set(ctx,decoded);
 const out=ctx.createGain();out.gain.value=.85;out.connect(ctx.destination);
 for(let bar=0;bar<score.bars;bar++)renderBar(ctx,out,score,bar,bar*16*unit);
 return pcmWav(await ctx.startRendering());
}
