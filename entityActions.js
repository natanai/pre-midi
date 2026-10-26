// One destructive pathway for both instrument cards and rack sound rows.
// Native scores require at least one instrument and one sound per rack.
import {makeInstrument,clone,id} from "./schema.js";

export const instrumentDeleteLabel=instrument=>
 instrument.layout==="rack"?"Delete rack":"Delete instrument";
export const soundDeleteLabel=instrument=>
 instrument.sounds.length===1?"Delete rack":"Remove sound";

export function deleteInstrumentFromBeat(beat,instrumentId){
 const index=beat.instruments.findIndex(entry=>entry.id===instrumentId);
 if(index===-1)return null;
 if(beat.instruments.length===1){
  const replacement=makeInstrument(1,beat.bars);
  replacement.name="New instrument";
  beat.instruments=[replacement];
  return replacement.id;
 }
 beat.instruments.splice(index,1);
 return beat.instruments[Math.min(index,beat.instruments.length-1)].id;
}

export function deleteSoundFromBeat(beat,instrumentId,soundId){
 const instrument=beat.instruments.find(entry=>entry.id===instrumentId);
 if(!instrument||instrument.layout!=="rack"||
    !instrument.sounds.some(entry=>entry.id===soundId))return null;
 if(instrument.sounds.length===1)return deleteInstrumentFromBeat(beat,instrumentId);
 instrument.sounds=instrument.sounds.filter(entry=>entry.id!==soundId);
 for(const chunk of instrument.chunks)
  chunk.notes=chunk.notes.filter(note=>note.soundId!==soundId);
 return instrument.id;
}

/** Extract one rack row into its own pitched instrument, retaining its musical
 * placements. The other sounds and their hits remain in the original rack.
 * When the source rack has no other sounds, replace the rack with its new
 * instrument; the source is not allowed to remain as an empty rack.
 */
export function canMoveRackSoundToPianoRoll(beat,instrumentId,soundId){
 const inst=beat.instruments.find(item=>item.id===instrumentId);
 if(!inst||inst.layout!=="rack")return false;
 const row=inst.sounds.find(item=>item.id===soundId);
 if(!row||row.referencePitch<36||row.referencePitch>96)return false;
 return inst.sounds.length===1||beat.instruments.length<12;
}
export function moveRackSoundToPianoRoll(beat,instrumentId,soundId){
 if(!canMoveRackSoundToPianoRoll(beat,instrumentId,soundId))return null;
 const sourceIndex=beat.instruments.findIndex(item=>item.id===instrumentId);
 const source=beat.instruments[sourceIndex];
 const entry=source.sounds.find(item=>item.id===soundId);
 const moved=clone(entry);
 moved.trigger="pitched";
 // A hit recording is normally a fixed-pitch one-shot. A piano roll needs
 // to follow notes and respect note lengths instead.
 if(moved.patch.type==="sample"){
  moved.patch.followPitch=true;
  moved.patch.oneShot=false;
 }
 const pitched=makeInstrument(beat.instruments.length+1,beat.bars,moved);
 pitched.name=entry.name;
 pitched.volume=source.volume;
 const chunkMap=new Map();
 pitched.chunks=source.chunks.map(chunk=>{
  const newId=id();
  chunkMap.set(chunk.id,newId);
  return {...clone(chunk),id:newId,notes:chunk.notes
   .filter(note=>note.soundId===soundId)
   .map(({soundId,...note})=>({...note,id:id(),pitch:entry.referencePitch}))};
 });
 pitched.timeline=source.timeline.map(chunkId=>chunkId===null?null:chunkMap.get(chunkId));
 pitched.placements=clone(source.placements||Array(beat.bars).fill(null));
 if(source.sounds.length===1){
  beat.instruments.splice(sourceIndex,1,pitched);
 }else{
  source.sounds=source.sounds.filter(item=>item.id!==soundId);
  for(const chunk of source.chunks)
   chunk.notes=chunk.notes.filter(note=>note.soundId!==soundId);
  beat.instruments.splice(sourceIndex+1,0,pitched);
 }
 return pitched.id;
}
