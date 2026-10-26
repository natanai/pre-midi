// Native Song domain model. No file I/O or browser dependencies.
// Version 8 is reserved for Songs; the Beat schema remains v7 until
// versioned parse/export and pre-programmed parity are implemented.
import {FORMAT,VERSION as BEAT_VERSION,clone,create,id,validate as validateBeat} from "./schema.js";
import {STEPS_PER_BAR,eventsAtStep} from "./arrangement.js";
export const SONG_VERSION=8;
const isObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0;
const ensureBeat=beat=>{
 const issues=validateBeat(beat);
 if(issues.length)throw Error("Invalid Beat: "+issues[0]);
};
const beatLength=beat=>beat.bars*STEPS_PER_BAR;
const unique=(items,key="id")=>new Set(items.map(item=>item?.[key])).size===items.length;

export function createSong(sourceBeat=create()){
 ensureBeat(sourceBeat);
 const beat=clone(sourceBeat),trackId=id();
 return {
  format:FORMAT,kind:"song",version:SONG_VERSION,id:id(),title:"Untitled song",
  bpm:beat.bpm,beats:[beat],
  tracks:[{id:trackId,kind:"beat",name:"Beat 1",clips:[
   {id:id(),beatId:beat.id,startStep:0,lengthSteps:beatLength(beat)}
  ]}]
 };
}
export function addBeat(song,sourceBeat,{independent=false}={}){
 ensureBeat(sourceBeat);
 if(!isObject(song)||!Array.isArray(song.beats))throw Error("Invalid Song.");
 const beat=clone(sourceBeat);
 if(independent)beat.id=id();
 if(song.beats.some(item=>item.id===beat.id))throw Error("Beat already exists in this Song. Use its existing identity or make an independent copy.");
 song.beats.push(beat);
 return beat;
}
export function addSongTrack(song,kind="beat"){
 if(!isObject(song)||!Array.isArray(song.tracks)||!["beat","vocal"].includes(kind))
  throw Error("Invalid Song Track type.");
 const nth=song.tracks.filter(track=>track.kind===kind).length+1;
 const track={id:id(),kind,name:(kind==="beat"?"Beat ":"Voice ")+nth,clips:[]};
 if(kind==="vocal"){
  const firstBeat=song.tracks.findIndex(entry=>entry.kind==="beat");
  song.tracks.splice(firstBeat<0?song.tracks.length:firstBeat,0,track);
 }else song.tracks.push(track);
 return track;
}
export function addBeatClip(song,trackId,beatId,startStep=0,lengthSteps=null){
 const track=song.tracks.find(item=>item.id===trackId);
 if(!track||track.kind!=="beat")throw Error("Choose a Beat Track.");
 const beat=song.beats.find(item=>item.id===beatId);
 if(!beat)throw Error("Beat Clip references a missing Beat.");
 const length=lengthSteps??beatLength(beat);
 if(!nonnegative(startStep)||!positive(length))throw Error("Invalid Beat Clip timing.");
 const clip={id:id(),beatId,startStep,lengthSteps:length};
 track.clips.push(clip);
 return clip;
}
export function editBeatClip(song,clipId,changes){
 const track=song.tracks.find(item=>item.kind==="beat"&&item.clips.some(c=>c.id===clipId));
 if(!track)throw Error("Beat Clip does not exist.");
 const clip=track.clips.find(item=>item.id===clipId);
 for(const key of Object.keys(changes))
  if(!["startStep","lengthSteps"].includes(key))throw Error("Only Beat Clip placement and length may be edited.");
 const next={...clip,...changes};
 if(!nonnegative(next.startStep)||!positive(next.lengthSteps))throw Error("Invalid Beat Clip timing.");
 Object.assign(clip,next);
 return clip;
}
export function songDurationSteps(song){
 return Math.max(0,...song.tracks.flatMap(track=>track.clips.map(clip=>clip.startStep+clip.lengthSteps)));
}
// No audio is flattened; repeat the referenced Beat's native instructions.
export function eventsAtSongStep(song,step){
 if(!nonnegative(step))return [];
 const events=[];
 const beats=new Map(song.beats.map(beat=>[beat.id,beat]));
 for(const track of song.tracks){
  if(track.kind!=="beat")continue;
  for(const clip of track.clips){
   if(step<clip.startStep||step>=clip.startStep+clip.lengthSteps)continue;
   const beat=beats.get(clip.beatId);
   if(!beat)continue;
   const localStep=(step-clip.startStep)%beatLength(beat);
   for(const event of eventsAtStep(beat,localStep))
    events.push({...event,beat,track,clip,songStep:step,beatStep:localStep});
  }
 }
 return events;
}
export function validateSong(song){
 const errors=[];
 if(!isObject(song)||song.format!==FORMAT||song.kind!=="song"||song.version!==SONG_VERSION)
  return ["Unsupported Song format."];
 if(typeof song.id!=="string"||!song.id.trim()||typeof song.title!=="string"||!song.title.trim())
  errors.push("Song identity or title is missing.");
 if(!Number.isInteger(song.bpm)||song.bpm<40||song.bpm>240)errors.push("Song tempo must be 40–240 BPM.");
 if(!Array.isArray(song.beats)||!song.beats.length||!unique(song.beats))
  return [...errors,"Song requires distinct Beats."];
 if(!Array.isArray(song.tracks)||!song.tracks.length||!unique(song.tracks))
  return [...errors,"Song requires distinct Tracks."];
 const known=new Set(song.beats.map(beat=>beat.id));
 for(const beat of song.beats){
  const issues=validateBeat(beat);
  if(issues.length)errors.push("Invalid Beat "+(beat?.id||"unknown")+": "+issues[0]);
  if(beat?.version!==BEAT_VERSION)errors.push("Embedded Beat must use the current Beat format.");
 }
 let seenBeat=false;
 const clipIds=new Set();
 for(const track of song.tracks){
  if(!isObject(track)||!["beat","vocal"].includes(track.kind)||typeof track.name!=="string"||
    !track.name.trim()||!Array.isArray(track.clips)){errors.push("Invalid Song Track.");continue;}
  if(track.kind==="beat")seenBeat=true;
  if(track.kind==="vocal"&&seenBeat)errors.push("Vocal Tracks must precede Beat Tracks.");
  for(const clip of track.clips){
   if(!isObject(clip)||typeof clip.id!=="string"||!clip.id||clipIds.has(clip.id)||
    !nonnegative(clip.startStep)||!positive(clip.lengthSteps)||
    !Number.isSafeInteger(clip.startStep+clip.lengthSteps)){
    errors.push("Invalid or duplicate Song Clip.");continue;
   }
   clipIds.add(clip.id);
   if(track.kind==="beat"&&!known.has(clip.beatId))errors.push("Beat Clip references a missing Beat.");
   // Long-form vocal media will be introduced with asset ownership in stage 5.
   if(track.kind==="vocal")errors.push("Vocal Clips require the forthcoming recording asset schema.");
  }
 }
 // Identical asset IDs in separate Beats may only denote the same metadata.
 const assets=new Map();
 for(const beat of song.beats)for(const asset of beat.samples||[]){
  const previous=assets.get(asset.id),serialized=JSON.stringify(asset);
  if(previous&&previous!==serialized)errors.push("Conflicting Beat audio asset ID.");
  assets.set(asset.id,serialized);
 }
 return errors.slice(0,20);
}
