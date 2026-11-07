import {connectRecordedAudio,recordingEnvelope} from "./recordedAudio.js";
import {ownVoice} from "./src/hosts/web/voice-session.js";
import {vocalSourceRange} from "./vocalEffects.js";
import {schedulePitchPlan} from "./expression.js";
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
export function scheduleVocal(context,destination,event,startTime,unit,decoded,{elapsedSteps=0,session=null,sourceRange=null,controlStart=null}={}){
 const buffer=decoded.get(event.recording.id);
 if(!buffer)return;
 const {recording,clip}=event,elapsed=Math.max(0,elapsedSteps)*unit;
 const range=sourceRange??vocalSourceRange(recording,clip,unit,elapsedSteps,{sampleRate:context.sampleRate,controlStart:controlStart??startTime-elapsed,sourceDuration:buffer.duration});
 const {offset,rate,duration,fx,totalDuration}=range;
 if(!(duration>.005))return;
 const source=context.createBufferSource(),level=context.createGain(),gate=context.createGain(),pan=context.createStereoPanner();
 const nodes=[source,level,gate,pan],sources=[source],owner={sources,nodes};
 source.buffer=buffer;source.playbackRate.value=rate;
 schedulePitchPlan(context,source.detune,{...range.pitch,start:startTime,duration},owner,{controlRate:'k'});
 const gain=clip.gain??1,end=startTime+duration;
 if(clip.effects===undefined)level.gain.setValueAtTime(gain,startTime);
 else{
  for(const e of recordingEnvelope(startTime,duration,gain,fx.attack,fx.release,{elapsed,totalDuration}))
   level.gain[e.kind?"linearRampToValueAtTime":"setValueAtTime"](e.value,e.time);
 }
 const graph=connectRecordedAudio(context,{source,amp:level,gate,pan,out:destination,patch:fx,start:startTime,duration,owner,unit,elapsedSteps});
 const delayTail=graph.tail;
 // start()'s duration is source-buffer seconds, independent of detune. The
 // authored Clip gate controls wall time; pitch motion must not trim content.
 source.start(startTime,offset,range.sourceRemaining);source.stop(end);
 const voice=ownVoice(context,{sources,nodes,gate,priority:1,start:startTime,release:end,end:session?end:end+delayTail});
 if(session)session.adopt(voice);graph.connectDelay(session,voice);
 return voice;
}
