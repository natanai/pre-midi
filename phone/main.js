// Dedicated touch-first phone host. No desktop DOM or desktop CSS imports.
import {create,parse,validate} from "../schema.js";
import {parseSong,exportSongProject,importSongProject} from "../songIO.js";
import {createStudioSession} from "../studioSession.js";
import {loadDraft,saveDraft} from "../storage.js";
import {exportProject,importProject} from "../packageIO.js";
import {play,audition,wav} from "../audio.js";
import {SCALE_ROOTS,SCALE_MODES,normalizeScaleGuide,isPitchInScaleAtStep} from "../scaleGuide.js";
import {clampZoom,navigationAnchor,nextNavigation,noteDragSteps} from "./gestures/roll.js";
import {phonePlayheadX} from "./rollPlayback.js";
import {renderPhoneSound} from "./views/sound.js";
import {renderPhoneCatalog,factorySpec,resolveFactoryAssets,previewFactoryPreset} from "./views/catalog.js";
import {renderPhoneSong} from "./views/song.js";

const $=id=>document.getElementById(id);
const MIN_PITCH=36,MAX_PITCH=96,ROW=36;
const NOTE_NAMES=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const CACHE="premidi-scale-guide-v1";
let session=null,selectedNoteId=null,gesture=null,playing=null,pendingPlay=false,playbackPosition=null,playbackScope="beat";
let activeWorkspace="notes",zoom=42,editGeneration=0,panMode=false,navigation=null;
let activeSoundId=null,catalogMode="add",catalogCategory="All";
const contacts=new Map();
let lastPointerCell=null,lastPointerAt=0,lastNavigationAt=-Infinity;
const cellMap=new Map();
const status=(label,error=false)=>{$("status").value=label;$("status").dataset.error=String(error);};
function nameOf(pitch){return NOTE_NAMES[pitch%12]+(Math.floor(pitch/12)-1);}
function parseDraft(raw){
 if(!raw)return null;
 const value=JSON.parse(raw);
 return value.kind==="song"?parseSong(raw):parse(raw);
}
function guide(){
 const beat=session.getBeat();
 try{
  const all=JSON.parse(localStorage.getItem(CACHE)||"{}");
  return normalizeScaleGuide(all[beat.id]||{});
 }catch{return normalizeScaleGuide({});}
}
function setGuide(value){
 const current=session.getBeat(),next=normalizeScaleGuide({...guide(),...value});
 try{
  const stored=JSON.parse(localStorage.getItem(CACHE)||"{}");
  stored[current.id]=next;
  localStorage.setItem(CACHE,JSON.stringify(stored));
 }catch{status("scale preference is not saved",true);}
 renderScale();paintCells();
}
function onCommit(doc){
 const generation=++editGeneration;
 status("saving locally…");
 void saveDraft(doc).then(()=>{
  if(generation===editGeneration)status("saved locally · export a backup for safekeeping");
 }).catch(error=>status("could not save locally · export a backup: "+error.message,true));
}
function initialize(doc){
 session=createStudioSession(doc,onCommit);
 selectedNoteId=null;
 $("project-name").textContent=doc.title;
 render();
 status("local draft ready · export a backup when you want to keep it");
}
function refreshSelection(){
 const selected=session.getChunk().notes.find(note=>note.id===selectedNoteId);
 if(!selected)selectedNoteId=null;
 $("delete-note").disabled=!selected;
 $("undo").disabled=!session.canUndo();
 $("redo").disabled=!session.canRedo();
}
function renderScale(){
 const current=guide(),root=$("scale-root"),mode=$("scale-mode"),lock=$("scale-lock");
 root.value=String(current.root);mode.value=current.mode;
 lock.checked=current.lock;lock.disabled=current.mode==="chromatic";
 $("scale-summary").textContent="scale · "+SCALE_ROOTS[current.root]+" "+(SCALE_MODES.find(mode=>mode.id===current.mode)?.name||current.mode)+(current.lock?" · limited":"");
}
function renderContext(){
 const beat=session.getBeat(),inst=session.getInstrument();
 $("project-name").textContent=activeWorkspace==="song"&&session.getDocument().kind==="song"?session.getDocument().title:beat.title;
 $("instrument-picker").firstChild.textContent=inst.name+" ";
 const chunk=$("chunk-picker");chunk.replaceChildren();
 for(const choice of inst.chunks){
  const option=document.createElement("option");
  option.value=choice.id;option.textContent=choice.name;
  chunk.append(option);
 }
 chunk.value=session.getChunk().id;
 $("bpm").value=String(activeWorkspace==="song"&&session.getDocument().kind==="song"?session.getDocument().bpm:beat.bpm);
 renderScale();refreshSelection();
}
function rowModels(){
 const inst=session.getInstrument();
 return inst.layout==="rack"
  ?inst.sounds.map((sound,index)=>({key:sound.id,label:sound.name,kind:"rack",pitch:null,order:index}))
  :Array.from({length:MAX_PITCH-MIN_PITCH+1},(_,index)=>{
   const pitch=MAX_PITCH-index;
   return {key:String(pitch),label:nameOf(pitch),kind:"pitch",pitch,order:index};
  });
}
function noteAt(row,step){
 const notes=session.getChunk().notes;
 return row.kind==="rack"
  ?notes.find(note=>note.soundId===row.key&&note.start===step)
  :notes.find(note=>note.pitch===row.pitch&&step>=note.start&&step<note.start+note.duration);
}
function allowed(row,step){
 if(row.kind==="rack")return true;
 const current=guide();
 return !current.lock||isPitchInScaleAtStep(row.pitch,current,session.getChunk().notes,step);
}
function paintCells(){
 if(!session)return;
 const chunk=session.getChunk(),scale=guide(),rack=session.getInstrument().layout==="rack";
 for(const [key,entry] of cellMap){
  const {cell,row,step}=entry;
  const note=noteAt(row,step),inScale=rack||isPitchInScaleAtStep(row.pitch,scale,chunk.notes,step);
  cell.classList.toggle("filled",!!note&&note.start===step);
  cell.classList.toggle("tail",!!note&&note.start!==step);
  cell.classList.toggle("end",!!note&&note.start+note.duration-1===step);
  cell.classList.toggle("selected",!!note&&note.id===selectedNoteId);
  const canGrip=!rack&&!!note&&note.id===selectedNoteId&&note.start+note.duration-1===step;
  cell.classList.toggle("resize-handle",canGrip);
  cell.classList.toggle("out-of-scale",!inScale&&scale.mode!=="chromatic");
  cell.disabled=!inScale&&scale.lock&&!note;
  cell.setAttribute("aria-label",row.label+", step "+(step+1)+
   (note?", note "+(note.start+1)+" length "+note.duration+", select to edit":"; place note")+
   (cell.disabled?", outside selected scale":""));
  cell.title=canGrip?"drag ↔ to change note length":note?"tap to select · drag to move":"tap to place · drag to extend";
  if(canGrip)cell.setAttribute("aria-label",row.label+", selected note, length "+note.duration+" steps; drag the marked right edge to resize");
 }
 refreshSelection();
}
function renderGrid(preserveScroll=true){
 const viewport=$("roll-scroll"),oldTop=viewport.scrollTop,oldLeft=viewport.scrollLeft;
 const grid=$("piano-grid");grid.replaceChildren();cellMap.clear();
 const ruler=document.createElement("div");ruler.className="ruler";
 const corner=document.createElement("div");corner.className="pitch-column";ruler.append(corner);
 for(let step=0;step<16;step++){
  const element=document.createElement("span");
  element.className="step-label"+(step%4===0?" beat":"");
  element.textContent=step%4===0?String(step/4+1):"·";
  ruler.append(element);
 }
 grid.append(ruler);
 const playhead=document.createElement("div");
 playhead.id="roll-playhead";playhead.className="roll-playhead";
 playhead.setAttribute("aria-hidden","true");
 grid.append(playhead);
 for(const row of rowModels()){
  const line=document.createElement("div");line.className="piano-row";
  const key=document.createElement("button");
  key.type="button";key.className="piano-key"+(row.pitch!==null&&[1,3,6,8,10].includes(row.pitch%12)?" black":"")+(row.pitch!==null&&row.pitch%12===0?" c":"");
  key.textContent=row.label;key.setAttribute("aria-label",row.kind==="rack"?"Preview "+row.label:"Play "+row.label);
  key.addEventListener("click",()=>{key.classList.add("pressed");setTimeout(()=>key.classList.remove("pressed"),180);void hear(row);});
  line.append(key);
  for(let step=0;step<16;step++){
   const cell=document.createElement("button");cell.type="button";
   cell.className="cell"+(step%4===0?" beat":"")+(row.pitch!==null&&[0,2,4,5,7,9,11].includes(row.pitch%12)?" white-row":"");
   cell.dataset.row=row.key;cell.dataset.step=String(step);
   // Keyboard and assistive activation do not synthesize Pointer Events.
   cell.addEventListener("click",event=>{
    if(event.detail!==0||gesture||navigation)return;
    if((lastPointerCell===cell&&performance.now()-lastPointerAt<420)||performance.now()-lastNavigationAt<420)return;
    activateCell(row,step);
   });
   cellMap.set(row.key+"|"+step,{cell,row,step});
   line.append(cell);
  }
  grid.append(line);
 }
 paintCells();
 updatePlayhead();
 viewport.scrollLeft=oldLeft;
 if(preserveScroll)viewport.scrollTop=oldTop;
 else if(session.getInstrument().layout!=="rack")viewport.scrollTop=(MAX_PITCH-72)*ROW;
}
async function hear(row,velocity=.9){
 if(!session)return;
 const inst=session.getInstrument();
 try{
  await audition(inst,row.kind==="rack"?inst.sounds.find(item=>item.id===row.key)?.referencePitch:row.pitch,
   session.getBeat(),row.kind==="rack"?{soundId:row.key,velocity}:{velocity});
 }catch(error){status("could not preview note: "+error.message,true);}
}
function activateCell(row,step){
 if(!session||gesture)return;
 const present=noteAt(row,step);
 if(present){selectedNoteId=present.id;paintCells();return;}
 if(!allowed(row,step))return;
 const note={start:step,duration:1,velocity:.9,
  ...(row.kind==="rack"?{soundId:row.key}:{pitch:row.pitch})};
 const result=session.dispatch({type:"note.add",note});
 if(result.changed){
  selectedNoteId=result.noteId;
  paintCells();void hear(row);
 }
}
function currentRect(){
 const viewport=$("roll-scroll"),rect=viewport.getBoundingClientRect();
 return {left:rect.left,top:rect.top,scrollLeft:viewport.scrollLeft,
  scrollTop:viewport.scrollTop,zoom};
}
function cancelNoteGesture(keepCapture=false){
 const active=gesture;
 gesture=null;
 if(!active)return;
 if(!keepCapture)try{if(active.target.hasPointerCapture?.(active.id))active.target.releasePointerCapture(active.id);}catch{}
 session.finishPreview(true);
 selectedNoteId=active.previousSelected;
 paintCells();
}
function cancelActiveGesture(){
 cancelNoteGesture();
 navigation=null;
 contacts.clear();
}
function resetNavigation(){
 if(!contacts.size){navigation=null;return;}
 navigation=navigationAnchor(contacts,currentRect());
}
function scrollRoll(change){
 const viewport=$("roll-scroll");
 viewport.scrollBy({...change,behavior:"smooth"});
}
function setPanMode(enabled){
 cancelActiveGesture();
 panMode=enabled;
 const button=$("pan-mode");
 button.setAttribute("aria-pressed",String(panMode));
 button.textContent=panMode?"pan on":"pan";
 $("piano-grid").classList.toggle("navigation-mode",panMode);
}
function startTouch(event){
 if(!session||event.button!==0)return;
 const cell=event.target.closest?.(".cell");
 const belongs=cell&&$("piano-grid").contains(cell);
 // A second non-primary Safari touch must cancel the tentative first note
 // before either finger is allowed to pan/pinch the timeline.
 if(!belongs&&!navigation)return;
 if(contacts.has(event.pointerId))return;
 contacts.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(contacts.size>1||navigation||panMode){
  if(gesture)cancelNoteGesture(true);
  resetNavigation();
  if(belongs)try{cell.setPointerCapture(event.pointerId);}catch{}
  if(event.cancelable)event.preventDefault();
  return;
 }
 if(gesture||!belongs)return;
 const entry=cellMap.get(cell.dataset.row+"|"+cell.dataset.step);
 if(!entry){contacts.delete(event.pointerId);return;}
 const {row,step}=entry,found=noteAt(row,step),rect=cell.getBoundingClientRect();
 if(!found&&!allowed(row,step)){contacts.delete(event.pointerId);return;}
 const end=found&&step===found.start+found.duration-1&&
  event.clientX>=rect.right-Math.min(24,rect.width*.55);
 const mode=found?(end&&row.kind!=="rack"?"resize":"move"):"paint";
 const previousSelected=selectedNoteId;
 session.beginPreview();
 let note=found;
 if(!found){
  const result=session.applyPreview({type:"note.add",note:{
   start:step,duration:1,velocity:.9,...(row.kind==="rack"?{soundId:row.key}:{pitch:row.pitch})
  }});
  if(!result.changed){session.finishPreview(true);contacts.delete(event.pointerId);return;}
  note=result.note;
  void hear(row);
 }
 selectedNoteId=note.id;
 gesture={id:event.pointerId,target:cell,row,mode,noteId:note.id,previousSelected,
  original:{start:note.start,pitch:note.pitch,duration:note.duration},
  x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,
  moved:false,wasNew:!found};
 try{cell.setPointerCapture(event.pointerId);}catch{}
 paintCells();
 if(event.cancelable)event.preventDefault();
}
function moveTouch(event){
 if(!contacts.has(event.pointerId))return;
 contacts.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(navigation){
  const next=nextNavigation(navigation,contacts,currentRect());
  if(next){
   setZoom(next.zoom);
   const viewport=$("roll-scroll");
   viewport.scrollLeft=next.scrollLeft;
   viewport.scrollTop=next.scrollTop;
  }
  if(event.cancelable)event.preventDefault();
  return;
 }
 const g=gesture;if(!g||g.id!==event.pointerId)return;
 const dx=event.clientX-g.x,dy=event.clientY-g.y;
 if(Math.hypot(dx,dy)>7)g.moved=true;
 if(!g.moved)return;
 if(event.cancelable)event.preventDefault();
 const steps=noteDragSteps(dx,g.width);
 if((g.mode==="paint"&&g.row.kind!=="rack")||g.mode==="resize"){
  const requested=g.mode==="paint"?1+Math.max(0,steps):g.original.duration+steps;
  session.applyPreview({type:"note.resize",noteId:g.noteId,duration:requested});
 }else if(g.mode==="move"){
  session.applyPreview({type:"note.move",noteId:g.noteId,
   start:g.original.start+steps,
   ...(g.row.kind==="rack"?{}:{pitch:g.original.pitch-noteDragSteps(dy,g.height)})});
 }
 paintCells();
}
function endTouch(event){
 if(!contacts.has(event.pointerId)&&gesture?.id!==event.pointerId)return;
 if(event.type==="pointerup"&&gesture?.id===event.pointerId)moveTouch(event);
 const g=gesture,wasNavigating=!!navigation;
 if(g&&g.id===event.pointerId){
  gesture=null;
  try{
   const cancelled=event.type!=="pointerup";
   session.finishPreview(cancelled||(!g.wasNew&&!g.moved));
   if(cancelled)selectedNoteId=g.previousSelected;
  }catch(error){
   status("edit failed: "+error.message,true);
  }
  lastPointerCell=g.target;
  lastPointerAt=performance.now();
  paintCells();
 }
 contacts.delete(event.pointerId);
 if(wasNavigating){
  lastNavigationAt=performance.now();
  if(event.type!=="pointerup"){navigation=null;contacts.clear();}
  else resetNavigation();
 }
}
function updatePlayhead(){
 const line=$("roll-playhead");
 if(!line||!session)return;
 const position=playbackPosition,selection=session.getSelection();
 const x=position?phonePlayheadX(session.getBeat(),selection.instrumentId,selection.chunkId,position,zoom):null;
 line.hidden=x===null;
 line.setAttribute("aria-hidden",String(x===null));
 if(x!==null)line.style.left=x+"px";
}
function render(preserveScroll=false){
 if(!session)return;
 renderContext();renderGrid(preserveScroll);
 if(activeWorkspace==="sound")paintSound();
 if(activeWorkspace==="song")paintSong();
}
function openCatalog(mode){
 cancelActiveGesture();
 catalogMode=mode;catalogCategory="All";
 if($("instruments-dialog").open)$("instruments-dialog").close();
 $("catalog-context").textContent=mode==="add"?"add a new Instrument or Rack":
  mode==="replace-row"?"replace the selected Rack row":"replace the current sound or choose a Rack";
 paintCatalog();
 $("catalog-dialog").showModal();
}
function paintCatalog(){
 renderPhoneCatalog({
  filters:$("catalog-filters"),list:$("catalog-sounds"),
  category:catalogCategory,mode:catalogMode,beat:session.getBeat(),
  onCategory:name=>{catalogCategory=name;paintCatalog();},
  onUse:async(preset,button)=>{
   button.disabled=true;
   status("loading "+preset.name+"…");
   try{
    const assets=await resolveFactoryAssets(preset,session.getBeat());
    const selected=session.getInstrument();
    const result=session.selectCatalogSound({...factorySpec(preset),assets,mode:catalogMode,
     soundId:selected.layout==="rack"?activeSoundId||selected.sounds[0].id:selected.sounds[0].id});
    if(!result){status("instrument limit reached or sound could not be added",true);button.disabled=false;return;}
    activeSoundId=null;selectedNoteId=null;
    $("catalog-dialog").close();
    render();
    status("loaded "+preset.name+" · saved locally");
   }catch(error){status("could not load "+preset.name+": "+error.message,true);button.disabled=false;}
  },
  onPreview:async(preset,button)=>{
   button.disabled=true;
   try{
    const step=await previewFactoryPreset(preset,session.getBeat());
    if(step)button.textContent="▶ "+step;
   }catch(error){status("preview error: "+error.message,true);}
   finally{button.disabled=false;}
  }
 });
}
function paintSong(){
 if(!session)return;
 const call=action=>()=>{
  try{
   const changed=action();
   if(changed){paintSong();renderContext();}
  }catch(error){status("song edit rejected: "+error.message,true);paintSong();}
 };
 renderPhoneSong($("phone-song-content"),{
  session,
  onCreateSong:call(()=>session.convertBeatToSong()),
  onAddBeat:call(()=>session.addSongBeat()),
  onAddTrack:kind=>call(()=>session.addTrack(kind))(),
  onAddClip:(trackId,beatId)=>call(()=>session.appendSongClip(trackId,beatId,
   Math.max(0,...session.getDocument().tracks.find(track=>track.id===trackId).clips.map(clip=>clip.startStep+clip.lengthSteps))))(),
  onEditClip:(clipId,changes)=>call(()=>session.changeSongClip(clipId,changes))(),
  onRemoveClip:clipId=>call(()=>session.removeSongClip(clipId))(),
  onRenameTrack:(trackId,name)=>call(()=>session.renameTrack(trackId,name))(),
  onRenameSong:name=>call(()=>session.renameSong(name))(),
  onSelectBeat:beatId=>{if(session.selectBeat(beatId)){selectedNoteId=null;renderContext();renderGrid(true);paintSong();}},
  onEditBeat:()=>document.querySelector('[data-workspace="notes"]').click(),
  onError:message=>status(message,true)
 });
 updateSongPlayhead();
}
function updateSongPlayhead(){
 const line=$("phone-song-playhead");
 if(!line)return;
 const current=playbackScope==="song"?playbackPosition:null;
 line.hidden=current===null;
 if(current)line.style.left=(current.bar*16+current.step)*3+"px";
}
function paintSound(){
 if(!session)return;
 const container=$("phone-sound-content"),viewport=$("view-sound"),scrolled=viewport.scrollTop;
 const callbacks={
  session,selectedSoundId:activeSoundId,
  onSelectSound:(soundId)=>{activeSoundId=soundId;paintSound();},
  onPatchChange(soundId,path,value){
   try{
    if(session.changeSoundPatch(soundId,path,value))paintSound();
   }catch(error){status("sound change rejected: "+error.message,true);paintSound();}
  },
  onLevelChange(kind,value,soundId){
   try{
    const changed=kind==="instrument"?session.changeInstrumentVolume(value):session.changeSoundGain(soundId,value);
    if(changed)paintSound();
   }catch(error){status("volume change rejected: "+error.message,true);paintSound();}
  },
  onBrowse:mode=>openCatalog(mode),
  onNameChange(value){
   try{if(session.renameInstrument(value)){renderContext();paintSound();}}
   catch(error){status("rename rejected: "+error.message,true);paintSound();}
  },
  onPreview(soundId){
   const inst=session.getInstrument(),row=inst.sounds.find(sound=>sound.id===soundId)||inst.sounds[0];
   void audition(inst,row.referencePitch,session.getBeat(),{soundId:row.id,velocity:.9,duration:.45})
    .catch(error=>status("preview error: "+error.message,true));
  },
  onError:message=>status(message,true)
 };
 const result=renderPhoneSound(container,callbacks);
 activeSoundId=result.soundId;
 viewport.scrollTop=scrolled;
}
function download(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;a.style.display="none";document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function exportCurrent(scope="beat"){
 try{
  const doc=scope==="song"?session.getDocument():session.getBeat();
  const result=scope==="song"?exportSongProject(doc):exportProject(doc);
  download(result.blob,result.name);status("exported "+result.name);
  $("project-dialog").close();
 }catch(error){status("export failed: "+error.message,true);}
}
function initializeControls(){
 for(const [index,name] of SCALE_ROOTS.entries()){
  const option=document.createElement("option");option.value=String(index);option.textContent=name;
  $("scale-root").append(option);
 }
 for(const choice of SCALE_MODES){
  const option=document.createElement("option");option.value=choice.id;option.textContent=choice.name;
  $("scale-mode").append(option);
 }
 $("scale-root").addEventListener("change",event=>setGuide({root:Number(event.target.value)}));
 $("scale-mode").addEventListener("change",event=>setGuide({mode:event.target.value}));
 $("scale-lock").addEventListener("change",event=>setGuide({lock:event.target.checked}));
 $("instrument-picker").addEventListener("click",()=>{
  cancelActiveGesture();
  const root=$("instrument-options");root.replaceChildren();
  const beat=session.getBeat();
  for(const inst of beat.instruments){
   const btn=document.createElement("button");
   btn.type="button";btn.textContent=inst.name;
   btn.setAttribute("aria-pressed",String(inst.id===session.getInstrument().id));
   btn.addEventListener("click",()=>{
    cancelActiveGesture();session.selectInstrument(inst.id);selectedNoteId=null;
    $("instruments-dialog").close();render();
   });
   root.append(btn);
  }
  $("add-instrument").disabled=beat.instruments.length>=12;
  $("instruments-dialog").showModal();
 });
 $("instruments-close").addEventListener("click",()=>$("instruments-dialog").close());
 $("add-instrument").addEventListener("click",()=>openCatalog("add"));
 $("browse-sounds").addEventListener("click",()=>openCatalog("replace"));
 $("catalog-close").addEventListener("click",()=>$("catalog-dialog").close());
 $("chunk-picker").addEventListener("change",event=>{
  cancelActiveGesture();session.selectChunk(event.target.value);selectedNoteId=null;renderGrid(true);
 });
 const viewport=$("roll-scroll");
 viewport.addEventListener("pointerdown",startTouch);
 viewport.addEventListener("pointermove",moveTouch);
 viewport.addEventListener("pointerup",endTouch);
 viewport.addEventListener("pointercancel",endTouch);
 viewport.addEventListener("lostpointercapture",endTouch);
 $("pan-mode").addEventListener("click",()=>setPanMode(!panMode));
 $("delete-note").addEventListener("click",()=>{
  cancelActiveGesture();if(!selectedNoteId)return;
  session.dispatch({type:"note.delete",noteId:selectedNoteId});
  selectedNoteId=null;paintCells();
 });
 $("undo").addEventListener("click",()=>{cancelActiveGesture();if(session.undo()){selectedNoteId=null;render(true);}});
 $("redo").addEventListener("click",()=>{cancelActiveGesture();if(session.redo()){selectedNoteId=null;render(true);}});
 $("zoom-in").addEventListener("click",()=>zoomAroundCenter(zoom+8));
 $("zoom-out").addEventListener("click",()=>zoomAroundCenter(zoom-8));
 $("pitch-up").addEventListener("click",()=>scrollRoll({top:-ROW*12}));
 $("pitch-down").addEventListener("click",()=>scrollRoll({top:ROW*12}));
 $("time-left").addEventListener("click",()=>scrollRoll({left:-zoom*4}));
 $("time-right").addEventListener("click",()=>scrollRoll({left:zoom*4}));
 $("play").addEventListener("click",()=>void togglePlayback());
 $("bpm").addEventListener("change",event=>{
  const next=Number(event.target.value);
  const changed=activeWorkspace==="song"&&session.getDocument().kind==="song"?
   session.setSongBpm(next):session.setBpm(next);
  if(!changed){event.target.value=String(activeWorkspace==="song"&&session.getDocument().kind==="song"?session.getDocument().bpm:session.getBeat().bpm);return;}
  renderContext();
 });
 $("project-actions").addEventListener("click",()=>{
  cancelActiveGesture();
  $("export-song").hidden=session.getDocument().kind!=="song";
  $("project-dialog").showModal();
 });
 $("project-close").addEventListener("click",()=>$("project-dialog").close());
 $("new-beat").addEventListener("click",()=>{
  if(!confirm("Start a new Beat? Export a backup first to keep this project."))return;
  cancelActiveGesture();stopPlayback();session.replace(create());selectedNoteId=null;render();$("project-dialog").close();
 });
 $("open-beat").addEventListener("click",()=>$("open-file").click());
 $("open-file").addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(!confirm("Open "+file.name+"? This replaces the locally saved project.")){event.target.value="";return;}
  try{
   cancelActiveGesture();stopPlayback();
   const next=file.name.toLowerCase().endsWith(".zip")
    ?(await importSongProject(file).catch(()=>importProject(file)))
    :(JSON.parse(await file.text()).kind==="song"?await importSongProject(file):await importProject(file));
   session.replace(next);selectedNoteId=null;render();$("project-dialog").close();
  }catch(error){status("could not open project: "+error.message,true);}
  event.target.value="";
 });
 $("export-beat").addEventListener("click",()=>exportCurrent("beat"));
 $("render-wav").addEventListener("click",async()=>{
  const scope=activeWorkspace==="song"&&session.getDocument().kind==="song"?"song":"beat";
  const doc=scope==="song"?session.getDocument():session.getBeat();
  const button=$("render-wav");button.disabled=true;status("rendering WAV…");
  try{
   const audio=await wav(doc),name=(doc.title||"pre-midi").replace(/[^a-z0-9_-]+/gi,"-")+".wav";
   download(audio,name);$("project-dialog").close();status("rendered "+name);
  }catch(error){status("WAV export error: "+error.message,true);}
  finally{button.disabled=false;}
 });
 $("export-song").addEventListener("click",()=>exportCurrent("song"));
 for(const button of document.querySelectorAll("[data-workspace]"))button.addEventListener("click",()=>{
  cancelActiveGesture();
  activeWorkspace=button.dataset.workspace;
  for(const name of ["notes","sound","song"])$("view-"+name).hidden=name!==activeWorkspace;
  if(activeWorkspace==="sound")paintSound();
  if(activeWorkspace==="song")paintSong();
  renderContext();
  $("play").setAttribute("aria-label",activeWorkspace==="song"&&session.getDocument().kind==="song"?"Play Song":"Play Beat");
  for(const entry of document.querySelectorAll("[data-workspace]"))
   entry.setAttribute("aria-current",entry.dataset.workspace===activeWorkspace?"page":"false");
 });
 document.addEventListener("visibilitychange",()=>{if(document.hidden){cancelActiveGesture();stopPlayback();}});
 window.addEventListener("pagehide",()=>{cancelActiveGesture();stopPlayback();});
}
function setZoom(value){
 zoom=clampZoom(value);
 document.documentElement.style.setProperty("--step",zoom+"px");
 updatePlayhead();
}
function zoomAroundCenter(value){
 const viewport=$("roll-scroll");
 const anchor=(viewport.scrollLeft+viewport.clientWidth/2-62)/zoom;
 setZoom(value);
 viewport.scrollLeft=Math.max(0,62+anchor*zoom-viewport.clientWidth/2);
}
function stopPlayback(){
 if(playing){playing.stop();playing=null;}
 playbackPosition=null;updatePlayhead();updateSongPlayhead();
 pendingPlay=false;$("play").textContent="▶";$("play").setAttribute("aria-label",activeWorkspace==="song"&&session.getDocument().kind==="song"?"Play Song":"Play Beat");
}
async function togglePlayback(){
 if(playing){stopPlayback();return;}
 if(pendingPlay)return;
 pendingPlay=true;
 try{
  playbackScope=activeWorkspace==="song"&&session.getDocument().kind==="song"?"song":"beat";
 const handle=await play(()=>playbackScope==="song"?session.getDocument():session.getBeat(),{
   loop:()=>$("loop").checked,
   onPosition:(bar,step)=>{$("position").value=(bar+1)+":"+(Math.floor(step/4)+1);},
   onProgress:(bar,step)=>{playbackPosition={bar,step};
    if(playbackScope==="song")updateSongPlayhead();else updatePlayhead();},
   onStop:()=>{playing=null;playbackPosition=null;updatePlayhead();updateSongPlayhead();$("play").textContent="▶";$("play").setAttribute("aria-label","Play Beat");$("position").value="1:1";}
  });
  playing=handle;$("play").textContent="■";$("play").setAttribute("aria-label",playbackScope==="song"?"Stop Song":"Stop Beat");
 }catch(error){status("playback error: "+error.message,true);}
 finally{pendingPlay=false;}
}
initializeControls();
try{
 const saved=await loadDraft().catch(()=>null);
 initialize(saved?parseDraft(saved):create());
}catch(error){
 initialize(create());
 status("could not recover draft: "+error.message+" · export backups are important",true);
}

// Host-only capability: service worker serves code/UI; IndexedDB retains local projects.
// It intentionally does not promise cached sample WAV/OGG files yet.
if("serviceWorker" in navigator){
 navigator.serviceWorker.register("../sw.js",{scope:"../",updateViaCache:"none"})
  .then(()=>navigator.serviceWorker.ready)
  .then(()=>{
   const indicator=$("offline-status");
   if(indicator)indicator.textContent="editor shell cached · sample audio needs network";
  })
  .catch(error=>{
   const indicator=$("offline-status");
   if(indicator)indicator.textContent="offline shell unavailable · "+error.message;
  });
}
