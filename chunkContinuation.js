// A note moved left past its Chunk viewport does not become a negative-start
// event. It is folded into the note already sounding at the boundary, which
// remains the ONE canonical note-on. This works in Web and native playback.
import {clone,id,MAX_BEAT_BARS,upgradeBeatFeatures} from "./schema.js";
import {phraseInstances,placementFor,STEPS_PER_BAR} from "./arrangement.js";

const simple=(instrument,bar)=>{
 const p=placementFor(instrument,bar);
 return p.offset===0&&p.length===16&&p.every===16&&p.repeats===1;
};
const failure=reason=>({ok:false,reason});

function context(beat,{instrumentId,bar,noteId,steps,pitches=0}){
 const inst=beat?.instruments?.find(entry=>entry.id===instrumentId);
 if(!inst||inst.layout!=="pitched")return failure("Only pitched instruments can continue held notes.");
 if(!Number.isInteger(bar)||bar<1||bar>=beat.bars||!simple(inst,bar))
  return failure("Choose a regular placed Chunk after the first bar.");
 const assigned=inst.timeline[bar],current=inst.chunks.find(entry=>entry.id===assigned);
 const noteIndex=current?.notes.findIndex(note=>note.id===noteId)??-1;
 if(noteIndex<0)return failure("Choose a note belonging to the selected Chunk.");
 const note=current.notes[noteIndex];
 if(!Number.isInteger(steps)||!Number.isInteger(pitches))
  return failure("The note must move by whole steps and pitches.");
 const movedStart=note.start+steps,pitch=note.pitch+pitches;
 if(movedStart>=0)return failure("The note has not crossed the left boundary.");
 if(pitch<36||pitch>96)return failure("The new pitch is outside the piano roll.");
 const at=bar*STEPS_PER_BAR,end=at+movedStart+note.duration;
 // An earlier real onset must supply the held voice. Never manufacture an
 // attackless note that would be silent when this Beat is played on its own.
 let source=null;
 for(const phrase of phraseInstances(beat,inst)){
  if(phrase.start>=at||!simple(inst,phrase.bar))continue;
  for(let i=0;i<phrase.chunk.notes.length;i++){
   const prior=phrase.chunk.notes[i],on=phrase.start+prior.start;
   if(prior.pitch!==pitch||prior.start>=phrase.length||on>=at||
      on+prior.duration<at)continue;
   if(!source||on>source.on)
    source={bar:phrase.bar,chunk:phrase.chunk,index:i,note:prior,on};
  }
 }
 if(!source)return failure("No earlier held note at this pitch. Sustain the preceding note first.");
 // Another attack inside the continuation is intentional, not a candidate
 // for silent merging. Refuse to swallow a separate musical articulation.
 for(const phrase of phraseInstances(beat,inst)){
  for(const other of phrase.chunk.notes){
   if(other===note||other.pitch!==pitch||other.start>=phrase.length)continue;
   const on=phrase.start+other.start;
   if(on>source.on&&on<end&&!(phrase.bar===bar&&other.id===noteId))
    return failure("Another note-on occurs inside the requested continuation.");
  }
 }
 const targetDuration=Math.max(source.note.duration,end-source.on);
 if(targetDuration>MAX_BEAT_BARS*STEPS_PER_BAR)
  return failure("The continued note exceeds the Beat sustain limit.");
 const sourceUsed=inst.timeline.filter(entry=>entry===source.chunk.id).length>1;
 const currentUsed=inst.timeline.filter(entry=>entry===current.id).length>1;
 const copies=Number(sourceUsed)+Number(currentUsed);
 if(inst.chunks.length+copies>32)
  return failure("This instrument already has the maximum number of reusable Chunks.");
 return {ok:true,inst,current,noteIndex,source,bar,pitch,
  relativeEnd:movedStart+note.duration,targetDuration,sourceUsed,currentUsed};
}

export function continuationProposal(beat,details){
 const c=context(beat,details);
 return c.ok?{ok:true,pitch:c.pitch,relativeEnd:c.relativeEnd,
  sourceBar:c.source.bar,sourceNoteId:c.source.note.id}:c;
}

function detach(inst,bar){
 const original=inst.chunks.find(entry=>entry.id===inst.timeline[bar]);
 const copy=clone(original);copy.id=id();
 copy.notes.forEach(note=>{note.id=id();});
 inst.chunks.push(copy);inst.timeline[bar]=copy.id;
 return copy;
}

export function continueNoteFromEarlierChunk(beat,details){
 const c=context(beat,details);
 if(!c.ok)return {...c,changed:false};
 // Clone per occurrence if a Chunk is also used elsewhere. The advanced
 // placement and polymeter cases are intentionally not rewritten.
 const previous=c.sourceUsed?detach(c.inst,c.source.bar):c.source.chunk;
 const current=c.currentUsed?detach(c.inst,c.bar):c.current;
 const sourceNote=previous.notes[c.source.index];
 sourceNote.duration=c.targetDuration;
 current.notes.splice(c.noteIndex,1);
 upgradeBeatFeatures(beat);
 return {changed:true,ok:true,sourceBar:c.source.bar,
  sourceChunkId:previous.id,sourceNoteId:sourceNote.id,
  currentChunkId:current.id,pitch:c.pitch};
}

// Read-only viewport projections. Their negative start means the actual
// note-on is BEHIND the piano keyboard; no second playback event is authored.
export function incomingChunkSustains(beat,instrumentId,bar){
 const inst=beat?.instruments?.find(entry=>entry.id===instrumentId);
 if(!inst||inst.layout!=="pitched"||!Number.isInteger(bar)||bar<0||bar>=beat.bars)return [];
 const begin=bar*STEPS_PER_BAR,byPitch=new Map();
 for(const phrase of phraseInstances(beat,inst)){
  if(phrase.start>=begin)continue;
  for(const note of phrase.chunk.notes){
   if(note.start>=phrase.length)continue;
   const on=phrase.start+note.start,end=on+note.duration;
   if(on>=begin||end<=begin)continue;
   const old=byPitch.get(note.pitch);
   if(!old||on>old.on)byPitch.set(note.pitch,{
    ...note,start:on-begin,continuation:true,
    sourceBar:phrase.bar,sourceChunkId:phrase.chunk.id,
    sourceNoteId:note.id,on
   });
  }
 }
 return [...byPitch.values()].map(({on,...note})=>note);
}

// Resize a held note from its visible tail in a later Chunk. Only the right
// edge is a resize handle; the left boundary remains a whole-note move action.
export function resizeIncomingSustain(beat,{instrumentId,sourceBar,sourceNoteId,duration}){
 const inst=beat?.instruments?.find(entry=>entry.id===instrumentId);
 if(!inst||inst.layout!=="pitched"||!Number.isInteger(sourceBar)||
  sourceBar<0||sourceBar>=beat.bars||!simple(inst,sourceBar))
  return {changed:false,reason:"Choose a held note from a regular placed Chunk."};
 const chunk=inst.chunks.find(entry=>entry.id===inst.timeline[sourceBar]);
 const index=chunk?.notes.findIndex(note=>note.id===sourceNoteId)??-1;
 if(index<0)return {changed:false,reason:"The originating held note has moved."};
 const note=chunk.notes[index];
 if(!Number.isInteger(duration)||duration<1||duration>MAX_BEAT_BARS*STEPS_PER_BAR)
  return {changed:false,reason:"Invalid held-note duration."};
 if(note.duration===duration)return {changed:false};
 const shared=inst.timeline.filter(entry=>entry===chunk.id).length>1;
 if(shared&&inst.chunks.length>=32)
  return {changed:false,reason:"No room to make an independent Chunk placement."};
 const owned=shared?detach(inst,sourceBar):chunk;
 owned.notes[index].duration=duration;
 upgradeBeatFeatures(beat);
 return {changed:true,sourceBar,sourceChunkId:owned.id,sourceNoteId:owned.notes[index].id};
}
