import {resolveEvent} from "./soundModel.js";
import {eventsAtStep} from "./arrangement.js";
import {eventsAtSongStep,songDurationSteps} from "./songModel.js";
import {decodeSongRecordings,recordingEventsAtStep,scheduleVocal} from "./songAudio.js";
import { decodeSamples, scheduleSample, sampleForNote } from "./sampler.js";
import { strumOffset } from "./guitarTiming.js";
import { schedulePitchPlan, scheduleMovementLfo } from "./expression.js";
import {setOscillatorWave} from "./harmonics.js";
import {validatePatch} from "./synth.js";
import {configureDriveShaper} from "./audioEffects.js";
import {applyAmplitudePlan} from "./envelope.js";
import {planSynthVoice,noteFrequency} from "./src/dsp/synth-voice.js";
import {VoiceSession,ownVoice} from "./src/hosts/web/voice-session.js";
// One synthesis engine for live transport, pitch preview and offline WAV output.
// Everything audible comes from the resolved sound patch stored in the beat.
export const secondsPerStep = doc => 60/doc.bpm/4;
export const frequency = noteFrequency;
const noiseBuffers=new WeakMap();
const sampleCaches=new WeakMap();
const bufferCache=ctx=>{if(!sampleCaches.has(ctx))sampleCaches.set(ctx,new Map());return sampleCaches.get(ctx);};
export async function primeSamples(beat){if(context)await decodeSamples(context,beat,bufferCache(context));}
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
export function scheduleNote(ctx,destination,instrument,event,start,duration,beat,session=null) {
 if(instrument.sounds){
  const resolved=resolveEvent(instrument,event);
  if(!resolved)return;
  if(instrument.layout==="rack"&&resolved.voice.patch.type==="synth")
   duration=Math.max(.015,resolved.voice.patch.envelope.attack+resolved.voice.patch.envelope.decay);
  instrument=resolved.voice;event=resolved.note;
 }
 if(instrument.patch.type==="sample"){
  return scheduleSample(ctx,destination,instrument,event,start,duration,beat,bufferCache(ctx),session);
 }
 return scheduleSynthPlan(ctx,destination,planSynthVoice(instrument,event,start,duration),session);
}
export function scheduleSynthPlan(ctx,destination,plan,session=null){
 if(plan.contract!=="pre-midi-synth-voice"||plan.version!==1)throw Error("Unsupported synth voice plan");
 const {patch,off,end,start,duration}=plan,motion=plan.movement;
 const sources=[],nodes=[],owner={sources,nodes};
 const add=node=>{nodes.push(node);return node;};
 const mix=add(ctx.createGain());
 for(const slot of plan.oscillators){
  if(!slot.level)continue;
  const oscillator=ctx.createOscillator();
  const gain=add(ctx.createGain());
  setOscillatorWave(ctx,oscillator,slot);
  oscillator.frequency.setValueAtTime(slot.frequency,start);
  schedulePitchPlan(ctx,oscillator.detune,slot.pitch,owner);
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
 filter.frequency.setValueAtTime(plan.filter.startCutoff,start);
 if(sweep!==0)filter.frequency.exponentialRampToValueAtTime(patch.filter.cutoff,plan.filter.sweepEnd);
 filter.Q.setValueAtTime(patch.filter.resonance,start);
 mix.connect(filter);
 if(motion.tone>0)scheduleMovementLfo(ctx,filter.frequency,start,duration,
  motion.toneRate,patch.filter.cutoff*motion.tone*.8,owner);
 let signal=filter;
 if(patch.effects.drive>0){
  const shaper=add(ctx.createWaveShaper());
  configureDriveShaper(shaper,patch.effects.drive);
  const compensation=add(ctx.createGain());
  compensation.gain.value=1/(1+patch.effects.drive*1.1);
  signal.connect(shaper);shaper.connect(compensation);signal=compensation;
 }
 const amp=add(ctx.createGain());
 applyAmplitudePlan(amp.gain,plan.amplitude);
 signal.connect(amp);
 const pan=add(ctx.createStereoPanner());
 pan.pan.value=patch.pan;
const pulse=add(ctx.createGain());
 pulse.gain.setValueAtTime(1,start);
 if(motion.tremolo>0)scheduleMovementLfo(ctx,pulse.gain,start,duration,
  motion.tremoloRate,motion.tremolo*.45,owner);
 const gate=add(ctx.createGain());
 amp.connect(pulse);pulse.connect(gate);gate.connect(pan);
 const fx=patch.effects,mixAmount=fx.delayMix;
 const dry=add(ctx.createGain());
 dry.gain.value=1-mixAmount*.4;
 pan.connect(dry);dry.connect(destination);
 if(mixAmount>0){
  if(session)pan.connect(session.delay(fx,plan.graphEnd));
  else{
   const send=add(ctx.createGain()),delay=add(ctx.createDelay(1.2)),feedback=add(ctx.createGain()),wet=add(ctx.createGain());
   send.gain.value=mixAmount*.55;delay.delayTime.value=fx.delayTime;feedback.gain.value=fx.delayFeedback;wet.gain.value=.8;
   pan.connect(send);send.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(destination);
  }
 }
 const voice=ownVoice(ctx,{sources,nodes,gate,start,release:off,end:session?plan.graphEnd:plan.audibleEnd});
 return session?session.adopt(voice):voice;
}
function eventOffset(instrument,note,notes){
 if(instrument.layout==="rack")return 0;
 const voice=instrument.sounds?resolveEvent(instrument,note)?.voice:instrument;
 return voice?strumOffset(voice,note,notes):0;
}
let context,previewSession,previewTimer;
function previews(){
 if(!previewSession||previewSession.closed)previewSession=new VoiceSession(context,context.destination);
 if(!previewTimer)previewTimer=setInterval(()=>{
  previewSession.sweep();
  if(context.currentTime>=previewSession.end){previewSession.stop();clearInterval(previewTimer);previewTimer=null;previewSession=null;}
 },50);
 return previewSession;
}
export async function audition(instrument,pitch,beat=null,expression=null) {
 let hitDuration=null;
 if(instrument.sounds){
  const sound=instrument.sounds.find(sound=>sound.id===expression?.soundId)||instrument.sounds[0];
  pitch=instrument.layout==="rack"?sound.referencePitch:pitch;
  if(instrument.layout==="rack"&&sound.patch.type==="synth")hitDuration=Math.max(.015,sound.patch.envelope.attack+sound.patch.envelope.decay);
  instrument={patch:sound.patch,volume:instrument.volume*sound.gain};
 }
 context||=new AudioContext();
 if(context.state!=="running")await context.resume();
 if(beat){
  const zone=instrument.patch?.type==="sample"?sampleForNote(instrument.patch,pitch,expression?.velocity??.8):null;
  await decodeSamples(context,beat,bufferCache(context),new Set(zone?[zone.assetId]:[]));
 }
 return scheduleNote(context,context.destination,instrument,
  {pitch,velocity:expression?.velocity??.8,bend:expression?.bend},
  context.currentTime+.01,hitDuration??expression?.duration??.24,beat,previews());
}
// Preview a real acoustic chord through the exact same sample voice and
// strumOffset implementation used by timeline playback and WAV export.
export async function auditionChord(instrument,pitches,beat,velocity=.85) {
 if(instrument.sounds)instrument={patch:instrument.sounds[0].patch,volume:instrument.volume*instrument.sounds[0].gain};
 context||=new AudioContext();
 if(context.state!=="running")await context.resume();
 const notes=pitches.map((pitch,index)=>({
  id:"preview-"+index,pitch,start:0,duration:8,velocity
 }));
 const needs=new Set(notes.map(n=>instrument.patch.type==="sample"?
  sampleForNote(instrument.patch,n.pitch,n.velocity)?.assetId:null).filter(Boolean));
 await decodeSamples(context,beat,bufferCache(context),needs);
 const now=context.currentTime+.04,duration=.8;
 for(const note of notes){
  scheduleNote(context,context.destination,instrument,note,
   now+strumOffset(instrument,note,notes),duration,beat,previews());
 }
}
export async function play(beat,{loop=false,onPosition=()=>{},onProgress=()=>{},onStop=()=>{},onStart=()=>{},startStep=0}={}) {
 context||=new AudioContext();
 if(context.state!=="running")await context.resume();
 const ctx=context,out=ctx.createGain(),read=typeof beat==="function"?beat:()=>beat;
 await Promise.all((read().kind==="song"?read().beats:[read()]).map(entry=>decodeSamples(ctx,entry,bufferCache(ctx))));
 const vocalBuffers=await decodeSongRecordings(ctx,read());
 const loops=()=>typeof loop==="function"?loop():loop;
 out.gain.value=.85;out.connect(ctx.destination);
 const start=Number.isSafeInteger(startStep)&&startStep>=0?startStep:0;
 let scheduled=start,nextTime=ctx.currentTime+.07,shown=-1,stopped=false,timer,activeStep=null;
 onStart({context:ctx,startTime:nextTime});
 const queue=[],session=new VoiceSession(ctx,out);
 function stop() {
  if(stopped)return;
  stopped=true;clearInterval(timer);session.stop();
  const now=ctx.currentTime;
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(Math.max(0,out.gain.value),now);
  out.gain.linearRampToValueAtTime(0,now+.025);
  setTimeout(()=>{try{out.disconnect();}catch{}},150);
  onStop();
 }
 function tick() {
  if(stopped)return;
  session.sweep();
  let guarded=0;
  while(nextTime<ctx.currentTime+.095 && guarded++<24) {
   const current=read(),cycle=current.kind==="song"?songDurationSteps(current):current.bars*16;
   if(cycle===0){stop();return;}
   if(!loops()&&scheduled>=cycle)break;
   const step=scheduled%Math.max(1,cycle),barIndex=Math.floor(step/16),unit=secondsPerStep(current);
   if(step%16===0)for(const entry of (current.kind==="song"?current.beats:[current]))
    void decodeSamples(ctx,entry,bufferCache(ctx)).catch(console.warn);
   const events=current.kind==="song"?eventsAtSongStep(current,step):stepEvents(current,scheduled);
   if(current.kind==="song")for(const event of recordingEventsAtStep(current,step,{
    includeOverlapping:scheduled===start
   }))
    scheduleVocal(ctx,out,event,nextTime,unit,vocalBuffers,{elapsedSteps:step-event.clip.startStep,session});
   for(const event of events)
    scheduleNote(ctx,out,event.instrument,event.note,
     nextTime+eventOffset(event.instrument,event.note,event.chunk.notes),
     event.note.duration*unit,event.beat||current,session);
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
  if(!loops()&&scheduled>=(current.kind==="song"?songDurationSteps(current):current.bars*16)&&ctx.currentTime>=Math.max(nextTime,session.end))stop();
 }
 timer=setInterval(tick,25);tick();return {stop,get diagnostics(){return {voices:session.voices.size,buses:session.buses.size,steals:session.steals,limit:session.allocator.limit};}};
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
 scheduleNote(ctx,ctx.destination,{patch,volume:1},{pitch,velocity:1},0,duration,null);
 return ctx.startRendering();
}
// Materialize and stably order offline onsets, including strums crossing steps.
// This also bounds the allocator's ledger while rendering long arrangements.
export function renderEvents(document){
 const unit=secondsPerStep(document),song=document.kind==="song";
 const length=song?songDurationSteps(document):document.bars*16,events=[];
 for(let step=0;step<length;step++){
  if(song)for(const event of recordingEventsAtStep(document,step))
   events.push({kind:"vocal",at:step*unit,event});
  for(const event of (song?eventsAtSongStep(document,step):stepEvents(document,step)))
   events.push({kind:"note",at:step*unit+eventOffset(event.instrument,event.note,event.chunk.notes),
    instrument:event.instrument,note:event.note,duration:event.note.duration*unit,beat:event.beat||document});
 }
 return events.sort((a,b)=>a.at-b.at);
}
export function renderEndSeconds(document,events,decoded){
 const length=document.kind==="song"?songDurationSteps(document):document.bars*16;
 let end=length*secondsPerStep(document)+.02;
 for(const event of events){
  if(event.kind!=="note")continue;
  const resolved=resolveEvent(event.instrument,event.note);if(!resolved)continue;
  const {patch}=resolved.voice;
  if(patch.type==="sample"){
   const zone=sampleForNote(patch,resolved.note.pitch,event.note.velocity),buffer=zone&&decoded.get(zone.assetId);
   const rate=zone?(patch.followPitch?2**((resolved.note.pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12)):1;
   const length=buffer?buffer.duration/rate:0;
   const life=patch.oneShot?length:Math.min(length,Math.max(.015,event.duration+patch.release));
   end=Math.max(end,event.at+life+.03);
  }else{
   const duration=event.instrument.layout==="rack"?Math.max(.015,patch.envelope.attack+patch.envelope.decay):event.duration;
   end=Math.max(end,planSynthVoice(resolved.voice,resolved.note,event.at,duration).audibleEnd+.02);
  }
 }
 return end;
}
export async function wav(document){
 const beats=document.kind==="song"?document.beats:[document];
 const decoder=new OfflineAudioContext(2,1,44100),decoded=new Map();
 for(const beat of beats)await decodeSamples(decoder,beat,decoded);
 const events=renderEvents(document),seconds=renderEndSeconds(document,events,decoded);
 if(seconds>600)throw Error("WAV including effect tails exceeds the current 10-minute render limit.");
 const ctx=new OfflineAudioContext(2,Math.ceil(seconds*44100),44100);
 sampleCaches.set(ctx,decoded);
 const vocals=await decodeSongRecordings(ctx,document),out=ctx.createGain();
 out.gain.value=.85;out.connect(ctx.destination);
 const session=new VoiceSession(ctx,out,{chronological:true});
 for(const event of events){
  if(event.kind==="vocal")scheduleVocal(ctx,out,event.event,event.at,secondsPerStep(document),vocals,{session});
  else scheduleNote(ctx,out,event.instrument,event.note,event.at,event.duration,event.beat,session);
 }
 return pcmWav(await ctx.startRendering());
}
