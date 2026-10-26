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
export function recordingEventsAtStep(song,step){
 if(!song?.recordings?.length)return [];
 const recordings=new Map(song.recordings.map(item=>[item.id,item]));
 return song.tracks.filter(track=>track.kind==="vocal").flatMap(track=>
  track.clips.filter(clip=>clip.startStep===step&&recordings.has(clip.recordingId))
   .map(clip=>({recording:recordings.get(clip.recordingId),clip,track})));
}
export function scheduleVocal(context,destination,event,startTime,unit,decoded){
 const buffer=decoded.get(event.recording.id);
 if(!buffer)return;
 const {recording,clip}=event;
 const offset=Math.max(0,Math.min(recording.trimSeconds,buffer.duration-.005));
 const duration=Math.min(buffer.duration-offset,
  Math.max(0,recording.durationSeconds-offset),
  clip.lengthSteps*unit);
 if(!(duration>.005))return;
 const source=context.createBufferSource(),level=context.createGain();
 source.buffer=buffer;level.gain.value=clip.gain??1;
 source.connect(level);level.connect(destination);
 source.start(startTime,offset,duration);
 source.onended=()=>{try{source.disconnect();level.disconnect();}catch{}};
}
