// Shared interpretation of sound identities. Rows are never encoded as pitches.
export const MAX_SOUNDS = 64;
export const MAX_EVENTS = 2048;
export const soundForEvent = (instrument,event) => instrument.sounds?.find(sound=>
 instrument.layout==="rack" ? sound.id===event.soundId : sound.id===instrument.sounds[0]?.id);
export function resolveEvent(instrument,event){
 const sound=soundForEvent(instrument,event);
 if(!sound)return null;
 return {
  sound,
  voice:{patch:sound.patch,volume:instrument.volume*sound.gain},
  note:instrument.layout==="rack"?{...event,pitch:sound.referencePitch}:event
 };
}
export const soundPatches = instrument => (instrument.sounds||[]).map(sound=>sound.patch);
export const referencedSampleIds = instruments => new Set(instruments.flatMap(instrument=>
 soundPatches(instrument).flatMap(patch=>patch.type==="sample"?patch.zones.map(zone=>zone.assetId):[])));
// Every entry point uses this decision. Explicit row replacement is a separate edit.
export function selectionOperation(layout,trigger,addInstrument=false){
 if(!["pitched","hit"].includes(trigger))throw Error("Choose whether this sound is a note or a hit.");
 if(addInstrument || !layout || (layout==="rack")!==(trigger==="hit"))
  return trigger==="hit"?"create-rack":"create-pitched";
 return layout==="rack"?"append-rack":"replace-pitched";
}
export function canConvertToRack(instrument){
 if(instrument.layout!=="pitched"||instrument.sounds.length!==1)return false;
 const steps=new Set();
 for(const chunk of instrument.chunks){
  steps.clear();
  for(const note of chunk.notes){
   if(steps.has(note.start))return false;
   steps.add(note.start);
  }
 }
 const patch=instrument.sounds[0].patch;
 if(patch.type==="sample" && new Set(patch.zones.map(zone=>zone.root)).size>1)return false;
 return instrument.chunks.every(chunk=>chunk.notes.every(note=>note.pitch===instrument.sounds[0].referencePitch))
  || (patch.type==="sample" && !patch.followPitch && new Set(patch.zones.map(zone=>zone.root)).size===1);
}
export function convertToRack(instrument){
 if(!canConvertToRack(instrument))throw Error("Conversion would change pitches, sample zones, or simultaneous hits. Keep this piano roll to preserve your music.");
 const sound=instrument.sounds[0];
 sound.trigger="hit";instrument.layout="rack";
 for(const chunk of instrument.chunks)chunk.notes=chunk.notes.map(({pitch,...note})=>({...note,soundId:sound.id}));
}
