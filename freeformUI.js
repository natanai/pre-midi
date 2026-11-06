// Attached freeform Song lane and Song-position piano roll.
// Every mutation passes through the studio's existing Song undo/history boundary.
import {createFreeform,ensureFreeform,attachBeatInstruments,attachedBeatForTrack,resolveFreeformInstrument,sourceForFreeformInstrument,addFreeformInstrument,addFreeformNote,
 addFreeformChunkPlacement,editFreeformChunkPlacement,removeFreeformChunkPlacement,
 moveFreeformPassage,createBeatFromFreeformSelection,soundingFreeformPitches,
 previewFreeformPassageLayering,FREEFORM_LIMIT_STEPS,
 duplicateFreeformInstrument,moveFreeformInstrument,removeFreeformInstrument} from "./freeformModel.js";
import {addBeat} from "./songModel.js";
import {makeChunk,id} from "./schema.js";
import {referencedSampleIds} from "./soundModel.js";
import {installFreeformSoundUI} from "./freeformSoundUI.js";
import {overlappingFreeformNotes,layoutFreeformNoteRow} from "./freeformLayerUIModel.js";
import {createFreeformNoteCutoff,editFreeformNoteCutoff} from "./freeformNoteAutomation.js";
import {illustrateSoundPanel} from "./soundIllustrations.js";
import {mountPianoKeyOverlay,populateScaleSelectors} from "./editorPianoView.js";
import {pianoRollRows,createPianoRollRow,createPianoNoteSurface,noteWindow,applyPianoNoteState} from "./editorPianoRoll.js";
import {bindPianoNoteGesture,noteEndGrabWidth} from "./pianoNoteGesture.js";
import {createInstrumentCard} from "./editorInstrumentCard.js";
import {installKeyboardPiano,pitchName} from "./keyboardPiano.js";
import {normalizeScaleGuide,isPitchInScaleAtStep} from "./scaleGuide.js";
import {audition,auditionHeld} from "./audio.js";

const BAR_STEPS=16,SONG_BAR_PIXELS=54,STEP_WIDTH=8,ROW_HEIGHT=20,VIEW_BARS=8;
const PITCH_MIN=36,PITCH_MAX=96;
const el=(tag,cls,text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;
 return node;
};
const action=(label,onClick,cls="")=>{
 const button=el("button",cls,label);button.type="button";
 button.addEventListener("click",onClick);return button;
};
const input=(type,value,min,max,onChange)=>{
 const node=el("input");node.type=type;node.value=String(value);
 if(min!==undefined)node.min=String(min);
 if(max!==undefined)node.max=String(max);
 if(type==="number")node.step="1";
 if(type==="range")node.step="0.01";
 node.addEventListener("change",()=>onChange(Number(node.value)));
 return node;
};
const field=(label,control)=>{
 const box=el("label","freeform-field");box.append(el("span","",label),control);return box;
};
export function installFreeformUI({root,getSong,onChange,onError=()=>{},onActiveChange=()=>{},
 onBeatCreated=()=>{},onBrowseSound=()=>{},onSaveSound=()=>{},
 getSongStep=()=>null,seekSongStep=()=>{},onSelectSourceBeat=()=>{},
 getScaleGuide=()=>normalizeScaleGuide(),setScaleGuide=()=>{},
 getShowPianoKeys=()=>true,setShowPianoKeys=()=>{}}){
 const panel=el("section","song-freeform-editor");panel.hidden=true;
 panel.setAttribute("aria-label","Freeform Song notes");
 // The Song panel is only the arranger. The lower workspace belongs to
 // either Beat or freeform, never to a vertically clipped Song subpanel.
 const main=root.closest("main");
 const beatWorkspace=main?.querySelector(".work");
 if(beatWorkspace)beatWorkspace.before(panel);
 else root.append(panel);
 let activeTrackId=null,activeInstrumentId=null,selectedNoteId=null,selectedPlacementId=null,barStart=0,playStep=null;
 let selectionStartStep=0,selectionLengthSteps=16;
 let editorScrollTop=null,editorScrollLeft=null,editingFreeformNoteEffects=false;
 const track=()=>getSong()?.tracks.find(item=>item.kind==="beat"&&item.id===activeTrackId);
 const layer=()=>track()?.freeform;
 const rawInstrument=()=>layer()?.instruments.find(item=>item.id===activeInstrumentId)||layer()?.instruments[0];
 const instrument=()=>resolveFreeformInstrument(getSong(),rawInstrument(),{editable:true});
 const parentBeat=()=>attachedBeatForTrack(getSong(),track());
 const currentNote=()=>instrument()?.notes.find(note=>note.id===selectedNoteId);
 const roll=el("div","freeform-roll-scroll");
 const pianoTools=el("div","piano-tools freeform-piano-tools");
 const keysToggle=action("▥",()=>{
  setShowPianoKeys(!getShowPianoKeys());
  render();
 },"piano-keys-toggle");
 keysToggle.setAttribute("aria-label","show piano keys");
 const noteModeToggle=action("✎",()=>{
  editingFreeformNoteEffects=!editingFreeformNoteEffects;
  if(!editingFreeformNoteEffects)selectedNoteId=null;
  render();
 },"freeform-note-mode");
 noteModeToggle.setAttribute("aria-label","edit note effects");
 const qwertyToggle=el("button","piano-keys-toggle","⌨");
 qwertyToggle.type="button";
 qwertyToggle.setAttribute("aria-label","play with QWERTY keyboard");
 pianoTools.append(keysToggle,qwertyToggle,noteModeToggle);
 const scales=el("div","scale-controls freeform-scale-controls");
 const scaleRoot=el("select"),scaleMode=el("select");
 populateScaleSelectors(scaleRoot,scaleMode);
 const scaleLock=el("input");scaleLock.type="checkbox";
 const lockLabel=el("label","scale-lock-control");
 lockLabel.append(scaleLock,document.createTextNode("limit notes"));
 scales.append(field("key",scaleRoot),field("scale",scaleMode),lockLabel);
 function changeScale(patch){
  const chosen=track();if(!chosen)return;
  setScaleGuide(chosen,{...normalizeScaleGuide(getScaleGuide(chosen)),...patch});
  render();
 }
 scaleRoot.addEventListener("change",()=>changeScale({root:Number(scaleRoot.value)}));
 scaleMode.addEventListener("change",()=>changeScale({mode:scaleMode.value}));
 scaleLock.addEventListener("change",()=>changeScale({lock:scaleLock.checked}));
 const freeformPreviewContext=()=>({
  samples:[...new Map([...(layer()?.samples??[]),
   ...(sourceForFreeformInstrument(getSong(),rawInstrument())?.beat.samples??[])]
   .map(asset=>[asset.id,asset])).values()],
  instruments:rawInstrument()?[resolveFreeformInstrument(getSong(),rawInstrument())]:[],
  bars:1,bpm:getSong()?.bpm??120
 });
 const keyboardPiano=installKeyboardPiano({
  toggle:qwertyToggle,toolbar:pianoTools,scroll:roll,pianoRoot:roll,
  idPrefix:"freeform-keyboard-piano",highPitch:PITCH_MAX,rowHeight:ROW_HEIGHT,
  getInstrument:instrument,getBeat:freeformPreviewContext,playNote:auditionHeld
 });
 function playKey(pitch,key){
  key.classList.remove("pressed");
  void key.offsetWidth;
  key.classList.add("pressed");
  setTimeout(()=>key.classList.remove("pressed"),220);
  const inst=resolveFreeformInstrument(getSong(),rawInstrument());
  if(inst)void audition(inst,pitch,freeformPreviewContext())
   .catch(error=>onError("Couldn't preview key: "+error.message));
 }

 function mutate(fn){
  const result=onChange(fn);
  if(result===false)return false;
  render();
  return true;
 }
 const soundUI=installFreeformSoundUI({
  getSong,getLayer:layer,getInstrument:instrument,mutate,onError,
  onBrowseSound:context=>onBrowseSound({...context,trackId:activeTrackId}),
  onSaveSound:context=>onSaveSound({...context,trackId:activeTrackId})
 });
 function close(){
  const wasActive=activeTrackId!==null;
  activeTrackId=null;activeInstrumentId=null;selectedNoteId=null;selectedPlacementId=null;
  keyboardPiano.stop();editingFreeformNoteEffects=false;panel.hidden=true;panel.replaceChildren();if(wasActive)onActiveChange(false);
 }
 function open(trackId,passageId=null,anchorStep=null){
  const chosen=getSong()?.tracks.find(item=>item.kind==="beat"&&item.id===trackId);
  if(!chosen)return;
  const source=attachedBeatForTrack(getSong(),chosen);
  // A legacy project with independent freeform Instruments retains them.
  // A newly opened attached lane derives its Instrument definitions from Beat.
  const hasIndependent=chosen.freeform?.instruments.some(inst=>!inst.sourceBeatId);
  const missingLinked=source&&chosen.freeform?.instruments.some(inst=>inst.sourceBeatId)&&
   source.instruments.some(item=>!chosen.freeform.instruments.some(inst=>
    inst.sourceBeatId===source.id&&inst.sourceInstrumentId===item.id));
  if((!chosen.freeform||source&&!hasIndependent&&
   (!chosen.freeform.instruments.length||missingLinked))&&
   !mutate(()=>source?attachBeatInstruments(getSong(),chosen,source.id):ensureFreeform(chosen)))return;
  activeTrackId=chosen.id;
  activeInstrumentId=chosen.freeform?.instruments[0]?.id??null;
  selectedNoteId=null;selectedPlacementId=null;
  const selectedPassage=chosen.freeform?.passages.find(p=>p.id===passageId);
  const anchor=anchorStep??getSongStep()??selectedPassage?.startStep??0;
  barStart=Math.floor(anchor/BAR_STEPS);
  selectionStartStep=selectedPassage?.startStep??barStart*BAR_STEPS;
  selectionLengthSteps=selectedPassage?.lengthSteps??BAR_STEPS;
  editorScrollTop=null;editorScrollLeft=null;
  panel.hidden=false;onActiveChange(true);render();
  paintSelectionRange();
 }
 function paintSelectionRange(){
  for(const old of root.querySelectorAll(".song-freeform-selected-range"))old.remove();
  const parent=[...root.querySelectorAll(".song-freeform-row")]
   .find(row=>row.dataset.parentTrackId===activeTrackId);
  const lane=parent?.querySelector(".song-freeform-lane");
  if(!lane||selectionLengthSteps<1)return;
  const marker=el("span","song-freeform-selected-range");
  marker.setAttribute("aria-hidden","true");
  marker.style.left=selectionStartStep/BAR_STEPS*SONG_BAR_PIXELS+"px";
  marker.style.width=selectionLengthSteps/BAR_STEPS*SONG_BAR_PIXELS+"px";
  lane.append(marker);
 }
 function viewStep(){return barStart*BAR_STEPS;}
 function addInstrument(){
  const chosen=track(),song=getSong();
  if(!chosen||!song)return;
  const source=null;
  let newId=null;
  if(!mutate(()=>{
   const free=ensureFreeform(chosen);
   const inst=addFreeformInstrument(free,source);
   newId=inst.id;
   if(source){
    const needed=referencedSampleIds([source]);
    for(const asset of song.beats[0].samples.filter(item=>needed.has(item.id)))
     if(!free.samples.some(item=>item.id===asset.id))free.samples.push(structuredClone(asset));
   }
  }))return;
  activeInstrumentId=newId;selectedNoteId=null;selectedPlacementId=null;render();
 }
 function changeNote(noteId,patch){
  const original=instrument()?.notes.find(note=>note.id===noteId);
  if(!original)return;
  mutate(()=>Object.assign(original,patch));
 }
 function addNoteAt(pitch,step,duration=1,soundId=null){
  const inst=instrument();
  if(!inst)return;
  if(inst.layout!=="rack"){
   const guide=normalizeScaleGuide(getScaleGuide(track()));
   if(guide.lock&&!isPitchInScaleAtStep(pitch,guide,inst.notes,step))return;
  }
  let newId=id();
  if(mutate(()=>addFreeformNote(inst,inst.layout==="rack"?
   {id:newId,soundId,start:step,duration:1,velocity:.85}:
   {id:newId,pitch,start:step,duration,velocity:.85}))){
   selectedNoteId=newId;render();
  }
 }
 function createBeatFromSelection(){
  const current=track(),song=getSong();
  if(!current||!song)return;
  let made=null;
  const saved=mutate(()=>{
   const beat=createBeatFromFreeformSelection(song,current.id,
    selectionStartStep,selectionStartStep+selectionLengthSteps,
    {title:current.name+" selection"});
   made=addBeat(song,beat);
  });
  if(saved&&made)onBeatCreated(made);
 }
 function makeChunkAtBar(){
  const inst=instrument();if(!inst)return;
  const start=viewStep();
  const picked=inst.notes.filter(note=>note.start>=start&&note.start<start+16);
  if(!picked.length){onError("No independent notes in this bar to make a Chunk.");return;}
  if(inst.chunks.length>=32){onError("This Instrument already has 32 Chunks.");return;}
  mutate(()=>{
   const chunk=makeChunk("Chunk "+(inst.chunks.length+1));
   chunk.notes=picked.map(note=>{
    const basic=structuredClone(note);
    basic.id=id();basic.start=note.start-start;
    delete basic.passageId;delete basic.strumGroup;delete basic.strumKey;
    return basic;
   });
   inst.chunks.push(chunk);
   const group=picked.every(note=>note.passageId===picked[0].passageId)?picked[0].passageId:undefined;
   inst.notes=inst.notes.filter(note=>!picked.some(item=>item.id===note.id));
   addFreeformChunkPlacement(inst,chunk.id,start,{passageId:group});
   selectedNoteId=null;
  });
 }
 function renderNoteFields(container,note){
  if(!note)return;
  const section=el("div","freeform-note-details");
  const position=note.start;
  section.append(el("span","freeform-detail-title","selected note"));
  const patch=instrument()?.layout==="pitched"?
   instrument()?.sounds?.[0]?.patch:null;
  if(patch?.type==="synth"){
   if(!note.cutoffAutomation){
    section.append(action("move cutoff over time",()=>{
     mutate(()=>{
      const current=currentNote();
      if(!current)return;
      current.cutoffAutomation=createFreeformNoteCutoff(current,patch);
      layer().version=2;
     });
    },"freeform-add-cutoff"));
   }else{
    const captured=note.cutoffAutomation;
    const details=el("details","freeform-note-cutoff freeform-sound-content");
    details.open=true;
    const heading=el("summary","","cutoff over time · source phase");
    heading.title="This curve is attached to the note, not its original Song bar.";
    details.append(heading);
    const diagramPatch={...captured.block,type:"automation",
     bars:Math.max(1/16,
      Math.max(captured.limitStep,...captured.block.points.map(point=>point.step))/16)};
    const change=(path,value)=>{
     const current=currentNote();
     if(!current||!current.cutoffAutomation)return;
     mutate(()=>{current.cutoffAutomation=
      editFreeformNoteCutoff(current.cutoffAutomation,path,value);});
    };
    const visualDetails=el("details","synth-group");visualDetails.open=true;
    visualDetails.append(el("summary","","cutoff curve"));
    const picture=illustrateSoundPanel(visualDetails,"automation",diagramPatch,
     change,()=>{},activeInstrumentId+":"+note.id);
    details.append(picture.element);
    for(const [index,point] of captured.block.points.entries()){
     const name=index?"end":"begin";
     const positionField=field(name+" step",input("number",point.step,0,1024,
      value=>change(["points",index,"step"],value)));
     positionField.dataset.soundPath="points."+index+".step";
     details.append(positionField);
     const cutoffField=field(name+" cutoff · hz",input("number",point.value,50,14000,
      value=>change(["points",index,"value"],value)));
     cutoffField.dataset.soundPath="points."+index+".value";
     details.append(cutoffField);
    }
    details.append(el("span","freeform-layer-help",
     "Drag both handles to change when the filter moves and how bright the sound becomes."));
    details.append(action("remove cutoff movement",()=>mutate(()=>{
     const current=currentNote();if(current)delete current.cutoffAutomation;
    }),"freeform-remove-cutoff"));
    section.append(details);
   }
  }
  const overlaps=overlappingFreeformNotes(instrument(),note);
  if(overlaps.length){
   const other=el("label","freeform-field freeform-layer-choice");
   const select=el("select");
   select.setAttribute("aria-label","Choose overlapping freeform note");
   const choices=[note,...overlaps].sort((a,b)=>a.start-b.start||
    String(a.id).localeCompare(String(b.id)));
   for(const entry of choices){
    const label="bar "+(Math.floor(entry.start/16)+1)+" · step "+
     (entry.start%16+1)+" · "+entry.duration+" steps";
    const option=el("option","",label);option.value=entry.id;select.append(option);
   }
   select.value=note.id;
   select.addEventListener("change",()=>{selectedNoteId=select.value;render();});
   other.append(el("span","","overlapping notes · "+choices.length),select);
   section.append(other);
   section.append(el("span","freeform-layer-help",
    "These notes play together. Choose one to edit without changing the others."));
  }
  section.append(field("bar",input("number",Math.floor(position/16)+1,1,4096,v=>{
   if(Number.isInteger(v))changeNote(note.id,{start:(v-1)*16+position%16});
  })));
  section.append(field("step",input("number",position%16+1,1,16,v=>{
   if(Number.isInteger(v))changeNote(note.id,{start:Math.floor(position/16)*16+v-1});
  })));
  if(instrument().layout==="pitched")section.append(field("pitch",input("number",note.pitch,36,96,v=>{
   if(Number.isInteger(v))changeNote(note.id,{pitch:v});
  })));
  section.append(field("length",input("number",note.duration,1,65536,v=>{
   if(Number.isInteger(v))changeNote(note.id,{duration:v});
  })));
  section.append(field("level",input("range",note.velocity,0,1,v=>{
   if(Number.isFinite(v))changeNote(note.id,{velocity:v});
  })));
  section.append(action("+ layer note",()=>{
   const duplicate=structuredClone(note);
   duplicate.id=id();
   if(mutate(()=>addFreeformNote(instrument(),duplicate))){
    selectedNoteId=duplicate.id;render();
   }
  },"freeform-duplicate-note"));
  section.append(action("delete note",()=>mutate(()=>{
   const inst=instrument();inst.notes=inst.notes.filter(item=>item.id!==note.id);
   selectedNoteId=null;
  }),"freeform-delete"));
  container.append(section);
 }
 function paintPosition(){
  const marker=panel.querySelector(".freeform-playhead");
  if(marker){
   const x=playStep===null?-1:(playStep-viewStep())*STEP_WIDTH;
   marker.hidden=x<0||x>=VIEW_BARS*BAR_STEPS*STEP_WIDTH;
   if(!marker.hidden)marker.style.left=x+"px";
  }
  const inst=instrument();
  const sounding=playStep===null?new Set():
   soundingFreeformPitches(layer(),inst?.id,playStep);
  for(const key of panel.querySelectorAll("[data-freeform-pitch]")){
   key.classList.toggle("sounding",sounding.has(Number(key.dataset.freeformPitch)));
  }
 }
 function render(){
  const song=getSong(),chosen=track();
  if(!song||!chosen||!chosen.freeform){close();return;}
  const previousScroll=panel.querySelector(".freeform-roll-scroll");
  if(previousScroll){
   editorScrollTop=previousScroll.scrollTop;editorScrollLeft=previousScroll.scrollLeft;
  }
  panel.replaceChildren();
  panel.hidden=false;
  const header=el("div","freeform-editor-header");
  const heading=el("div","freeform-editor-title","freeform · "+chosen.name);
  header.append(heading,action("×",close,"freeform-close"));
  const workspace=el("div","freeform-work");
  const sidebar=el("aside","freeform-instrument-pane");
  const mainwork=el("div","freeform-mainwork");
  const noteWorkspace=el("section","freeform-note-work");
  const inspector=el("section","freeform-sound-pane");
  workspace.append(sidebar,mainwork);
  mainwork.append(noteWorkspace,inspector);
  panel.append(header,workspace);
  const tools=el("div","freeform-editor-tools");
  const free=chosen.freeform;
  const inst=instrument();
  if(inst)activeInstrumentId=inst.id;
  const instrumentList=el("div","freeform-instrument-list");
  instrumentList.setAttribute("role","group");
  instrumentList.setAttribute("aria-label","Instruments");
  let activeEntry=null;
  for(const option of free.instruments){
   const selected=option.id===inst?.id;
   const entry=el("div","instrument-entry");
   const card=createInstrumentCard(resolveFreeformInstrument(song,option),{
    selected,accent:"#83c6a9",
    onSelect:()=>{
     if(activeInstrumentId===option.id)return;
     activeInstrumentId=option.id;selectedNoteId=null;selectedPlacementId=null;
     editorScrollTop=null;render();
    }
   });
   entry.append(card);instrumentList.append(entry);
   if(selected)activeEntry=entry;
  }
  sidebar.append(instrumentList);
  if(!sourceForFreeformInstrument(song,rawInstrument()))tools.append(action("+ instrument",addInstrument),
   action("browse sounds",()=>onBrowseSound({
    trackId:activeTrackId,mode:inst?"replace":"add",
    instrumentId:inst?.id??null,soundId:soundUI.getSelectedSound()?.id??null
   }),"freeform-instrument-browse"));
  else tools.append(action("edit beat instruments",()=>{
   close();onSelectSourceBeat(parentBeat().id);
  },"freeform-source-beat"));
  if(inst){
   const menu=el("details","freeform-instrument-menu");
   const menuLabel=el("summary","","⋯");
   menuLabel.setAttribute("aria-label","Instrument actions");
   menuLabel.title="duplicate · reorder · remove Instrument";
   menu.append(menuLabel);
   const options=el("div","freeform-instrument-menu-actions");
   options.setAttribute("role","group");
   options.setAttribute("aria-label","Freeform Instrument actions");
   options.append(action("rename",()=>{
    const name=prompt("Rename instrument",inst.name);
    if(name===null)return;
    const next=name.trim().slice(0,60);
    if(next&&next!==inst.name)mutate(()=>{inst.name=next;});
   },"freeform-instrument-rename"));
   if(!sourceForFreeformInstrument(song,rawInstrument())){
   options.append(action("duplicate",()=>{
    let copy=null;
    if(mutate(()=>{copy=duplicateFreeformInstrument(free,inst.id);})){
     activeInstrumentId=copy.id;selectedNoteId=null;selectedPlacementId=null;editorScrollTop=null;render();
    }
   },"freeform-instrument-copy"));
   const index=free.instruments.findIndex(item=>item.id===inst.id);
   const up=action("move up",()=>mutate(()=>
    moveFreeformInstrument(free,inst.id,-1)),"freeform-instrument-up");
   const down=action("move down",()=>mutate(()=>
    moveFreeformInstrument(free,inst.id,1)),"freeform-instrument-down");
   up.disabled=index===0;down.disabled=index===free.instruments.length-1;
   options.append(up,down);
   options.append(action("remove",()=>{
    if((inst.notes.length||inst.chunkPlacements.length)&&
     !confirm("Remove "+inst.name+" and its notes and Chunk placements? Undo restores it."))return;
    const remaining=free.instruments.filter(item=>item.id!==inst.id);
    if(mutate(()=>removeFreeformInstrument(free,inst.id))){
     activeInstrumentId=remaining[Math.min(index,remaining.length-1)]?.id??null;
     selectedNoteId=null;selectedPlacementId=null;editorScrollTop=null;render();
    }
   },"freeform-instrument-remove"));
   }
   menu.append(options);activeEntry?.append(menu);
  }
  const seekTo=step=>{
   const target=Math.max(0,Math.min(FREEFORM_LIMIT_STEPS-BAR_STEPS,
    Math.floor(step/BAR_STEPS)*BAR_STEPS));
   seekSongStep(target);
   // Standalone fixtures do not install a Song scrubber host.
   if(getSongStep()===null)seekToStep(target);
  };
  const previous=action("←",()=>seekTo(viewStep()-4*BAR_STEPS),"freeform-nav");
  previous.setAttribute("aria-label","move Song scrubber earlier four bars");
  const next=action("→",()=>seekTo(viewStep()+4*BAR_STEPS),"freeform-nav");
  next.setAttribute("aria-label","move Song scrubber later four bars");
  const barControl=input("number",barStart+1,1,4096,value=>{
   if(Number.isInteger(value)&&value>=1)seekTo((value-1)*BAR_STEPS);
  });
  barControl.setAttribute("aria-label","Song scrubber bar");
  tools.append(previous,field("song bar",barControl),next);
  sidebar.append(tools);
  const selection=el("div","freeform-selection-tools");
  const selectionTitle=el("span","freeform-selection-title","create Beat from selection");
  const startBar=input("number",Math.floor(selectionStartStep/16)+1,1,4096,v=>{
   if(Number.isInteger(v)&&v>0){
    selectionStartStep=(v-1)*16+selectionStartStep%16;
    paintSelectionRange();
   }
  });
  startBar.setAttribute("aria-label","Selection start bar");
  const startStep=input("number",selectionStartStep%16+1,1,16,v=>{
   if(Number.isInteger(v)&&v>=1&&v<=16){
    selectionStartStep=Math.floor(selectionStartStep/16)*16+v-1;
    paintSelectionRange();
   }
  });
  startStep.setAttribute("aria-label","Selection start step");
  const length=input("number",selectionLengthSteps/16,1/16,64,v=>{
   const steps=Math.round(v*16);
   if(Number.isFinite(v)&&steps>=1&&steps<=1024){selectionLengthSteps=steps;paintSelectionRange();}
  });
  length.step="0.0625";
  length.setAttribute("aria-label","Selection length in bars");
  const createButton=action("create Beat",createBeatFromSelection,"freeform-create-beat");
  createButton.title="Create a reusable Beat; keep the freeform notes untouched";
  selection.append(selectionTitle,field("bar",startBar),field("step",startStep),
   field("length · bars",length),createButton);
  sidebar.append(selection);
  paintSelectionRange();
  if(!inst){
   noteWorkspace.append(el("p","freeform-empty","Add an instrument to draw Song-time notes."));
   return;
  }
  inspector.append(soundUI.render());
  const chunkControls=el("div","freeform-chunk-tools");
  chunkControls.append(action("make Chunk from this bar",makeChunkAtBar));
  const chunkPicker=el("select");chunkPicker.setAttribute("aria-label","Reusable Chunk");
  for(const chunk of inst.chunks){
   const opt=el("option","",chunk.name);opt.value=chunk.id;chunkPicker.append(opt);
  }
  chunkControls.append(chunkPicker,action("place Chunk",()=>{
   let created=null;
   if(mutate(()=>{created=addFreeformChunkPlacement(inst,chunkPicker.value,viewStep());})){
    selectedPlacementId=created.id;render();
   }
  }));
  sidebar.append(chunkControls);
  if(inst.chunkPlacements.length){
   const placement=inst.chunkPlacements.find(p=>p.id===selectedPlacementId)||
    inst.chunkPlacements.at(-1);
   selectedPlacementId=placement.id;
   const controls=el("div","freeform-placement-editor");
   const placementChoice=el("select");
   placementChoice.setAttribute("aria-label","Placed freeform Chunk");
   for(const item of inst.chunkPlacements){
    const source=inst.chunks.find(chunk=>chunk.id===item.chunkId);
    const opt=el("option","",(source?.name||"Chunk")+" · bar "+
     (Math.floor(item.startStep/16)+1)+" step "+(item.startStep%16+1));
    opt.value=item.id;placementChoice.append(opt);
   }
   placementChoice.value=placement.id;
   placementChoice.addEventListener("change",()=>{
    selectedPlacementId=placementChoice.value;render();
   });
   const change=patch=>mutate(()=>editFreeformChunkPlacement(inst,placement.id,patch));
   const positionBar=input("number",Math.floor(placement.startStep/16)+1,1,4096,value=>{
    if(Number.isInteger(value)&&value>=1)
     change({startStep:(value-1)*16+placement.startStep%16});
   });
   positionBar.setAttribute("aria-label","Placed Chunk start bar");
   const positionStep=input("number",placement.startStep%16+1,1,16,value=>{
    if(Number.isInteger(value)&&value>=1&&value<=16)
     change({startStep:Math.floor(placement.startStep/16)*16+value-1});
   });
   positionStep.setAttribute("aria-label","Placed Chunk start step");
   const repeat=input("number",placement.repeats,1,32,value=>change({repeats:value}));
   repeat.setAttribute("aria-label","Placed Chunk repetitions");
   const every=input("number",placement.every,1,64,value=>change({every:value}));
   every.setAttribute("aria-label","Placed Chunk spacing in steps");
   const span=input("number",placement.length,1,16,value=>change({length:value}));
   span.setAttribute("aria-label","Placed Chunk onset window in steps");
   const remove=action("remove placement",()=>{
    if(mutate(()=>removeFreeformChunkPlacement(inst,placement.id))){
     selectedPlacementId=null;render();
    }
   },"freeform-placement-remove");
   remove.title="Remove this Song placement without deleting the reusable Chunk";
   controls.append(field("placed Chunk",placementChoice),
    field("bar",positionBar),field("step",positionStep),
    field("repeats",repeat),field("every · steps",every),
    field("onset span",span),remove);
   sidebar.append(controls);
  }
  const guide=normalizeScaleGuide(getScaleGuide(chosen));
  scaleRoot.value=String(guide.root);scaleMode.value=guide.mode;
  scaleLock.checked=guide.lock;scaleLock.disabled=guide.mode==="chromatic";
  scales.hidden=inst.layout==="rack";
  pianoTools.hidden=inst.layout==="rack";
  if(inst.layout==="rack")keyboardPiano.stop();
  noteModeToggle.setAttribute("aria-pressed",String(editingFreeformNoteEffects));
  noteModeToggle.setAttribute("aria-label",
   editingFreeformNoteEffects?"finish editing note effects":"edit note effects");
  noteModeToggle.title=editingFreeformNoteEffects?"finish editing note effects":"edit note effects";
  keysToggle.setAttribute("aria-pressed",String(getShowPianoKeys()));
  keysToggle.title=getShowPianoKeys()?"show note names":"show piano keys";
  roll.replaceChildren();
  noteWorkspace.append(scales,pianoTools,roll);
  const grid=el("div","freeform-roll-grid");
  const width=VIEW_BARS*BAR_STEPS*STEP_WIDTH;
  grid.style.setProperty("--freeform-width",width+"px");
  const ruler=el("div","freeform-roll-ruler");
  ruler.append(el("span","freeform-key-space","pitch"));
  const ticks=el("div","freeform-ruler-ticks");
  ticks.style.width=width+"px";
  for(let b=0;b<VIEW_BARS;b++){
   const tick=el("span","",String(barStart+b+1));
   tick.style.left=b*BAR_STEPS*STEP_WIDTH+"px";ticks.append(tick);
  }
  ruler.append(ticks);grid.append(ruler);
  // Repeated Chunks are visibly attached to their source Instrument, just
  // above the pitched notes or Rack Sounds. Select or nudge an instance
  // without turning it into independent notes or moving its parent Track.
  const placementStrip=el("div","freeform-chunk-strip");
  const stripLabel=el("span","freeform-chunk-strip-label","Chunks");
  const stripPlot=el("div","freeform-chunk-strip-plot");
  stripPlot.style.width=width+"px";
  let shown=0;
  for(const placement of inst.chunkPlacements){
   const chunk=inst.chunks.find(source=>source.id===placement.chunkId);
   if(!chunk)continue;
   const start=viewStep(),end=start+VIEW_BARS*BAR_STEPS;
   const first=Math.max(0,Math.ceil((start-placement.length+1-placement.startStep)/placement.every));
   const last=Math.min(placement.repeats-1,
    Math.floor((end-1-placement.startStep)/placement.every));
   for(let repetition=first;repetition<=last&&shown<256;repetition++){
    const at=placement.startStep+repetition*placement.every;
    const block=action(chunk.name,()=>{
     selectedPlacementId=placement.id;render();
    },"freeform-chunk-block");
    const active=placement.id===selectedPlacementId;
    block.classList.toggle("selected",active);
    block.title=chunk.name+" · repeat "+(repetition+1)+"/"+placement.repeats+
     " · bar "+(Math.floor(at/16)+1)+", step "+(at%16+1)+
     " · Alt+left/right: move bar · Shift+Alt+left/right: move step";
    block.setAttribute("aria-label",block.title);
    block.style.left=(at-start)*STEP_WIDTH+"px";
    block.style.width=Math.max(7,placement.length*STEP_WIDTH)+"px";
    block.addEventListener("keydown",event=>{
     if(!event.altKey||!["ArrowLeft","ArrowRight"].includes(event.key))return;
     event.preventDefault();event.stopPropagation();
     const delta=(event.key==="ArrowRight"?1:-1)*(event.shiftKey?1:16);
     const next=Math.max(0,placement.startStep+delta);
     if(next===placement.startStep)return;
     selectedPlacementId=placement.id;
     if(mutate(()=>editFreeformChunkPlacement(inst,placement.id,{startStep:next}))){
      [...panel.querySelectorAll(".freeform-chunk-block")]
       .find(item=>item.classList.contains("selected"))?.focus();
     }
    });
    block.addEventListener("pointerdown",event=>{
     if(event.button!==0)return;
     const firstX=event.clientX,original=placement.startStep;
     let moved=false;
     block.setPointerCapture(event.pointerId);
     const drag=e=>{
      if(e.pointerId!==event.pointerId)return;
      if(Math.abs(e.clientX-firstX)>4)moved=true;
      if(moved)block.style.transform="translateX("+
       Math.round((e.clientX-firstX)/STEP_WIDTH)*STEP_WIDTH+"px)";
     };
     const finish=e=>{
      if(e.pointerId!==event.pointerId)return;
      block.removeEventListener("pointermove",drag);
      block.removeEventListener("pointerup",finish);
      block.removeEventListener("pointercancel",finish);
      if(e.type==="pointerup"&&moved){
       const next=Math.max(0,original+Math.round((e.clientX-firstX)/STEP_WIDTH));
       selectedPlacementId=placement.id;
       mutate(()=>editFreeformChunkPlacement(inst,placement.id,{startStep:next}));
      }else if(moved)render();
     };
     block.addEventListener("pointermove",drag);
     block.addEventListener("pointerup",finish);
     block.addEventListener("pointercancel",finish);
    });
    stripPlot.append(block);shown++;
   }
   if(shown>=256)break;
  }
  placementStrip.append(stripLabel,stripPlot);grid.append(placementStrip);
  const instrumentRows=pianoRollRows(inst,{
   low:PITCH_MIN,high:PITCH_MAX,noteLabel:pitchName
  });
  const plot=el("div","freeform-plot");plot.style.width=width+"px";
  const keyColumn=el("div","freeform-key-column");
  for(const rowData of instrumentRows){
   const {row:noteRow,label:key}=createPianoRollRow(rowData,{mode:"song"});
   keyColumn.append(key);
   if(rowData.pitch!==null&&guide.mode!=="chromatic"){
    const inScale=isPitchInScaleAtStep(rowData.pitch,guide,inst.notes,viewStep());
    noteRow.classList.toggle("in-scale",inScale);
    noteRow.classList.toggle("out-of-scale",!inScale);
    key.classList.toggle("in-scale",inScale);
    key.classList.toggle("out-of-scale",!inScale);
   }
   noteRow.style.width=width+"px";noteRow.setAttribute("role","button");
   noteRow.tabIndex=0;
   noteRow.setAttribute("aria-label","Place "+(rowData.pitch!==null?"pitch "+rowData.pitch:rowData.label)+
    " at Song bar "+(barStart+1)+" or a clicked position");
   const rowNotes=inst.notes.filter(note=>rowData.pitch!==null?
    note.pitch===rowData.pitch:note.soundId===rowData.soundId);
   const stacks=layoutFreeformNoteRow(rowNotes);
   for(const note of rowNotes){
    const visible=noteWindow(note,viewStep(),VIEW_BARS*BAR_STEPS,STEP_WIDTH);
    if(!visible)continue;
    const position=stacks.get(note.id);
    let ignoreClick=false;
    const n=createPianoNoteSurface({className:"freeform-roll-note",onClick:()=>{
     if(ignoreClick)return;
     if(editingFreeformNoteEffects){selectedNoteId=note.id;render();return;}
     selectedNoteId=null;
     mutate(()=>{inst.notes=inst.notes.filter(item=>item.id!==note.id);});
    }});
    n.title="note at bar "+(Math.floor(note.start/16)+1)+", step "+(note.start%16+1)+
     (position.voices>1?"; up to "+position.voices+" layered notes on this row":"")+
     (editingFreeformNoteEffects?"; click to edit effects":"; click to remove; right-click to edit");
    n.setAttribute("aria-label",n.title);
    n.dataset.noteId=note.id;
    applyPianoNoteState(n,{
     selected:selectedNoteId===note.id,layered:position.voices>1,
     overflow:position.overflow
    });
    n.style.left=visible.left+"px";
    n.style.width=visible.width+"px";
    if(position.voices>1){
     n.style.top=(2+position.slot*(position.voices===2?8:5))+"px";
     n.style.height=(position.voices===2?7:4)+"px";
     n.style.zIndex=String(note.id===selectedNoteId?9:position.slot+2);
    }
    n.addEventListener("contextmenu",event=>{
     event.preventDefault();
     editingFreeformNoteEffects=true;selectedNoteId=note.id;render();
    });
    n.addEventListener("keydown",event=>{
     if(["Backspace","Delete"].includes(event.key)){
      event.preventDefault();selectedNoteId=null;
      mutate(()=>{inst.notes=inst.notes.filter(item=>item.id!==note.id);});
     }else if(event.altKey&&["ArrowLeft","ArrowRight"].includes(event.key)&&
      inst.layout!=="rack"){
      event.preventDefault();
      const next=Math.max(1,Math.min(FREEFORM_LIMIT_STEPS-note.start,
       note.duration+(event.key==="ArrowRight"?1:-1)));
      if(next!==note.duration)changeNote(note.id,{duration:next});
     }
    });
    bindPianoNoteGesture(n,{
     stepWidth:STEP_WIDTH,rowHeight:ROW_HEIGHT,
     begin:event=>{
      const rect=n.getBoundingClientRect();
      const edge=noteEndGrabWidth(rect.width,event.pointerType);
      const resize=inst.layout!=="rack"&&event.clientX>=rect.right-edge;
      const mode=resize?"resize":"move";
      const start=note.start,pitch=note.pitch,duration=note.duration;
      const initialWidth=n.style.width;
      const nextValues=({steps,pitches})=>{
       if(mode==="resize")return {duration:Math.max(1,
        Math.min(FREEFORM_LIMIT_STEPS-start,duration+steps))};
       return {
        start:Math.max(0,Math.min(FREEFORM_LIMIT_STEPS-duration,start+steps)),
        ...(pitch!==undefined?{pitch:Math.max(PITCH_MIN,Math.min(PITCH_MAX,pitch+pitches))}:{})
       };
      };
      return {
       mode,
       grab:()=>{ignoreClick=true;},
       preview:delta=>{
        const value=nextValues(delta);
        if(mode==="resize"){
         const newLength=Math.min(value.duration,viewStep()+VIEW_BARS*16-Math.max(start,viewStep()));
         n.style.width=Math.max(3,newLength*STEP_WIDTH)+"px";
        }else n.style.transform="translate("+
         ((value.start-start)*STEP_WIDTH)+"px,"+
         (pitch===undefined?0:(pitch-value.pitch)*ROW_HEIGHT)+"px)";
       },
       finish:({cancelled,grabbed,steps,pitches})=>{
        if(cancelled){
         n.style.transform="";n.style.width=initialWidth;
        }else if(grabbed){
         const values=nextValues({steps,pitches});
         if(Object.entries(values).some(([key,value])=>note[key]!==value)){
          selectedNoteId=note.id;
          changeNote(note.id,values);
         }else{n.style.transform="";n.style.width=initialWidth;}
        }
        if(grabbed||cancelled){
         ignoreClick=true;
         setTimeout(()=>{ignoreClick=false;},0);
        }
       }
      };
     }
    });
    noteRow.append(n);
   }
   bindPianoNoteGesture(noteRow,{
    stepWidth:STEP_WIDTH,rowHeight:ROW_HEIGHT,
    begin:event=>{
     if(event.target!==noteRow)return null;
     const x=event.clientX-noteRow.getBoundingClientRect().left;
     const step=viewStep()+Math.max(0,Math.min(VIEW_BARS*16-1,Math.floor(x/STEP_WIDTH)));
     const ghost=el("span","freeform-paint-preview");
     ghost.style.left=(step-viewStep())*STEP_WIDTH+"px";
     ghost.style.width=STEP_WIDTH+"px";
     noteRow.append(ghost);
     return {
      mode:"paint",
      preview:({steps})=>{
       const length=Math.max(1,Math.min(FREEFORM_LIMIT_STEPS-step,1+steps));
       ghost.style.width=length*STEP_WIDTH+"px";
      },
      finish:({cancelled,steps})=>{
       ghost.remove();
       if(cancelled)return;
       const duration=rowData.pitch===null?1:Math.max(1,
        Math.min(FREEFORM_LIMIT_STEPS-step,1+steps));
       addNoteAt(rowData.pitch,step,duration,rowData.soundId);
      }
     };
    }
   });
   noteRow.addEventListener("keydown",event=>{
    if(event.key!=="Enter"&&event.key!==" ")return;
    event.preventDefault();addNoteAt(rowData.pitch,viewStep(),1,rowData.soundId);
   });
   plot.append(noteRow);
  }
  const timeline=el("div","freeform-roll-content");timeline.append(keyColumn,plot);
  if(inst.layout!=="rack"&&getShowPianoKeys()){
   timeline.classList.add("piano-keyboard");
   const overlay=mountPianoKeyOverlay({
    low:PITCH_MIN,high:PITCH_MAX,rowHeight:ROW_HEIGHT,
    noteLabel:pitchName,onPlay:playKey
   });
   timeline.append(overlay.element);
  }
  const marker=el("div","freeform-playhead");marker.hidden=true;plot.append(marker);
  grid.append(timeline);roll.append(grid);
  const preservedTop=editorScrollTop;
  if(preservedTop!==null)roll.scrollTop=preservedTop;
  else if(inst.layout==="pitched")roll.scrollTop=(PITCH_MAX-72)*ROW_HEIGHT;
  if(editorScrollLeft!==null)roll.scrollLeft=editorScrollLeft;
  const selected=currentNote();renderNoteFields(noteWorkspace,selected);
  keyboardPiano.refresh();paintPosition();
 }
 function renderAttached(track,width){
  const row=el("div","song-freeform-row");
  row.dataset.parentTrackId=track.id;
  const label=el("div","song-freeform-label");
  const tab=action("↳ freeform",()=>open(track.id),"song-freeform-toggle");
  tab.setAttribute("aria-label","open attached freeform editor for "+track.name);
  tab.title="drop a Beat Clip here to make its notes freeform";
  label.append(tab);
  const lane=el("div","song-freeform-lane");lane.style.width=width+"px";
  lane.style.setProperty("--song-bar-px",SONG_BAR_PIXELS+"px");
  lane.addEventListener("click",event=>{
   if(event.target===lane)open(track.id);
  });
  const layer=track.freeform;
  const hasMusic=!!layer&&(layer.passages.length>0||
   layer.instruments.some(inst=>inst.notes.length||inst.chunkPlacements.length));
  row.classList.toggle("expanded",hasMusic);
  row.classList.toggle("dormant",!hasMusic);
  row.classList.toggle("active",activeTrackId===track.id);
  if(layer){
   const passageLimit=Math.min(200,layer.passages.length);
   for(const passage of layer.passages.slice(0,passageLimit)){
    let draggedSincePress=false;
    const box=action("",()=>{
     if(!draggedSincePress)open(track.id,passage.id);
     draggedSincePress=false;
    },"song-freeform-passage");
    box.dataset.passageId=passage.id;
    box.style.left=passage.startStep/16*SONG_BAR_PIXELS+"px";
    box.style.width=Math.max(10,passage.lengthSteps/16*SONG_BAR_PIXELS)+"px";
    const overlapHint=el("span","song-freeform-layering-hint");
    overlapHint.setAttribute("aria-hidden","true");box.append(overlapHint);
    const describe=(position,scan=true)=>{
     const note=scan?previewFreeformPassageLayering(layer,passage.id,position,{
      beatClips:track.clips,maxEvents:4000,maxPairs:15000
     }):{noteOverlapCount:0,beatClipOverlapCount:track.clips.filter(clip=>
      clip.startStep<position+passage.lengthSteps&&clip.startStep+clip.lengthSteps>position
     ).length,examples:[],incomplete:false};
     const labels=[];
     if(note.noteOverlapCount)labels.push(note.noteOverlapCount+" same-pitch/Sound overlap"+
      (note.noteOverlapCount===1?"":"s")+"; both notes will sound");
     if(note.beatClipOverlapCount)labels.push("under "+note.beatClipOverlapCount+
      " linked Beat Clip"+(note.beatClipOverlapCount===1?"":"s")+"; layers may play together");
     if(note.incomplete)labels.push("dense passage: overlap scan incomplete");
     box.classList.toggle("song-freeform-layered",!!note.beatClipOverlapCount);
     box.classList.toggle("song-freeform-note-overlap",!!note.noteOverlapCount);
     box.classList.toggle("song-freeform-scan-incomplete",!!note.incomplete);
     overlapHint.textContent=note.incomplete?"scan":note.noteOverlapCount?
      "≈ "+note.noteOverlapCount:note.beatClipOverlapCount?"＋ beat":"";
     const positionLabel="freeform · bar "+(Math.floor(position/16)+1);
     const info=labels.length?labels.join("; "):
      "no matching note overlaps detected";
     box.title=positionLabel+". "+info+". Drag to move; Alt+arrow moves one bar, Shift+Alt+arrow one step.";
     box.setAttribute("aria-label",box.title);
    };
    describe(passage.startStep,false);
    box.addEventListener("pointerenter",()=>describe(passage.startStep));
    box.addEventListener("focus",()=>describe(passage.startStep));
    const clampPosition=next=>Math.max(0,Math.min(
     FREEFORM_LIMIT_STEPS-passage.lengthSteps,next));
    box.addEventListener("keydown",event=>{
     if(!event.altKey||!["ArrowLeft","ArrowRight"].includes(event.key))return;
     event.preventDefault();event.stopPropagation();
     const delta=(event.key==="ArrowRight"?1:-1)*(event.shiftKey?1:16);
     const next=clampPosition(passage.startStep+delta);
     if(next===passage.startStep)return;
     mutate(()=>moveFreeformPassage(layer,passage.id,next));
     const replacement=[...root.querySelectorAll(".song-freeform-passage")]
      .find(item=>item.dataset.passageId===passage.id);
     replacement?.focus();
    });
    box.addEventListener("pointerdown",event=>{
     if(event.button!==0)return;
     const firstX=event.clientX,old=passage.startStep;
     draggedSincePress=false;
     let moved=false,lastPreview=old;
     box.setPointerCapture(event.pointerId);
     const drag=e=>{if(e.pointerId!==event.pointerId)return;
      if(Math.abs(e.clientX-firstX)>4){moved=true;draggedSincePress=true;}
      if(!moved)return;
      const proposed=clampPosition(old+
       Math.round((e.clientX-firstX)/SONG_BAR_PIXELS)*16);
      box.style.transform="translateX("+((proposed-old)/16*SONG_BAR_PIXELS)+"px)";
      if(proposed!==lastPreview){lastPreview=proposed;describe(proposed);}
     };
     const finish=e=>{if(e.pointerId!==event.pointerId)return;
      box.removeEventListener("pointermove",drag);box.removeEventListener("pointerup",finish);
      box.removeEventListener("pointercancel",finish);
      if(moved&&e.type==="pointerup"){
       const next=clampPosition(old+
        Math.round((e.clientX-firstX)/SONG_BAR_PIXELS)*16);
       mutate(()=>moveFreeformPassage(layer,passage.id,next));
      }else if(moved)render();
     };
     box.addEventListener("pointermove",drag);box.addEventListener("pointerup",finish);
     box.addEventListener("pointercancel",finish);
    });
    lane.append(box);
   }
   layer.instruments.forEach((inst,index)=>{
    for(const note of inst.notes.slice(0,2500)){
     const x=note.start/16*SONG_BAR_PIXELS;
     if(x>width||x+note.duration/16*SONG_BAR_PIXELS<0)continue;
     const marker=el("span","song-freeform-preview-note");
     marker.style.left=x+"px";marker.style.top=(7+index%3*9)+"px";
     marker.style.width=Math.max(2,note.duration/16*SONG_BAR_PIXELS)+"px";
     marker.title=inst.name+" · bar "+(Math.floor(note.start/16)+1);
     lane.append(marker);
    }
   });
  }
  row.append(label,lane);
  return row;
 }
 return {renderAttached,render,open,close,getActiveTrackId:()=>activeTrackId,
  focusInstrument(trackId,instrumentId,soundId=null){
   if(activeTrackId!==trackId)return;
   if(!layer()?.instruments.some(inst=>inst.id===instrumentId))return;
   activeInstrumentId=instrumentId;selectedNoteId=null;selectedPlacementId=null;
   if(soundId)soundUI.selectSound(instrumentId,soundId);
   render();
  },
  seekToStep(step){
   if(activeTrackId===null)return;
   const next=Math.max(0,Math.floor(step/BAR_STEPS));
   if(next!==barStart){
    barStart=next;editorScrollLeft=0;render();
   }
   playStep=step;
   paintPosition();
  },
  setPosition(bar){
   playStep=bar<0?null:bar*BAR_STEPS;
   if(activeTrackId&&playStep!==null&&
    (playStep<viewStep()||playStep>=viewStep()+VIEW_BARS*BAR_STEPS)){
    barStart=Math.max(0,Math.floor(playStep/BAR_STEPS));
    editorScrollLeft=0;render();
   }
   paintPosition();
  }};
}
