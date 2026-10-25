// A chord is authored at one timeline step. Acoustic articulations change its
// playback timing, not the notes or its canonical project save data.
export function strumOffset(instrument,note,notes){
 const ms=instrument.patch?.type==="sample"?instrument.patch.strumMs??0:0;
 if(!ms)return 0;
 const chord=notes.filter(entry=>entry.start===note.start)
   .sort((a,b)=>Math.sign(ms)*(a.pitch-b.pitch) || String(a.id).localeCompare(String(b.id)));
 const index=chord.findIndex(entry=>entry.id===note.id);
 return Math.max(0,index)*Math.abs(ms)/1000;
}
