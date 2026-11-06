// Canonical note-row and note-surface renderer for Beat and Song-time freeform.
// Adapters determine which musical notes to render and how edits are committed;
// the DOM surfaces, row descriptors and time projection live here.
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

export function createPianoRollRow(rowData,{mode="song",keyboard=false,onPlay}={}){
 if(mode!=="beat"&&mode!=="song")throw Error("Unknown piano roll mode");
 if(mode==="beat"){
  const row=el("div","piano-row"+(rowData.sharp?" sharp":""));
  row.dataset.pitch=String(rowData.pitch);
  const label=el(keyboard?"span":"button","note-name",keyboard?"":rowData.label);
  label.setAttribute("aria-label",keyboard?rowData.label:"Play "+rowData.label);
  label.title=keyboard?rowData.label:"play "+rowData.label;
  if(!keyboard){
   label.type="button";
   if(onPlay)label.addEventListener("click",()=>onPlay(rowData.pitch,label));
  }
  row.append(label);
  return {row,label,surface:row};
 }
 const label=el("div","freeform-key",rowData.label);
 if(rowData.pitch!==null)label.dataset.freeformPitch=String(rowData.pitch);
 const row=el("div","freeform-note-row");
 return {row,label,surface:row};
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
