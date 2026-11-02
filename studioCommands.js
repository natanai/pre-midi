// Canonical note commands: host-independent musical edits.
// The desktop mouse editor and phone touch editor must use these mutations.
import {id,clone} from "./schema.js";
import {moveNote,resizeNote} from "./noteEditing.js";

export const NOTE_COMMAND_TYPES=Object.freeze([
 "note.add","note.delete","note.move","note.resize","note.level","note.bend"
]);
const isInt=Number.isInteger;
const find=(chunk,noteId)=>chunk.notes.find(item=>item.id===noteId);

export function applyNoteCommand(chunk,command,{layout=null,sounds=null,minPitch=36,maxPitch=96}={}){
 if(!chunk||!Array.isArray(chunk.notes)||!command)return {changed:false};
 const type=command.type;
 if(type==="note.add"){
  const value=command.note||command,rack=(layout||("soundId" in value?"rack":"pitched"))==="rack";
  const note={id:value.id||id(),start:value.start,duration:value.duration??1,velocity:value.velocity??.9};
  if(rack)note.soundId=value.soundId;else note.pitch=value.pitch;
  if(value.bend!==undefined)note.bend=clone(value.bend);
  if(typeof note.id!=="string"||!note.id||note.id.length>128||
   chunk.notes.some(other=>other.id===note.id)||
   !isInt(note.start)||note.start<0||note.start>15||
   !isInt(note.duration)||note.duration<1||note.start+note.duration>16||
   !Number.isFinite(note.velocity)||note.velocity<0||note.velocity>1)
   return {changed:false};
  if(rack){
   if(typeof note.soundId!=="string"||!note.soundId||
    (sounds&&!sounds.some(sound=>sound.id===note.soundId))||note.duration!==1||
    chunk.notes.some(other=>other.soundId===note.soundId&&other.start===note.start))
    return {changed:false};
  }else{
   if(!isInt(note.pitch)||note.pitch<minPitch||note.pitch>maxPitch||
    chunk.notes.some(other=>other.pitch===note.pitch&&note.start<other.start+other.duration&&
     other.start<note.start+note.duration))
    return {changed:false};
  }
  chunk.notes.push(note);
  return {changed:true,noteId:note.id,note};
 }
 const note=find(chunk,command.noteId);
 if(!note)return {changed:false};
 if(type==="note.delete"){
  chunk.notes=chunk.notes.filter(other=>other.id!==note.id);
  return {changed:true,noteId:note.id};
 }
 if(type==="note.resize"){
  if(!Number.isFinite(command.duration)||note.soundId!==undefined)return {changed:false};
  const before=note.duration;
  resizeNote(chunk,note.id,command.duration);
  return {changed:before!==note.duration,noteId:note.id,note};
 }
 if(type==="note.move"){
  if(note.soundId!==undefined){
   if(!Number.isFinite(command.start))return {changed:false};
   const before=note.start,start=Math.max(0,Math.min(15,Math.round(command.start)));
   if(chunk.notes.some(other=>other.id!==note.id&&other.soundId===note.soundId&&other.start===start))
    return {changed:false};
   note.start=start;return {changed:before!==start,noteId:note.id,note};
  }
  const before=[note.start,note.pitch];
  const ok=moveNote(chunk,note.id,command.start,command.pitch,{minPitch,maxPitch});
  return {changed:ok===true&&(before[0]!==note.start||before[1]!==note.pitch),noteId:note.id,note};
 }
 if(type==="note.level"){
  if(!Number.isFinite(command.velocity)||command.velocity<0||command.velocity>1)return {changed:false};
  const changed=note.velocity!==command.velocity;note.velocity=command.velocity;
  return {changed,noteId:note.id,note};
 }
 if(type==="note.bend"){
  if(!command.bend||typeof command.bend!=="object")return {changed:false};
  const changed=JSON.stringify(note.bend)!==JSON.stringify(command.bend);
  if(changed)note.bend=clone(command.bend);
  return {changed,noteId:note.id,note};
 }
 return {changed:false};
}
