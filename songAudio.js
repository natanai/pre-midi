import {ownVoice} from "./src/hosts/web/voice-session.js";
import {vocalEffects,vocalSourceRange} from "./vocalEffects.js";
import {configureDriveShaper} from "./audioEffects.js";
import {schedulePitchPlan,scheduleMovementLfo,movement} from "./expression.js";
import {planPitch} from "./src/dsp/expression.js";
import {delayTailSeconds} from "./src/dsp/effect-tail.js";
// Native timeline audio for continuous vocal takes.
import {recordingBytes} from "./recordingAssets.js";
const cache=new WeakMap();
export async function decodeSongRecordings(context,song){
 if(!song||song.kind!=="song"||!song.recordings?.length)return new Map();
 let entries=cache.get(context);
 if(!entries){entries=new Map();cache.set(context,entries);}
 await Promise.all(song.recordings.map(async recording=>{
  if(entries.has(recording.id))return;
  const bytes=recordingBytes(recording);
  const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const decoded=await context.decodeAudioData(raw);
  entries.set(recording.id,decoded);
 }));
 return entries;
}
export function recordingEventsAtStep(song,step,{includeOverlapping=false}={}){
 if(!song?.recordings?.length)return [];
 const recordings=new Map(song.recordings.map(item=>[item.id,item]));
 return song.tracks.filter(track=>track.kind==="vocal").flatMap(track=>
  track.clips.filter(clip=>recordings.has(clip.recordingId)&&
   (clip.startStep===step||(includeOverlapping&&clip.startStep<step&&
    clip.startStep+clip.lengthSteps>step)))
   .map(clip=>({recording:recordings.get(clip.recordingId),clip,track})));
}
export function scheduleVocal(context,destination,event,startTime,unit,decoded,{elapsedSteps=0,session=null}={}){
 const buffer=decoded.get(event.recording.id);
 if(!buffer)return;
 const {recording,clip}=event,fx=vocalEffects(clip);
 const {offset,rate}=vocalSourceRange(recording,clip,unit,elapsedSteps);
 const remaining=clip.lengthSteps*unit-Math.max(0,elapsedSteps)*unit;
 const duration=Math.min(remaining,Math.max(0,(Math.min(recording.durationSeconds,buffer.duration)-offset)/rate));
 if(!(duration>.005))return;
 const source=context.createBufferSource(),level=context.createGain(),gate=context.createGain(),pan=context.createStereoPanner();
 const nodes=[source,level,gate,pan],sources=[source],owner={sources,nodes};
 source.buffer=buffer;source.playbackRate.value=rate;
 const motion=movement(fx);
 schedulePitchPlan(context,source.detune,planPitch({bend:fx.bend},motion,startTime,duration),owner);
 const gain=clip.gain??1,end=startTime+duration;
 if(clip.effects===undefined)level.gain.setValueAtTime(gain,startTime);
 else{
  const attack=Math.min(fx.attack,duration*.5),release=Math.min(fx.release,duration*.5);
  level.gain.setValueAtTime(0,startTime);
  level.gain.linearRampToValueAtTime(gain,startTime+attack);
  level.gain.setValueAtTime(gain,Math.max(startTime+attack,end-release));
  level.gain.linearRampToValueAtTime(0,end);
 }
 let signal=source;
 if(fx.filter){
  const filter=context.createBiquadFilter();
  filter.type=fx.filter.type;filter.frequency.setValueAtTime(fx.filter.cutoff,startTime);
  filter.Q.setValueAtTime(fx.filter.resonance,startTime);
  signal.connect(filter);signal=filter;nodes.push(filter);
 }
 if(fx.drive>0){
  const shaper=context.createWaveShaper(),comp=context.createGain();
  configureDriveShaper(shaper,fx.drive);comp.gain.value=1/(1+fx.drive*1.1);
  signal.connect(shaper);shaper.connect(comp);signal=comp;nodes.push(shaper,comp);
 }
 signal.connect(level);
 let tail=level;
 if(motion.tremolo>0){
  const pulse=context.createGain();pulse.gain.setValueAtTime(1,startTime);
  scheduleMovementLfo(context,pulse.gain,startTime,duration,motion.tremoloRate,motion.tremolo*.45,owner);
  level.connect(pulse);tail=pulse;nodes.push(pulse);
 }
 tail.connect(gate);gate.connect(pan);pan.pan.value=fx.pan;
 const dry=context.createGain();dry.gain.value=1-fx.delayMix*.4;
 pan.connect(dry);dry.connect(destination);nodes.push(dry);
 const delayTail=delayTailSeconds(fx);
 if(!session&&fx.delayMix>0){
  const send=context.createGain(),delay=context.createDelay(1.2),feedback=context.createGain(),wet=context.createGain();
  send.gain.value=fx.delayMix*.55;delay.delayTime.value=fx.delayTime;feedback.gain.value=fx.delayFeedback;wet.gain.value=.8;
  pan.connect(send);send.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(destination);
  nodes.push(send,delay,feedback,wet);
 }
 source.start(startTime,offset,duration*rate);source.stop(end);
 const voice=ownVoice(context,{sources,nodes,gate,priority:1,start:startTime,release:end,end:session?end:end+delayTail});
 if(session){session.adopt(voice);if(voice.admitted&&fx.delayMix>0)pan.connect(session.delay(fx,voice));}
 return voice;
}
