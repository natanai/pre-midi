// Pure presentation helpers for freeform note layering.
// A simultaneous pitch or Rack Sound is intentional music, never a validation error.
// These helpers do not mutate notes, shorten durations or change their audio order.
const sameRow=(a,b,layout)=>layout==="rack"?a.soundId===b.soundId:a.pitch===b.pitch;
const intersects=(a,b)=>a.start<b.start+b.duration&&b.start<a.start+a.duration;

export function overlappingFreeformNotes(instrument,note){
 if(!instrument||!note)return [];
 return instrument.notes
  .filter(other=>other.id!==note.id&&sameRow(other,note,instrument.layout)&&intersects(other,note))
  .sort((a,b)=>a.start-b.start||String(a.id).localeCompare(String(b.id)));
}

// Layout is computed per pitch/Sound row; all simultaneous events remain individually
// keyboard-selectable. When more than three voices coexist the detail chooser exposes
// every source note instead of hiding/removing overlapping music.
export function layoutFreeformNoteRow(notes){
 const sorted=[...notes].sort((a,b)=>a.start-b.start||
  String(a.id).localeCompare(String(b.id)));
 const groups=[];let group=[],end=-1;
 for(const note of sorted){
  if(group.length&&note.start>=end){groups.push(group);group=[];end=-1;}
  group.push(note);end=Math.max(end,note.start+note.duration);
 }
 if(group.length)groups.push(group);
 const result=new Map();
 for(const members of groups){
  const active=[];let maxVoices=1;
  const positions=[];
  for(const note of members){
   for(let i=active.length-1;i>=0;i--)if(active[i].end<=note.start)active.splice(i,1);
   const used=new Set(active.map(item=>item.slot));
   let slot=0;while(used.has(slot))slot++;
   active.push({end:note.start+note.duration,slot});
   maxVoices=Math.max(maxVoices,active.length);
   positions.push({note,slot});
  }
  for(const {note,slot} of positions)result.set(note.id,{
   slot:slot%3,voices:maxVoices,overflow:maxVoices>3
  });
 }
 return result;
}
