// Sparse, source-linked Song onset index for offline and native scheduling.
// Reusing a Beat never clones its patch, changes a note's source phase, or
// changes its owning Song Track/Clip. This index is a disposable snapshot: do
// only reuse it across steps when an explicit edit revision remains unchanged.
import {phraseInstances,STEPS_PER_BAR} from "./arrangement.js";
import {songDurationSteps} from "./songModel.js";

const bucket=(map,step)=>{
 let found=map.get(step);
 if(!found){found={vocals:[],notes:[]};map.set(step,found);}
 return found;
};

// Enumerate authored Beat onsets once, rather than searching every Chunk
// placement at every Song step and every repeat of every linked Clip.
function beatOnsets(beat){
 const steps=beat.bars*STEPS_PER_BAR,events=[];
 for(const instrument of beat.instruments){
  for(const phrase of phraseInstances(beat,instrument)){
   for(const note of phrase.chunk.notes){
    if(note.start>=phrase.length)continue;
    const at=phrase.start+note.start;
    if(at<0||at>=steps)continue;
    events.push({at,event:{instrument,note,chunk:phrase.chunk,
     barIndex:Math.floor(at/STEPS_PER_BAR),step:at%STEPS_PER_BAR,
     sourceBar:phrase.bar}});
   }
  }
 }
 return events;
}

export function scheduledSongOnsets(song,{maxEvents=Infinity,fromStep=0,toStep=Infinity}={}){
 const index=new Map(),beats=new Map(song.beats.map(beat=>[beat.id,beat]));
 const templates=new Map(),songLength=songDurationSteps(song);
 // One window over the same source-linked Song, not a destructive split,
 // bounce, or replacement clock. Existing full-Song callers pass no bounds.
 const windowStart=Math.min(songLength,fromStep);
 const windowEnd=Math.min(songLength,toStep);
 let count=0;
 const push=(step,kind,event)=>{
  if(step<windowStart||step>=windowEnd)return;
  if(++count>maxEvents)
   throw Error("Song exceeds "+maxEvents+" scheduled note/voice onsets. Split or shorten it for native playback.");
  bucket(index,step)[kind].push(event);
 };
 // Old recording transport enumerates all vocal Clips before Beat events at
 // each step, irrespective of where their Track appears in the Song.
 if(song.recordings?.length){
  const recordings=new Map(song.recordings.map(recording=>[recording.id,recording]));
  for(const track of song.tracks)if(track.kind==="vocal"){
   for(const clip of track.clips){
    const recording=recordings.get(clip.recordingId);
    if(recording&&clip.startStep>=windowStart&&clip.startStep<windowEnd)
     push(clip.startStep,"vocals",{recording,clip,track});
   }
  }
 }
 const sourceBars=Math.max(1,Math.ceil(songLength/STEPS_PER_BAR));
 for(const track of song.tracks){
  if(track.kind!=="beat")continue;
  // Linked Clips have priority over direct notes within their parent Track.
  for(const clip of track.clips){
   const beat=beats.get(clip.beatId);
   if(!beat)continue;
   let onsets=templates.get(beat.id);
   if(!onsets){onsets=beatOnsets(beat);templates.set(beat.id,onsets);}
   const cycle=beat.bars*STEPS_PER_BAR;
   const phase=(clip.sourceOffsetSteps??0)%cycle;
   const minRelative=Math.max(0,windowStart-clip.startStep);
   const maxRelative=Math.min(clip.lengthSteps,windowEnd-clip.startStep);
   if(maxRelative<=minRelative)continue;
   for(const {at,event} of onsets){
    const first=(at-phase+cycle)%cycle;
    // Jump directly to the first repetition in this Song-time window.
    // A 10,000-bar Clip must not expand into 10,000 events to read bar 9,999.
    const skip=Math.max(0,Math.ceil((minRelative-first)/cycle));
    for(let relative=first+skip*cycle;relative<maxRelative;relative+=cycle){
     const step=clip.startStep+relative;
     push(step,"notes",{...event,beat,track,clip,songStep:step,beatStep:at});
    }
   }
  }
  const layer=track.freeform;
  if(!layer)continue;
  const source={id:track.id+"-freeform",bpm:song.bpm,
   bars:sourceBars,samples:layer.samples};
  for(const instrument of layer.instruments){
   // A direct note's artificial Chunk contains exactly its co-onset strum
   // group; retain the original order to preserve strum offsets and ties.
   const directs=new Map();
   for(const note of instrument.notes){
    if(note.start<windowStart||note.start>=windowEnd)continue;
    let notes=directs.get(note.start);
    if(!notes){notes=[];directs.set(note.start,notes);}
    notes.push(note);
   }
   for(const [step,notes] of directs){
    const groups=new Map();
    for(const note of notes){
     const key=note.strumGroup||"manual:"+step;
     if(!groups.has(key))groups.set(key,[]);
     groups.get(key).push(note);
    }
    for(const note of notes){
     const key=note.strumGroup||"manual:"+step;
     push(step,"notes",{instrument,note,chunk:{notes:groups.get(key)},
      beat:source,track,songStep:step,beatStep:step});
    }
   }
   for(const placement of instrument.chunkPlacements){
    const chunk=instrument.chunks.find(item=>item.id===placement.chunkId);
    if(!chunk)continue;
    const onsets=chunk.notes.filter(note=>note.start<placement.length);
    if(!onsets.length)continue;
    const min=Math.min(...onsets.map(note=>note.start));
    const max=Math.max(...onsets.map(note=>note.start));
    const first=Math.max(0,Math.ceil((windowStart-placement.startStep-max)/placement.every));
    const last=Math.min(placement.repeats-1,
     Math.floor((windowEnd-1-placement.startStep-min)/placement.every));
    for(let repeat=first;repeat<=last;repeat++){
     const start=placement.startStep+repeat*placement.every;
     for(const note of onsets){
      const step=start+note.start;
      if(step<windowStart||step>=windowEnd)continue;
      push(step,"notes",{instrument,note,chunk,
       beat:source,track,songStep:step,beatStep:step});
     }
    }
   }
  }
 }
 return index;
}

// A bounded, deterministic page feeder for future native Song streaming.
// This does not change the currently enforced 10-minute or 4096-onset native
// playback limits; the C++ host must support continuous voice/effect handoff
// before a window may be played as part of a longer session.
export function scheduledSongOnsetsInWindow(song,startStep,endStep,{maxEvents=4096}={}){
 if(!Number.isSafeInteger(startStep)||startStep<0||
  !Number.isSafeInteger(endStep)||endStep<=startStep)
  throw Error("Song onset window needs increasing, nonnegative Song steps.");
 if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>4096)
  throw Error("Native onset window budget must be 1 to 4096.");
 return scheduledSongOnsets(song,{maxEvents,fromStep:startStep,toStep:endStep});
}

// Browser real-time playback can share native/offline's sparse source-linked
// event compilation. The caller supplies a monotonically increasing revision
// for every committed Song change and for undo/redo. A replacement document
// invalidates the schedule even if it shares the previous revision.
const EMPTY_LIVE_ONSETS=Object.freeze({
 vocals:Object.freeze([]),notes:Object.freeze([])
});
export function createLiveSongScheduler(read,getRevision){
 if(typeof read!=="function"||typeof getRevision!=="function")
  throw Error("Live Song scheduling requires a document reader and edit revision.");
 let cachedDocument=null,cachedRevision=null,cachedIndex=null;
 return {
  atStep(step){
   const song=read(),revision=getRevision();
   if(song?.kind!=="song")return EMPTY_LIVE_ONSETS;
   if(cachedIndex===null||song!==cachedDocument||revision!==cachedRevision){
    cachedIndex=scheduledSongOnsets(song);
    cachedDocument=song;cachedRevision=revision;
   }
   return cachedIndex.get(step)??EMPTY_LIVE_ONSETS;
  }
 };
}
