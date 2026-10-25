// One destructive pathway for both instrument cards and rack sound rows.
// Native scores require at least one instrument and one sound per rack.
import {makeInstrument} from "./schema.js";

export const instrumentDeleteLabel=instrument=>
 instrument.layout==="rack"?"Delete rack":"Delete instrument";
export const soundDeleteLabel=instrument=>
 instrument.sounds.length===1?"Delete rack":"Remove sound";

export function deleteInstrumentFromScore(score,instrumentId){
 const index=score.instruments.findIndex(entry=>entry.id===instrumentId);
 if(index===-1)return null;
 if(score.instruments.length===1){
  const replacement=makeInstrument(1,score.bars);
  replacement.name="New instrument";
  score.instruments=[replacement];
  return replacement.id;
 }
 score.instruments.splice(index,1);
 return score.instruments[Math.min(index,score.instruments.length-1)].id;
}

export function deleteSoundFromScore(score,instrumentId,soundId){
 const instrument=score.instruments.find(entry=>entry.id===instrumentId);
 if(!instrument||instrument.layout!=="rack"||
    !instrument.sounds.some(entry=>entry.id===soundId))return null;
 if(instrument.sounds.length===1)return deleteInstrumentFromScore(score,instrumentId);
 instrument.sounds=instrument.sounds.filter(entry=>entry.id!==soundId);
 for(const chunk of instrument.chunks)
  chunk.notes=chunk.notes.filter(note=>note.soundId!==soundId);
 return instrument.id;
}
