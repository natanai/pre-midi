// Canonical note-row and note-surface renderer for Beat and Song-time freeform.
// Adapters determine which musical notes to render and how edits are committed;
// the DOM surfaces, row descriptors and time projection live here.
export const PIANO_ROW_HEIGHT=23;
export const PIANO_STEP_WIDTH=40;

const el=(tag,className,text)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=text;
 return node;
};

export function pianoRollRows(instrument,{low=36,high=83,noteLabel=pitch=>String(pitch)}={}){
 if(instrument?.layout==="rack")return instrument.sounds.map(sound=>({
  pitch:null,soundId:sound.id,label:sound.name,sharp:false
 }));
 if(!Number.isInteger(low)||!Number.isInteger(high)||low<0||high>127||low>high)
  throw RangeError("Invalid piano roll pitch range");
 return Array.from({length:high-low+1},(_,i)=>{
  const pitch=high-i;
  return {pitch,soundId:null,label:noteLabel(pitch),
   sharp:[1,3,6,8,10].includes(pitch%12)};
 });
}

// Row membership and hit-testing share the same pitched/Rack Sound identity
// in Beat-local Chunks and absolute Song-time freeform notes.
export function pianoRowMatchesNote(note,rowData){
 if(!note||!rowData)return false;
 if(rowData.soundId!==null&&rowData.soundId!==undefined)
  return note.soundId===rowData.soundId;
 return Number.isInteger(rowData.pitch)&&note.pitch===rowData.pitch;
}
export function notesForPianoRow(notes,rowData){
 return notes.filter(note=>pianoRowMatchesNote(note,rowData));
}
export function noteAtPianoStep(notes,rowData,step){
 if(!Number.isInteger(step)||step<0)return null;
 return notes.find(note=>pianoRowMatchesNote(note,rowData)&&
  note.start<=step&&step<note.start+note.duration)??null;
}

// Rack steps are discrete sample triggers: a hit belongs to its onset cell,
// even if its recorded sample has a longer natural playback duration.
export function noteStartingAtPianoStep(notes,rowData,step){
 if(!Number.isInteger(step)||step<0)return null;
 return notes.find(note=>pianoRowMatchesNote(note,rowData)&&note.start===step)??null;
}

export function createPianoRollRow(rowData,{keyboard=false,onPlay}={}){
 const rack=rowData.soundId!==null;
 const row=el("div","piano-row"+(rowData.sharp?" sharp":"")+(rack?" piano-rack-row rack-row":""));
 if(rack)row.dataset.soundId=rowData.soundId;
 else row.dataset.pitch=String(rowData.pitch);
 const label=el(keyboard?"span":"button",rack?"rack-name":"note-name",keyboard?"":rowData.label);
 label.setAttribute("aria-label",keyboard?rowData.label:"Play "+rowData.label);
 label.title=keyboard?rowData.label:"play "+rowData.label;
 if(!keyboard){
  label.type="button";
  if(onPlay)label.addEventListener("click",()=>onPlay(rowData.pitch,label,rowData.soundId));
 }
 const surface=el("div","piano-row-notes"),head=rack?el("div","rack-row-head"):label;
 if(rack)head.append(label);
 row.append(head,surface);
 return {row,label,surface,head};
}

// Timing adapters populate the same row surface: Beat-local step cells or
// absolute Song-time notes. Keyboard, scale, rows and dimensions have one owner.
export function renderPianoRollRows(instrument,{keyboard=false,onPlay,
 low=36,high=83,noteLabel=pitch=>String(pitch)}={}){
 return pianoRollRows(instrument,{low,high,noteLabel}).map(rowData=>({
  rowData,...createPianoRollRow(rowData,{keyboard,onPlay})
 }));
}

export function createPianoNoteSurface({className,ariaLabel,onClick}={}){
 const surface=el("button",className);
 surface.type="button";
 if(ariaLabel)surface.setAttribute("aria-label",ariaLabel);
 if(onClick)surface.addEventListener("click",onClick);
 return surface;
}

// Song-time notes and Beat time columns use the same step-to-pixel projection.
// Freeform may show only a middle portion of a sustained note.
export function noteWindow(note,fromStep,steps,stepWidth){
 if(!Number.isInteger(fromStep)||fromStep<0||!Number.isInteger(steps)||steps<1||
  !Number.isFinite(stepWidth)||stepWidth<=0)throw RangeError("Invalid note viewport");
 const beginning=Math.max(note.start,fromStep);
 const ending=Math.min(note.start+note.duration,fromStep+steps);
 if(ending<=beginning)return null;
 return {
  start:beginning,
  end:ending,
  left:(beginning-fromStep)*stepWidth,
  width:Math.max(3,(ending-beginning)*stepWidth),
  clippedStart:beginning>note.start,
  clippedEnd:ending<note.start+note.duration
 };
}

export function applyPianoNoteState(surface,{selected=false,layered=false,overflow=false,
 head=false,tail=false,end=false,bent=false,dragging=false}={}){
 for(const [name,value] of Object.entries({
  selected,layered,"layer-overflow":overflow,filled:head,tail,end,bent,dragging
 }))surface.classList.toggle(name,!!value);
 return surface;
}
