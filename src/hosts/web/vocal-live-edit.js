import {songDurationSteps} from "../../../songModel.js";
import {decodeSongRecordings,recordingEventsAtStep,scheduleVocal} from "../../../songAudio.js";
import {prepareVocalSeek,vocalSeekEvents,scheduleVocalSeek} from "./vocal-seek.js";
export function vocalPlaybackSignature(song){
 if(song?.kind!=="song")return "";
 return JSON.stringify([song.bpm,song.recordings.map(r=>[r.id,r.durationSeconds,r.trimSeconds]),
  song.tracks.filter(t=>t.kind==="vocal").map(t=>t.clips.map(c=>[c.id,c.recordingId,c.startStep,c.lengthSteps,c.trimStartSeconds,c.gain,c.effects]))]);
}
export function createVocalLiveEditor({context,destination,read,decoded,session,position,scheduled,looping,isCurrent}){
 let signature=vocalPlaybackSignature(read()),generation=0;
 return async function refresh(){
  const document=read(),nextSignature=vocalPlaybackSignature(document);
  if(signature===nextSignature)return;
  const request=++generation,current=()=>isCurrent()&&request===generation&&vocalPlaybackSignature(read())===nextSignature;
  if(document.kind!=="song"){session.replaceVocalVoices(context.currentTime+.01);signature=nextSignature;return;}
  await decodeSongRecordings(context,document);if(!current())return;
  const unit=60/document.bpm/4,cycle=songDurationSteps(document);
  if(!cycle){session.replaceVocalVoices(context.currentTime+.01);signature=nextSignature;return;}
  const locate=at=>{const absolute=Math.max(0,position(at)),base=looping()?Math.floor(absolute/cycle)*cycle:0;return {absolute,base,step:absolute-base};};
  let prepared;
  for(;;){
   const at=locate(context.currentTime+.04);
   try{prepared=await prepareVocalSeek(document,at.step,decoded,context.sampleRate,{cycleStart:at.base,isCurrent:current});}
   catch(error){if(!current())return;throw error;}
   if(!current())return;
   const next=locate(context.currentTime+.04);
   if(next.base===at.base&&vocalSeekEvents(document,next.step,decoded).every(entry=>prepared.has(entry.event.clip.id)))break;
  }
  const swap=context.currentTime+.04,at=locate(swap);
  session.replaceVocalVoices(swap);
  const clips=new Map(document.tracks.filter(t=>t.kind==="vocal").flatMap(t=>t.clips.map(c=>[c.id,c])));
  for(const [id,item] of prepared){
   const clip=clips.get(id);if(!clip||clip.startStep>at.step)continue;
   scheduleVocalSeek(context,destination,{...item,elapsed:(at.step-clip.startStep)*unit},swap,session,{fadeIn:true});
  }
  for(const event of recordingEventsAtStep(document,Math.floor(at.step),{includeOverlapping:true})){
   if(prepared.has(event.clip.id))continue;
   scheduleVocal(context,destination,event,swap,unit,decoded,{elapsedSteps:at.step-event.clip.startStep,session,
    controlStart:(at.base+event.clip.startStep)*unit,fadeIn:true});
  }
  // Replace vocal starts already queued inside the normal lookahead as well.
  for(let absolute=Math.floor(at.absolute)+1;absolute<scheduled();absolute++){
   if(!looping()&&absolute>=cycle)break;
   const step=absolute%cycle;
   for(const event of recordingEventsAtStep(document,step))scheduleVocal(context,destination,event,
    swap+(absolute-at.absolute)*unit,unit,decoded,{session,controlStart:(absolute-step+event.clip.startStep)*unit});
  }
  signature=nextSignature;
 };
}
