// Song-owned freeform musical instructions; notes and Chunks share the Beat sound engine.
// Never flatten musical data into audio or create a separately movable Song Track.
import {create,clone,id,makeChunk,makeInstrument,upgradeBeatFeatures,validate as validateBeat} from "./schema.js";
import {eventsAtStep,STEPS_PER_BAR} from "./arrangement.js";
import {referencedSampleIds} from "./soundModel.js";
import {validateBend} from "./expression.js";
import {validateCutoffAutomation,validateCapturedCutoffAutomation} from "./src/dsp/automation.js";

export const FREEFORM_SONG_VERSION=22;
export const FREEFORM_AUTOMATION_SONG_VERSION=23;
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

// Which keys are physically held at one Song step? Direct notes may sustain
// across many bars; a placed Chunk can repeat and its last note can ring past
// its placement length. The answer uses the same note-onset semantics as
// eventsAtFreeformStep, without needing to enumerate earlier Song steps.
export function soundingFreeformPitches(layer,instrumentId,step){
 const result=new Set();
 if(!layer||!Number.isFinite(step)||step<0)return result;
 const instrument=layer.instruments.find(item=>item.id===instrumentId);
 if(!instrument||instrument.layout!=="pitched")return result;
 for(const note of instrument.notes)
  if(note.start<=step&&step<note.start+note.duration)result.add(note.pitch);
 for(const placement of instrument.chunkPlacements){
  const chunk=instrument.chunks.find(item=>item.id===placement.chunkId);
  if(!chunk)continue;
  for(let n=0;n<placement.repeats;n++){
   const relative=step-placement.startStep-n*placement.every;
   if(relative<0||relative>=placement.length+16)continue;
   for(const note of chunk.notes)
    if(note.start<placement.length&&note.start<=relative&&relative<note.start+note.duration)
     result.add(note.pitch);
  }
 }
 return result;
}

// An overlap is a layering choice, not an error: two notes on the same
// Instrument and pitch/Sound can sound at once. Preview it without modifying
// the Song, deleting notes, or making a passage into a detachable Track.
// Limit event expansion for very dense Songs and report incomplete results.
export function previewFreeformPassageLayering(layer,passageId,nextStartStep,
 {beatClips=[],maxEvents=12000,maxPairs=50000}={}){
 const passage=layer?.passages?.find(p=>p.id===passageId);
 if(!passage)throw Error("Missing freeform passage.");
 if(!whole(nextStartStep)||nextStartStep+passage.lengthSteps>FREEFORM_LIMIT_STEPS)
  throw Error("Passage would move outside freeform.");
 const shift=nextStartStep-passage.startStep,active=[],inactive=[];
 let incomplete=false;
 const push=(list,instrument,note,start,id)=>{
  if(list.length>=maxEvents){incomplete=true;return false;}
  list.push({instrumentId:instrument.id,key:instrument.layout==="rack"?
   "sound:"+note.soundId:"pitch:"+note.pitch,start,end:start+note.duration,id});
  return true;
 };
 const gather=(instrument,owned,into,windowStart=-Infinity,windowEnd=Infinity)=>{
  for(const note of instrument.notes){
   if((note.passageId===passageId)!==owned)continue;
   const start=note.start+(owned?shift:0);
   if(start>=windowEnd||start+note.duration<=windowStart)continue;
   if(!push(into,instrument,note,start,note.id))return;
  }
  for(const placement of instrument.chunkPlacements){
   if((placement.passageId===passageId)!==owned)continue;
   const chunk=instrument.chunks.find(item=>item.id===placement.chunkId);
   if(!chunk)continue;
   const anchor=placement.startStep+(owned?shift:0);
   // Each Chunk note is at most one bar long. Skip repeat instances whose
   // potential note intervals cannot intersect the prospective move window.
   const first=Math.max(0,Math.ceil((windowStart-anchor-16)/placement.every));
   const last=Math.min(placement.repeats-1,Math.floor((windowEnd-anchor)/placement.every));
   for(let n=first;n<=last;n++){
    const start=anchor+n*placement.every;
    for(const note of chunk.notes){
     if(note.start>=placement.length)continue;
     const at=start+note.start;
     if(at>=windowEnd||at+note.duration<=windowStart)continue;
     if(!push(into,instrument,note,at,placement.id+":"+n+":"+note.id))return;
    }
   }
  }
 };
 for(const inst of layer.instruments){
  gather(inst,true,active);
  if(incomplete)break;
 }
 if(active.length===0&&!incomplete){
  // An empty organizational passage may still overlap a linked Beat Clip.
  return {noteOverlapCount:0,beatClipOverlapCount:beatClips.filter(c=>
   c.startStep<nextStartStep+passage.lengthSteps&&
   c.startStep+c.lengthSteps>nextStartStep).length,
   examples:[],incomplete:false};
 }
 const start=Math.min(...active.map(item=>item.start));
 const end=Math.max(...active.map(item=>item.end));
 for(const inst of layer.instruments){
  if(incomplete)break;
  gather(inst,false,inactive,start,end);
 }
 const groups=new Map();
 for(const note of inactive){
  const key=note.instrumentId+"|"+note.key;
  if(!groups.has(key))groups.set(key,{notes:[],maxEnds:[]});
  groups.get(key).notes.push(note);
 }
 for(const group of groups.values()){
  group.notes.sort((a,b)=>a.start-b.start);
  let maximum=0;
  for(const note of group.notes){
   maximum=Math.max(maximum,note.end);
   group.maxEnds.push(maximum);
  }
 }
 let count=0,checked=0;
 const examples=[];
 for(const moving of active){
  const group=groups.get(moving.instrumentId+"|"+moving.key);
  if(!group)continue;
  // Prefix maximum ends are monotonic. Binary-search past all earlier
  // notes whose tails cannot reach the moved event, even in a long Song.
  let low=0,high=group.maxEnds.length;
  while(low<high){
   const mid=(low+high)>>>1;
   if(group.maxEnds[mid]<=moving.start)low=mid+1;else high=mid;
  }
  for(let index=low;index<group.notes.length;index++){
   const other=group.notes[index];
   if(other.start>=moving.end)break;
   if(other.end<=moving.start)continue;
   if(++checked>maxPairs){incomplete=true;break;}
   count++;
   if(examples.length<12)examples.push({
    startStep:Math.max(moving.start,other.start),
    endStep:Math.min(moving.end,other.end),
    instrumentId:moving.instrumentId,
    key:moving.key,movingId:moving.id,otherId:other.id
   });
  }
  if(incomplete)break;
 }
 const beatClipOverlapCount=beatClips.filter(c=>
  c.startStep<nextStartStep+passage.lengthSteps&&
  c.startStep+c.lengthSteps>nextStartStep).length;
 return {noteOverlapCount:count,beatClipOverlapCount,examples,incomplete};
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
 if(!obj(layer)||![1,2].includes(layer.version)||!Array.isArray(layer.instruments)||
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
   if(note?.cutoffAutomation!==undefined){
    if(layer.version<2)errors.push("Captured note cutoff movement requires freeform v2.");
    if(instrument.layout!=="pitched"||instrument.sounds?.[0]?.patch?.type!=="synth")
     errors.push("Captured cutoff movement requires a pitched synthesizer.");
    errors.push(...validateCapturedCutoffAutomation(note.cutoffAutomation));
   }
  }
  if(instrument.chunkPlacements.length>10000||!distinct(instrument.chunkPlacements))
   errors.push("Invalid freeform Chunk placements.");
  for(const chunk of instrument.chunks)
   for(const note of chunk.notes){
    if(note.cutoffAutomation===undefined)continue;
    if(layer.version<2)errors.push("Captured Chunk movement requires freeform v2.");
    if(instrument.layout!=="pitched"||instrument.sounds?.[0]?.patch?.type!=="synth")
     errors.push("Captured Chunk movement requires a pitched synthesizer.");
    errors.push(...validateCapturedCutoffAutomation(note.cutoffAutomation));
   }
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
// Extract a reusable Beat without moving or silencing the source freeform music.
// The Beat format is intentionally narrower than the freeform note model. Refuse
// unrepresentable selections rather than retriggering/splitting sustained notes.
export function createBeatFromFreeformSelection(song,trackId,startStep,endStep,{title="Freeform selection"}={}){
 const track=song?.tracks?.find(item=>item.id===trackId&&item.kind==="beat");
 const layer=track?.freeform;
 if(!layer)throw Error("Choose a Beat Track with freeform music.");
 if(!whole(startStep)||!positive(endStep)||endStep<=startStep||
  endStep>FREEFORM_LIMIT_STEPS)throw Error("Choose a valid freeform selection.");
 const span=endStep-startStep,bars=Math.ceil(span/STEPS_PER_BAR);
 if(bars>64)throw Error("A reusable Beat can have at most 64 bars. Select a shorter passage.");
 const beat=create();
 beat.id=id();beat.title=String(title).trim()||"Freeform selection";
 beat.bpm=song.bpm;beat.bars=bars;beat.instruments=[];
 // Events are collected by occurrence rather than by note identity, because
 // placing a Chunk more than once creates independent sounding occurrences.
 for(const source of layer.instruments){
  const events=[];
  const collect=(note,at)=>{
   const end=at+note.duration;
   if(at<startStep){
    if(end>startStep)throw Error("A note sustains into the selection. Move its start boundary.");
    return;
   }
   if(at>=endStep)return;
   if(end>endStep)throw Error("A note sustains beyond the selection. Extend its end boundary.");
   const relative=at-startStep,local=relative%STEPS_PER_BAR;
   if(note.duration>STEPS_PER_BAR-local)
    throw Error("A note crosses a Beat bar boundary. Move or shorten it before creating a Beat.");
   if(note.cutoffAutomation!==undefined)
    throw Error("This selection contains captured cutoff movement. Creating a reusable Beat with that movement is not yet supported; keep the freeform passage.");
   events.push({at:relative,note});
  };
  for(const note of source.notes)collect(note,note.start);
  for(const placement of source.chunkPlacements){
   const chunk=source.chunks.find(item=>item.id===placement.chunkId);
   if(!chunk)throw Error("Freeform Chunk placement is missing its source.");
   for(let occurrence=0;occurrence<placement.repeats;occurrence++){
    const start=placement.startStep+occurrence*placement.every;
    for(const note of chunk.notes){
     if(note.start>=placement.length)continue;
     collect(note,start+note.start);
    }
   }
  }
  if(!events.length)continue;
  if(beat.instruments.length===12)
   throw Error("A reusable Beat supports at most 12 Instruments. Use a shorter selection or separate Beats.");
  const output={
   id:id(),name:source.name,layout:source.layout,volume:source.volume,
   sounds:clone(source.sounds),chunks:[],
   timeline:Array(bars).fill(null),placements:Array(bars).fill(null)
  };
  const soundIds=new Map();
  for(const sound of output.sounds){
   const original=sound.id;
   sound.id=id();soundIds.set(original,sound.id);
  }
  const byBar=Array.from({length:bars},()=>[]);
  for(const {at,note} of events){
   const copy=clone(note);
   delete copy.passageId;delete copy.strumGroup;
   copy.id=id();copy.start=at%STEPS_PER_BAR;
   if(copy.soundId!==undefined)copy.soundId=soundIds.get(copy.soundId);
   byBar[Math.floor(at/STEPS_PER_BAR)].push(copy);
  }
  const signatures=new Map();
  for(let bar=0;bar<bars;bar++){
   if(!byBar[bar].length)continue;
   const notes=byBar[bar].sort((a,b)=>
    a.start-b.start||String(a.pitch??a.soundId).localeCompare(String(b.pitch??b.soundId))||
    a.duration-b.duration||a.velocity-b.velocity);
   // Exclude generated IDs; retain expressive ordering/parameters so distinct
   // articulations are never incorrectly collapsed into one reusable Chunk.
   const signature=JSON.stringify(notes.map(({id:ignored,...other})=>other));
   let chunk=signatures.get(signature);
   if(!chunk){
    if(output.chunks.length===32)
     throw Error("A Beat Instrument supports at most 32 unique Chunks. Use a shorter selection or separate Beats.");
    chunk=makeChunk("Chunk "+(output.chunks.length+1));
    chunk.notes=notes;
    output.chunks.push(chunk);signatures.set(signature,chunk);
   }
   output.timeline[bar]=chunk.id;
  }
  if(!output.chunks.length)output.chunks=[makeChunk()];
  beat.instruments.push(output);
 }
 if(!beat.instruments.length)
  throw Error("There are no freeform notes or placed Chunks in this selection.");
 const needed=referencedSampleIds(beat.instruments);
 beat.samples=layer.samples.filter(asset=>needed.has(asset.id)).map(clone);
 upgradeBeatFeatures(beat);
 const errors=validateBeat(beat);
 if(errors.length)throw Error("Cannot make this reusable Beat: "+errors[0]);
 return beat;
}

// Propose the smallest non-destructive expansion of a partial Beat-Clip cut.
// The user must explicitly choose the suggested range; no note is split.
const crossingAt=(beat,clip,cut)=>{
 const clipEnd=clip.startStep+clip.lengthSteps;
 if(cut<=clip.startStep||cut>=clipEnd)return [];
 const result=[],cycle=beat.bars*STEPS_PER_BAR;
 for(let step=Math.max(clip.startStep,cut-STEPS_PER_BAR);step<cut;step++){
  const beatStep=(step-clip.startStep+(clip.sourceOffsetSteps??0))%cycle;
  for(const event of eventsAtStep(beat,beatStep))
   if(step+event.note.duration>cut)
    result.push({start:step,end:step+event.note.duration,
     key:event.instrument.id+":"+event.note.id+":"+step});
 }
 return result;
};
export function suggestSafeUnpackRange(song,clipId,fromStep,toStep){
 const track=song?.tracks?.find(item=>item.kind==="beat"&&
  item.clips.some(clip=>clip.id===clipId));
 if(!track)throw Error("Choose a Beat Clip to unpack.");
 const clip=track.clips.find(item=>item.id===clipId);
 const beat=song.beats.find(item=>item.id===clip.beatId);
 if(!beat)throw Error("Beat Clip references a missing Beat.");
 const clipEnd=clip.startStep+clip.lengthSteps;
 if(!whole(fromStep)||!positive(toStep)||fromStep<clip.startStep||
  toStep>clipEnd||fromStep>=toStep||toStep>FREEFORM_LIMIT_STEPS)
  throw Error("Unpack range must be inside the Beat Clip.");
 let from=fromStep,to=toStep;
 const crossing=new Set();
 for(let i=0;i<=clip.lengthSteps;i++){
  let nextFrom=from,nextTo=to;
  for(const note of crossingAt(beat,clip,from)){
   nextFrom=Math.min(nextFrom,note.start);crossing.add(note.key);
  }
  for(const note of crossingAt(beat,clip,to)){
   nextTo=Math.max(nextTo,Math.min(clipEnd,note.end));
   crossing.add(note.key);
  }
  if(nextFrom===from&&nextTo===to)return {
   requestedFromStep:fromStep,requestedToStep:toStep,
   fromStep:from,toStep:to,adjusted:from!==fromStep||to!==toStep,
   crossingNoteCount:crossing.size
  };
  from=nextFrom;to=nextTo;
 }
 throw Error("Could not find an intact note boundary around this selection.");
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
 for(const inst of beat.instruments)if(inst.automation!==undefined){
  const problems=validateCutoffAutomation(inst.automation,inst,beat.bars);
  if(problems.length)throw Error("Source Beat cutoff movement is invalid: "+problems[0]);
 }
 const end=clip.startStep+clip.lengthSteps,from=fromStep??clip.startStep,to=toStep??end;
 if(!whole(from)||!positive(to)||from<clip.startStep||to>end||from>=to||
  to>FREEFORM_LIMIT_STEPS)
  throw Error("Unpack range must be inside the Beat Clip.");
 const safe=suggestSafeUnpackRange(song,clipId,from,to);
 if(safe.adjusted)throw Error("A sustained note crosses the selection boundary. "+
  "Expand the selection to Song steps "+safe.fromStep+"–"+safe.toStep+
  " to keep the original notes intact.");
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
   if(event.instrument.automation!==undefined){
    // Match the original Beat/Clip automation limit, including partial Clips.
    // The movement follows this note when its passage moves in the Song.
    note.cutoffAutomation={version:1,block:clone(event.instrument.automation),
     step:local,limitStep:Math.min(cycle,local+end+(clip.automationTailSteps??0)-step)};
   }
   addFreeformNote(converted,note);
  }
 }
 layer.passages.push(passage);
 if(beat.instruments.some(inst=>inst.automation!==undefined))layer.version=2;
 const errors=validateFreeform(layer);
 if(errors.length)throw Error("Could not unpack: "+errors[0]);
 const keep=[];
 if(from>clip.startStep){
  const left={...clone(clip),lengthSteps:from-clip.startStep};
  if(beat.instruments.some(inst=>inst.automation!==undefined)||clip.automationTailSteps!==undefined)
   left.automationTailSteps=end-from+(clip.automationTailSteps??0);
  keep.push(left);
 }
 if(to<end)keep.push({...clone(clip),id:id(),startStep:to,lengthSteps:end-to,
  sourceOffsetSteps:((clip.sourceOffsetSteps??0)+to-clip.startStep)%cycle});
 track.clips=track.clips.filter(item=>item.id!==clipId).concat(keep);
 track.freeform=layer;
 song.version=layer.version===2||song.version===FREEFORM_AUTOMATION_SONG_VERSION?
  FREEFORM_AUTOMATION_SONG_VERSION:FREEFORM_SONG_VERSION;
 return passage;
}
