// Song-owned freeform musical instructions; notes and Chunks share the Beat sound engine.
// Never flatten musical data into audio or create a separately movable Song Track.
import {create,clone,id,makeChunk,makeInstrument,upgradeBeatFeatures,validate as validateBeat} from "./schema.js";
import {eventsAtStep,STEPS_PER_BAR} from "./arrangement.js";
import {referencedSampleIds} from "./soundModel.js";
import {validateBend} from "./expression.js";

export const FREEFORM_SONG_VERSION=22;
export const FREEFORM_LIMIT_STEPS=65536;
const MAX_INSTRUMENTS=64;
const obj=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const whole=value=>Number.isSafeInteger(value)&&value>=0;
const positive=value=>Number.isSafeInteger(value)&&value>0;
const distinct=items=>new Set(items.map(item=>item?.id)).size===items.length;

export function createFreeform(){return {version:1,instruments:[],samples:[],passages:[]};}
export function ensureFreeform(track){
 if(track?.kind!=="beat")throw Error("Only Beat Tracks can own a freeform lane.");
 track.freeform??=createFreeform();
 return track.freeform;
}
// An Instrument in freeform uses exactly the same Sound/Rack structures as a Beat.
// The independent note list is the only new per-instrument musical storage.
export function addFreeformInstrument(layer,source=null){
 if(layer.instruments.length>=MAX_INSTRUMENTS)throw Error("Freeform has too many Instruments.");
 const original=source??makeInstrument(layer.instruments.length+1,1);
 const sounds=clone(original.sounds);
 const ids=new Map(sounds.map(sound=>{const old=sound.id;sound.id=id();return [old,sound.id];}));
 const chunks=(original.chunks||[]).map(chunk=>({
  ...clone(chunk),id:id(),notes:chunk.notes.map(note=>({
   ...clone(note),id:id(),...(note.soundId?{soundId:ids.get(note.soundId)}:{})
  }))
 }));
 const inst={id:id(),name:original.name,layout:original.layout,volume:original.volume,
  sounds,chunks:chunks.length?chunks:[makeChunk()],notes:[],chunkPlacements:[]};
 layer.instruments.push(inst);
 return inst;
}
export function addFreeformNote(instrument,raw){
 const note={...clone(raw),id:raw.id||id()};
 if(!whole(note.start)||!positive(note.duration)||note.start+note.duration>FREEFORM_LIMIT_STEPS||
  !Number.isFinite(note.velocity)||note.velocity<0||note.velocity>1)
  throw Error("Invalid freeform note timing or velocity.");
 if(instrument.notes.some(other=>other.id===note.id))throw Error("Duplicate freeform note.");
 instrument.notes.push(note);
 return note;
}
export function addFreeformChunkPlacement(instrument,chunkId,startStep,{length=16,every=16,repeats=1,passageId}={}){
 if(!instrument.chunks.some(chunk=>chunk.id===chunkId))throw Error("Missing freeform Chunk.");
 if(!whole(startStep)||!positive(length)||length>16||!positive(every)||every>64||
  !positive(repeats)||repeats>32||startStep+(repeats-1)*every+length>FREEFORM_LIMIT_STEPS)
  throw Error("Invalid freeform Chunk placement.");
 const placement={id:id(),chunkId,startStep,length,every,repeats};
 if(passageId!==undefined)placement.passageId=passageId;
 instrument.chunkPlacements.push(placement);
 return placement;
}
export function freeformEndStep(layer){
 if(!layer)return 0;
 let end=0;
 for(const passage of layer.passages)end=Math.max(end,passage.startStep+passage.lengthSteps);
 for(const inst of layer.instruments){
  for(const note of inst.notes)end=Math.max(end,note.start+note.duration);
  for(const item of inst.chunkPlacements)
   end=Math.max(end,item.startStep+(item.repeats-1)*item.every+item.length);
 }
 return end;
}
export function eventsAtFreeformStep(layer,step){
 if(!layer||!whole(step))return [];
 const result=[];
 for(const instrument of layer.instruments){
  const direct=instrument.notes.filter(note=>note.start===step);
  const groups=new Map();
  for(const note of direct){
   const group=note.strumGroup||"manual:"+step;
   if(!groups.has(group))groups.set(group,[]);
   groups.get(group).push(note);
  }
  for(const note of direct)result.push({instrument,note,chunk:{notes:groups.get(note.strumGroup||"manual:"+step)}});
  for(const placement of instrument.chunkPlacements){
   const chunk=instrument.chunks.find(item=>item.id===placement.chunkId);
   if(!chunk)continue;
   for(let n=0;n<placement.repeats;n++){
    const relative=step-placement.startStep-n*placement.every;
    if(relative<0||relative>=placement.length)continue;
    for(const note of chunk.notes)if(note.start===relative)result.push({instrument,note,chunk});
   }
  }
 }
 return result;
}
export function moveFreeformPassage(layer,passageId,nextStartStep){
 const passage=layer.passages.find(p=>p.id===passageId);
 if(!passage)throw Error("Missing freeform passage.");
 if(!whole(nextStartStep)||nextStartStep+passage.lengthSteps>FREEFORM_LIMIT_STEPS)
  throw Error("Passage would move outside freeform.");
 const shift=nextStartStep-passage.startStep;
 for(const instrument of layer.instruments){
  for(const note of instrument.notes)if(note.passageId===passageId&&
   (note.start+shift<0||note.start+note.duration+shift>FREEFORM_LIMIT_STEPS))
   throw Error("Note would move outside freeform.");
  for(const placement of instrument.chunkPlacements)if(placement.passageId===passageId&&
   (placement.startStep+shift<0||
    placement.startStep+shift+(placement.repeats-1)*placement.every+placement.length>FREEFORM_LIMIT_STEPS))
   throw Error("Chunk would move outside freeform.");
 }
 for(const instrument of layer.instruments){
  for(const note of instrument.notes)if(note.passageId===passageId)note.start+=shift;
  for(const placement of instrument.chunkPlacements)
   if(placement.passageId===passageId)placement.startStep+=shift;
 }
 passage.startStep=nextStartStep;
 return passage;
}
export function validateFreeform(layer){
 if(!obj(layer)||layer.version!==1||!Array.isArray(layer.instruments)||
  !Array.isArray(layer.samples)||!Array.isArray(layer.passages))
  return ["Invalid freeform data."];
 const errors=[];
 if(layer.instruments.length>MAX_INSTRUMENTS||!distinct(layer.instruments))
  errors.push("Invalid freeform Instrument list.");
 if(layer.passages.length>10000||!distinct(layer.passages))
  errors.push("Invalid freeform passage list.");
 for(const passage of layer.passages)
  if(!obj(passage)||typeof passage.id!=="string"||!whole(passage.startStep)||
   !positive(passage.lengthSteps)||passage.startStep+passage.lengthSteps>FREEFORM_LIMIT_STEPS)
   errors.push("Invalid freeform passage.");
 const passageIds=new Set(layer.passages.map(item=>item.id));
 for(const instrument of layer.instruments){
  if(!obj(instrument)||!Array.isArray(instrument.notes)||
   !Array.isArray(instrument.chunks)||!Array.isArray(instrument.chunkPlacements)){
   errors.push("Invalid freeform Instrument.");continue;
  }
  // Validate the existing sound/rack/chunk definition against the Beat schema,
  // rather than introducing a second synthesizer format.
  const shell=create();
  shell.bars=1;
  shell.samples=layer.samples;
  shell.instruments=[{...instrument,timeline:[null],placements:[null]}];
  upgradeBeatFeatures(shell);
  for(const issue of validateBeat(shell))errors.push(instrument.name+": "+issue);
  if(instrument.notes.length>20000||!distinct(instrument.notes))
   errors.push("Invalid freeform note list.");
  const soundIds=new Set(instrument.sounds?.map(sound=>sound.id)||[]);
  for(const note of instrument.notes){
   if(!obj(note)||typeof note.id!=="string"||!whole(note.start)||
    !positive(note.duration)||note.start+note.duration>FREEFORM_LIMIT_STEPS||
    !Number.isFinite(note.velocity)||note.velocity<0||note.velocity>1||
    (note.passageId!==undefined&&!passageIds.has(note.passageId))||
    (instrument.layout==="rack"?!soundIds.has(note.soundId)||
       note.pitch!==undefined:
      !Number.isInteger(note.pitch)||note.pitch<36||note.pitch>96||
       note.soundId!==undefined))
    errors.push("Invalid freeform note.");
   errors.push(...validateBend(note?.bend));
  }
  if(instrument.chunkPlacements.length>10000||!distinct(instrument.chunkPlacements))
   errors.push("Invalid freeform Chunk placements.");
  const chunkIds=new Set(instrument.chunks.map(chunk=>chunk.id));
  for(const placement of instrument.chunkPlacements)
   if(!obj(placement)||typeof placement.id!=="string"||
    !chunkIds.has(placement.chunkId)||!whole(placement.startStep)||
    !positive(placement.length)||placement.length>16||
    !positive(placement.every)||placement.every>64||
    !positive(placement.repeats)||placement.repeats>32||
    placement.startStep+(placement.repeats-1)*placement.every+placement.length>FREEFORM_LIMIT_STEPS||
    (placement.passageId!==undefined&&!passageIds.has(placement.passageId)))
    errors.push("Invalid freeform Chunk placement.");
 }
 return errors.slice(0,20);
}
// Unpack an entire Beat Clip, or a selected absolute Song range within it.
// Build and validate a new layer *before* editing the original track. A partial
// conversion leaves two source-phase-aware Beat Clips at the unaffected edges.
export function unpackBeatClip(song,clipId,{fromStep=null,toStep=null}={}){
 const track=song.tracks.find(t=>t.kind==="beat"&&t.clips.some(c=>c.id===clipId));
 if(!track)throw Error("Choose a Beat Clip to unpack.");
 const clip=track.clips.find(c=>c.id===clipId);
 const beat=song.beats.find(b=>b.id===clip.beatId);
 if(!beat)throw Error("Beat Clip references a missing Beat.");
 if(beat.instruments.some(inst=>inst.automation!==undefined))
  throw Error("This Beat uses automation; freeform automation conversion is not yet supported.");
 const end=clip.startStep+clip.lengthSteps,from=fromStep??clip.startStep,to=toStep??end;
 if(!whole(from)||!positive(to)||from<clip.startStep||to>end||from>=to||
  to>FREEFORM_LIMIT_STEPS)
  throw Error("Unpack range must be inside the Beat Clip.");
 // A note whose onset belongs to one side of a split must not become
 // implicitly dependent on a neighboring passage. Require an audible note
 // boundary before separating the two instruction scopes.
 if(from>clip.startStep||to<end){
  const cycle=beat.bars*STEPS_PER_BAR;
  const crosses=cut=>{
   for(let step=Math.max(clip.startStep,cut-16);step<cut;step++){
    const local=(step-clip.startStep+(clip.sourceOffsetSteps??0))%cycle;
    if(eventsAtStep(beat,local).some(event=>step+event.note.duration>cut))return true;
   }
   return false;
  };
  if((from>clip.startStep&&crosses(from))||(to<end&&crosses(to)))
   throw Error("A sustained note crosses the selection boundary. Move the selection edge past the note before unpacking.");
 }
 const layer=clone(track.freeform??createFreeform()),passage={
  id:id(),startStep:from,lengthSteps:to-from,sourceBeatId:beat.id
 };
 const instruments=new Map();
 for(const original of beat.instruments){
  const converted=addFreeformInstrument(layer,original);
  const soundMap=new Map(original.sounds.map((sound,index)=>[sound.id,converted.sounds[index].id]));
  instruments.set(original.id,{converted,soundMap});
 }
 const referenced=referencedSampleIds(beat.instruments);
 for(const asset of beat.samples.filter(entry=>referenced.has(entry.id))){
  const existing=layer.samples.find(entry=>entry.id===asset.id);
  if(existing&&JSON.stringify(existing)!==JSON.stringify(asset))
   throw Error("Conflicting sample Asset identity during unpack.");
  if(!existing)layer.samples.push(clone(asset));
 }
 const cycle=beat.bars*STEPS_PER_BAR;
 for(let step=from;step<to;step++){
  const local=(step-clip.startStep+(clip.sourceOffsetSteps??0))%cycle;
  for(const event of eventsAtStep(beat,local)){
   const {converted,soundMap}=instruments.get(event.instrument.id);
   const source=event.note;
   const note={...clone(source),id:id(),start:step,passageId:passage.id,
    strumGroup:event.instrument.id+":"+event.chunk.id+":"+event.sourceBar+":"+step,
    strumKey:source.id};
   if(note.soundId!==undefined)note.soundId=soundMap.get(note.soundId);
   addFreeformNote(converted,note);
  }
 }
 layer.passages.push(passage);
 const errors=validateFreeform(layer);
 if(errors.length)throw Error("Could not unpack: "+errors[0]);
 const keep=[];
 if(from>clip.startStep)keep.push({...clone(clip),lengthSteps:from-clip.startStep});
 if(to<end)keep.push({...clone(clip),id:id(),startStep:to,lengthSteps:end-to,
  sourceOffsetSteps:((clip.sourceOffsetSteps??0)+to-clip.startStep)%cycle});
 track.clips=track.clips.filter(item=>item.id!==clipId).concat(keep);
 track.freeform=layer;
 song.version=FREEFORM_SONG_VERSION;
 return passage;
}
