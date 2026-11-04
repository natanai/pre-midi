// Attached freeform Song lane and Song-position piano roll.
// Every mutation passes through the studio's existing Song undo/history boundary.
import {createFreeform,ensureFreeform,addFreeformInstrument,addFreeformNote,
 addFreeformChunkPlacement,moveFreeformPassage,createBeatFromFreeformSelection,soundingFreeformPitches,
 previewFreeformPassageLayering,FREEFORM_LIMIT_STEPS} from "./freeformModel.js";
import {addBeat} from "./songModel.js";
import {makeChunk,id} from "./schema.js";
import {referencedSampleIds} from "./soundModel.js";
import {installFreeformSoundUI} from "./freeformSoundUI.js";

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
export function installFreeformUI({root,getSong,onChange,onError=()=>{},onActiveChange=()=>{},onBeatCreated=()=>{}}){
 const panel=el("section","song-freeform-editor");panel.hidden=true;
 panel.setAttribute("aria-label","Freeform Song notes");
 root.append(panel);
 let activeTrackId=null,activeInstrumentId=null,selectedNoteId=null,barStart=0,playStep=null;
 let selectionStartStep=0,selectionLengthSteps=16,followPlayback=false;
 let editorScrollTop=null,editorScrollLeft=null;

 const track=()=>getSong()?.tracks.find(item=>item.kind==="beat"&&item.id===activeTrackId);
 const layer=()=>track()?.freeform;
 const instrument=()=>layer()?.instruments.find(item=>item.id===activeInstrumentId)||layer()?.instruments[0];
 const currentNote=()=>instrument()?.notes.find(note=>note.id===selectedNoteId);
 function mutate(fn){
  const result=onChange(fn);
  if(result===false)return false;
  render();
  return true;
 }
 const soundUI=installFreeformSoundUI({
  getSong,getLayer:layer,getInstrument:instrument,mutate,onError
 });
 function close(){
  const wasActive=activeTrackId!==null;
  activeTrackId=null;activeInstrumentId=null;selectedNoteId=null;
  panel.hidden=true;panel.replaceChildren();if(wasActive)onActiveChange(false);
 }
 function open(trackId,passageId=null){
  const chosen=getSong()?.tracks.find(item=>item.kind==="beat"&&item.id===trackId);
  if(!chosen)return;
  if(!chosen.freeform&&!mutate(()=>ensureFreeform(chosen)))return;
  activeTrackId=chosen.id;
  activeInstrumentId=chosen.freeform?.instruments[0]?.id??null;
  selectedNoteId=null;
  const selectedPassage=chosen.freeform?.passages.find(p=>p.id===passageId);
  const anchor=selectedPassage?.startStep??chosen.freeform?.passages[0]?.startStep??0;
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
  const source=song.beats[0]?.instruments[0]??null;
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
  activeInstrumentId=newId;selectedNoteId=null;render();
 }
 function changeNote(noteId,patch){
  const original=instrument()?.notes.find(note=>note.id===noteId);
  if(!original)return;
  mutate(()=>Object.assign(original,patch));
 }
 function addNoteAt(pitch,step,duration=1,soundId=null){
  const inst=instrument();
  if(!inst)return;
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
  if(picked.some(note=>note.start+note.duration>start+16)){
   onError("A note crosses the bar boundary. Split or shorten it before making a one-bar Chunk.");return;
  }
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
  if(note.cutoffAutomation){
   const movement=el("span","freeform-automation-label",
    "cutoff movement · preserved from source Beat");
   movement.title="This note retains its source Beat cutoff curve and phase, even when moved in the Song.";
   section.append(movement);
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
  const tools=el("div","freeform-editor-tools");
  const free=chosen.freeform;
  const picker=el("select");
  picker.setAttribute("aria-label","Freeform Instrument");
  for(const inst of free.instruments){
   const option=el("option","",inst.name);option.value=inst.id;picker.append(option);
  }
  const inst=instrument();
  if(inst){activeInstrumentId=inst.id;picker.value=inst.id;}
  picker.addEventListener("change",()=>{activeInstrumentId=picker.value;selectedNoteId=null;editorScrollTop=null;render();});
  tools.append(picker,action("+ instrument",addInstrument));
  if(inst){
   const sourceName=input("text",inst.name,undefined,undefined,()=>{});
   sourceName.maxLength=60;sourceName.setAttribute("aria-label","Freeform Instrument name");
   sourceName.addEventListener("change",()=>mutate(()=>{
    inst.name=sourceName.value.trim()||"Instrument";
   }));
   tools.append(sourceName);
  }
  const previous=action("←",()=>{followPlayback=false;barStart=Math.max(0,barStart-4);render();},"freeform-nav");
  const next=action("→",()=>{followPlayback=false;barStart+=4;render();},"freeform-nav");
  const barControl=input("number",barStart+1,1,4096,v=>{
   if(Number.isInteger(v)&&v>=1){followPlayback=false;barStart=v-1;render();}
  });
  barControl.setAttribute("aria-label","First visible Song bar");
  const follow=action("follow",()=>{followPlayback=!followPlayback;render();},"freeform-follow");
  follow.setAttribute("aria-pressed",String(followPlayback));
  follow.title=followPlayback?"follow enabled · manual navigation pauses it":"follow Song playback in the freeform roll";
  tools.append(previous,field("from bar",barControl),next,follow);
  header.append(tools);panel.append(header);
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
  panel.append(selection);
  paintSelectionRange();
  if(!inst){
   panel.append(el("p","freeform-empty","Add an Instrument to draw notes directly into this Song."));
   return;
  }
  panel.append(soundUI.render());
  const chunkControls=el("div","freeform-chunk-tools");
  chunkControls.append(action("make Chunk from this bar",makeChunkAtBar));
  const chunkPicker=el("select");chunkPicker.setAttribute("aria-label","Reusable Chunk");
  for(const chunk of inst.chunks){
   const opt=el("option","",chunk.name);opt.value=chunk.id;chunkPicker.append(opt);
  }
  chunkControls.append(chunkPicker,action("place Chunk",()=>mutate(()=>
   addFreeformChunkPlacement(inst,chunkPicker.value,viewStep()))));
  panel.append(chunkControls);
  const roll=el("div","freeform-roll-scroll");
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
  const instrumentRows=inst.layout==="rack"?
   inst.sounds.map(sound=>({pitch:null,soundId:sound.id,label:sound.name})):
   Array.from({length:PITCH_MAX-PITCH_MIN+1},(_,i)=>({
    pitch:PITCH_MAX-i,soundId:null,label:String(PITCH_MAX-i)
   }));
  const plot=el("div","freeform-plot");plot.style.width=width+"px";
  const keyColumn=el("div","freeform-key-column");
  for(const rowData of instrumentRows){
   const key=el("div","freeform-key",rowData.label);
   if(rowData.pitch!==null)key.dataset.freeformPitch=String(rowData.pitch);
   keyColumn.append(key);
   const noteRow=el("div","freeform-note-row");
   noteRow.style.width=width+"px";noteRow.setAttribute("role","button");
   noteRow.tabIndex=0;
   noteRow.setAttribute("aria-label","Place "+(rowData.pitch!==null?"pitch "+rowData.pitch:rowData.label)+
    " at Song bar "+(barStart+1)+" or a clicked position");
   const rowNotes=inst.notes.filter(note=>rowData.pitch!==null?
    note.pitch===rowData.pitch:note.soundId===rowData.soundId);
   for(const note of rowNotes){
    if(note.start+note.duration<viewStep()||note.start>=viewStep()+VIEW_BARS*16)continue;
    const n=action("",()=>{selectedNoteId=note.id;render();},"freeform-roll-note");
    n.title="note at bar "+(Math.floor(note.start/16)+1)+", step "+(note.start%16+1);
    n.setAttribute("aria-label",n.title+"; select to edit");
    n.classList.toggle("selected",selectedNoteId===note.id);
    n.style.left=Math.max(0,note.start-viewStep())*STEP_WIDTH+"px";
    n.style.width=Math.max(6,Math.min(note.duration*STEP_WIDTH,
     width-Math.max(0,note.start-viewStep())*STEP_WIDTH))+"px";
    n.addEventListener("pointerdown",event=>{
     if(event.button!==0)return;event.stopPropagation();
     const firstX=event.clientX,firstY=event.clientY;
     const oldStart=note.start,oldPitch=note.pitch;
     let moved=false;
     n.setPointerCapture(event.pointerId);
     const drag=e=>{
      if(e.pointerId!==event.pointerId)return;
      const shift=Math.round((e.clientX-firstX)/STEP_WIDTH);
      if(Math.abs(e.clientX-firstX)>4||Math.abs(e.clientY-firstY)>5)moved=true;
      if(moved)n.style.transform="translate("+(shift*STEP_WIDTH)+"px,"+
       (rowData.pitch===null?0:Math.round((e.clientY-firstY)/ROW_HEIGHT)*ROW_HEIGHT)+"px)";
     };
     const finish=e=>{
      if(e.pointerId!==event.pointerId)return;
      n.removeEventListener("pointermove",drag);n.removeEventListener("pointerup",finish);
      n.removeEventListener("pointercancel",cancel);
      if(e.type==="pointerup"&&moved){
       const movedSteps=Math.round((e.clientX-firstX)/STEP_WIDTH);
       const nextPitch=rowData.pitch===null?undefined:oldPitch-Math.round((e.clientY-firstY)/ROW_HEIGHT);
       selectedNoteId=note.id;
       changeNote(note.id,{start:Math.max(0,oldStart+movedSteps),
        ...(nextPitch!==undefined?{pitch:Math.max(36,Math.min(96,nextPitch))}:{})});
      }else if(moved)render();
     };
     const cancel=e=>finish(e);
     n.addEventListener("pointermove",drag);n.addEventListener("pointerup",finish);
     n.addEventListener("pointercancel",cancel);
    });
    noteRow.append(n);
   }
   let pointer=null;
   noteRow.addEventListener("pointerdown",event=>{
    if(event.target!==noteRow||event.button!==0)return;
    const x=event.clientX-noteRow.getBoundingClientRect().left;
    pointer={id:event.pointerId,start:viewStep()+Math.max(0,Math.floor(x/STEP_WIDTH)),last:event.clientX};
    noteRow.setPointerCapture(event.pointerId);
   });
   noteRow.addEventListener("pointermove",event=>{if(pointer?.id===event.pointerId)pointer.last=event.clientX;});
   noteRow.addEventListener("pointerup",event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    const start=pointer.start,end=viewStep()+Math.floor(
     (event.clientX-noteRow.getBoundingClientRect().left)/STEP_WIDTH);
    pointer=null;
    const step=Math.max(0,start),duration=Math.max(1,end-step+1);
    addNoteAt(rowData.pitch,step,Math.min(duration,65536-step),rowData.soundId);
   });
   noteRow.addEventListener("pointercancel",()=>pointer=null);
   noteRow.addEventListener("keydown",event=>{
    if(event.key!=="Enter"&&event.key!==" ")return;
    event.preventDefault();addNoteAt(rowData.pitch,viewStep(),1,rowData.soundId);
   });
   plot.append(noteRow);
  }
  const timeline=el("div","freeform-roll-content");timeline.append(keyColumn,plot);
  const marker=el("div","freeform-playhead");marker.hidden=true;plot.append(marker);
  grid.append(timeline);roll.append(grid);panel.append(roll);
  const preservedTop=editorScrollTop;
  if(preservedTop!==null)roll.scrollTop=preservedTop;
  else if(inst.layout==="pitched")roll.scrollTop=(PITCH_MAX-72)*ROW_HEIGHT;
  if(editorScrollLeft!==null)roll.scrollLeft=editorScrollLeft;
  const selected=currentNote();renderNoteFields(panel,selected);paintPosition();
 }
 function renderAttached(track,width){
  const row=el("div","song-freeform-row");
  row.dataset.parentTrackId=track.id;
  const label=el("div","song-freeform-label");
  label.append(action("↳ freeform",()=>open(track.id),"song-freeform-toggle"));
  const lane=el("div","song-freeform-lane");lane.style.width=width+"px";
  lane.style.setProperty("--song-bar-px",SONG_BAR_PIXELS+"px");
  lane.addEventListener("click",event=>{
   if(event.target===lane)open(track.id);
  });
  const layer=track.freeform;
  row.classList.toggle("expanded",!!layer);
  row.classList.toggle("active",activeTrackId===track.id);
  if(layer){
   const passageLimit=Math.min(200,layer.passages.length);
   for(const passage of layer.passages.slice(0,passageLimit)){
    const box=action("",()=>open(track.id,passage.id),"song-freeform-passage");
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
     let moved=false,lastPreview=old;
     box.setPointerCapture(event.pointerId);
     const drag=e=>{if(e.pointerId!==event.pointerId)return;
      if(Math.abs(e.clientX-firstX)>4)moved=true;
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
  setPosition(bar){
   playStep=bar<0?null:bar*BAR_STEPS;
   if(followPlayback&&activeTrackId&&playStep!==null&&
    (playStep<viewStep()||playStep>=viewStep()+VIEW_BARS*BAR_STEPS)){
    barStart=Math.max(0,Math.floor(playStep/BAR_STEPS)-1);
    render();
   }
   paintPosition();
  }};
}
