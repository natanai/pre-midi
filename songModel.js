// Native Song domain model. No file I/O or browser dependencies.
// Legacy Songs use v8 with v7 Beats; modulation explicitly requires v10/v9.
// pre-programmed reader compatibility remains separately qualified.
import {FORMAT,BEAT_VERSIONS,MODULATION_BEAT_VERSION,upgradeBeatFeatures,clone,create,id,validate as validateBeat} from "./schema.js";
import {STEPS_PER_BAR,eventsAtStep} from "./arrangement.js";
export const SONG_VERSION=8;
export const MODULATION_SONG_VERSION=10;
export function upgradeSongFeatures(song){song.beats.forEach(upgradeBeatFeatures);if(song.beats.some(beat=>beat.version===MODULATION_BEAT_VERSION))song.version=MODULATION_SONG_VERSION;return song;}
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
  format:FORMAT,kind:"song",version:beat.version===MODULATION_BEAT_VERSION?MODULATION_SONG_VERSION:SONG_VERSION,id:id(),title:"Untitled song",
  bpm:beat.bpm,beats:[beat],recordings:[],
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
 song.beats.push(beat);upgradeSongFeatures(song);
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
export const MAX_VOCAL_SECONDS=300;
export function addVocalTake(song,recording,{startStep=0}={}){
 if(!isObject(song)||!Array.isArray(song.tracks))throw Error("Invalid Song.");
 song.recordings??=[];
 const error=validateRecording(recording);
 if(error)throw Error(error);
 if(song.recordings.some(item=>item.id===recording.id))throw Error("Duplicate Recording ID.");
 if(!nonnegative(startStep))throw Error("Invalid vocal start step.");
 const track=addSongTrack(song,"vocal");
 const unit=60/song.bpm/4;
 const clip={
  id:id(),recordingId:recording.id,startStep,
  lengthSteps:Math.max(1,Math.ceil((recording.durationSeconds-recording.trimSeconds)/unit)),
  gain:1
 };
 song.recordings.push({...recording});
 track.clips.push(clip);
 return {track,clip};
}
export function validateRecording(entry){
 if(!isObject(entry)||!/^[a-zA-Z0-9_-]{1,128}$/.test(entry.id||""))return "Recording requires a safe ID.";
 if(typeof entry.name!=="string"||!entry.name.trim()||entry.name.length>100)return "Recording needs a name.";
 if(!["audio/webm","audio/mp4","audio/ogg"].includes(entry.mime))return "Unsupported Recording format.";
 const ext={"audio/webm":"webm","audio/mp4":"mp4","audio/ogg":"ogg"}[entry.mime];
 if(entry.path!=="assets/"+entry.id+"."+ext)return "Recording must use its canonical asset path.";
 if(typeof entry.durationSeconds!=="number"||!Number.isFinite(entry.durationSeconds)||
    entry.durationSeconds<=.05||entry.durationSeconds>MAX_VOCAL_SECONDS+.5)
  return "Recording duration is invalid.";
 if(typeof entry.trimSeconds!=="number"||!Number.isFinite(entry.trimSeconds)||
    entry.trimSeconds<0||entry.trimSeconds>=entry.durationSeconds)
  return "Recording trim is invalid.";
 if(entry.waveform!==undefined&&(!Array.isArray(entry.waveform)||entry.waveform.length>128||
    entry.waveform.some(value=>!Number.isFinite(value)||value<0||value>1)))
  return "Invalid Recording waveform.";
 if("data" in entry||"bytes" in entry)return "Recording bytes must remain outside .premidi.";
 return null;
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
 if(!isObject(song)||song.format!==FORMAT||song.kind!=="song"||![SONG_VERSION,MODULATION_SONG_VERSION].includes(song.version))
  return ["Unsupported Song format."];
 if(typeof song.id!=="string"||!song.id.trim()||typeof song.title!=="string"||!song.title.trim())
  errors.push("Song identity or title is missing.");
 if(!Number.isInteger(song.bpm)||song.bpm<40||song.bpm>240)errors.push("Song tempo must be 40–240 BPM.");
 if(!Array.isArray(song.beats)||!song.beats.length||!unique(song.beats))
  return [...errors,"Song requires distinct Beats."];
 if(!Array.isArray(song.tracks)||!song.tracks.length||!unique(song.tracks))
  return [...errors,"Song requires distinct Tracks."];
 const recordings=song.recordings??[];
 if(!Array.isArray(recordings)||recordings.length>40||!unique(recordings))
  return [...errors,"Song has invalid or duplicate Recordings."];
 const knownRecordings=new Set();
 for(const recording of recordings){
  const error=validateRecording(recording);
  if(error)errors.push(error);
  else knownRecordings.add(recording.id);
 }
 const known=new Set(song.beats.map(beat=>beat.id));
 for(const beat of song.beats){
  const issues=validateBeat(beat);
  if(issues.length)errors.push("Invalid Beat "+(beat?.id||"unknown")+": "+issues[0]);
  if(song.version===SONG_VERSION&&beat?.version===MODULATION_BEAT_VERSION)errors.push("Modulated Beats require Song v10.");
  if(!BEAT_VERSIONS.includes(beat?.version))errors.push("Embedded Beat must use the current Beat format.");
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
   if(track.kind==="vocal"){
    if(!knownRecordings.has(clip.recordingId))errors.push("Vocal Clip references a missing Recording.");
    if(!Number.isFinite(clip.gain)||clip.gain<0||clip.gain>2)
     errors.push("Vocal Clip gain must be between 0 and 2.");
   }
  }
 }
 // Identical asset IDs in separate Beats may only denote the same metadata.
 const assets=new Map();
 for(const recording of recordings){
  if(assets.has(recording.id))errors.push("Conflicting Recording ID.");
  assets.set(recording.id,JSON.stringify(recording));
 }
 for(const beat of song.beats)for(const asset of beat.samples||[]){
  const previous=assets.get(asset.id),serialized=JSON.stringify(asset);
  if(previous&&previous!==serialized)errors.push("Conflicting Beat audio asset ID.");
  assets.set(asset.id,serialized);
 }
 return errors.slice(0,20);
}
