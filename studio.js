import {MAX_SOUNDS,referencedSampleIds,selectionOperation,canConvertToRack,convertToRack} from "./soundModel.js";
import {instrumentDeleteLabel,soundDeleteLabel,deleteInstrumentFromScore,deleteSoundFromScore,canMoveRackSoundToPianoRoll,moveRackSoundToPianoRoll} from "./entityActions.js";
import { create, makeInstrument, makeSound, makeChunk, id, clone, parse, validate, filename } from "./schema.js";
import { play, audition, auditionChord, wav, primeSamples } from "./audio.js";
import { resizeNote } from "./noteEditing.js";
import { chunkIsPlaying, pianoScrubberX } from "./pianoPlayhead.js";
import {placementFor,phraseInstances,chunkProgress} from "./arrangement.js";
import { PRESETS, getPreset, makePatch, patchCopy, validatePatch } from "./synth.js";
import { renderPatchEditor } from "./instrumentUI.js";
import { SAMPLE_LIBRARY, makeSamplerPatch } from "./samples.js";
import { loadLibrarySample, makeSampleAsset, MAX_SCORE_BYTES, sampleForNote } from "./sampler.js";
import { sampleAsset } from "./samples.js";
import { renderSamplerEditor } from "./samplerUI.js";
import { loadDraft, saveDraft, savePresetAssets } from "./storage.js";
import { renderNoteExpression } from "./expressionUI.js";
import {createDial} from "./dial.js";
import {createSignalDisplay} from "./soundScope.js";
import {EXAMPLES,buildExample} from "./examples.js";
import {exportProject,importProject} from "./packageIO.js";
import {installMicrophoneRecorder} from "./microphoneUI.js";
import {getAsset} from "./assetRegistry.js";

const $ = key => document.getElementById(key);
const CACHE = "premidi-v5-draft";
const SAVED_SOUNDS = "premidi-user-sounds-v1";
// Retain the previous fallback key. Native v5 drafts and files migrate through
// the same parser, including safe hit conversion and preserved musical events.
const cached=(()=>{try{return parse(localStorage.getItem(CACHE)||"");}catch{return null;}})();
const savedSounds=(()=>{
 try {
  const entries=JSON.parse(localStorage.getItem(SAVED_SOUNDS)||"[]");
  return Array.isArray(entries)?entries.filter(item=>
   item && typeof item.id==="string" && item.id.length<80 &&
   typeof item.name==="string" && item.name.length<=60 && item.name.trim() &&
   (item.sounds ? validRackPreset(item) : validatePatch(item.patch).length===0)).slice(0,100):[];
 }catch{return [];}
})();
function validRackPreset(item){
 const trial=create(),inst=trial.instruments[0];
 inst.layout="rack";inst.sounds=item.sounds;trial.samples=item.samples||[];
 return validate(trial).length===0;
}
let libraryMode="add",libraryCategory="All",libraryContext=null;
const inspectorViewport=window.matchMedia("(min-width:1100px)");
let inspectorState=inspectorViewport.matches?"expanded":"closed";
let loadingExample=false;
let score = cached || create();
let selectedInstrumentId = score.instruments[0].id;
let selectedNoteId = null;
let selectedSounds=new Map();
let editingNoteEffects = false;
let selectedChunks = new Map();
let selectedSlot = { instrumentId: selectedInstrumentId, bar: 0 };
let history = [], future = [], playback = null, pendingPlay = false;
let soundPreviewTimer=null;
let playBar = -1, playStep = -1, pianoProgress = null, picker = null, pickerTrigger = null;
const SIGNALS = ["#08e4ec", "#ff416d", "#ba82eb", "#ffc266"];

// Audio assets are immutable blobs. Undo stores only mutable score structure
// plus a shallow list of shared samples, not 100 copies of multi-MB recordings.
const snapshot = document => {
 const {samples,...mutable}=document;
 return {...clone(mutable),samples:[...samples]};
};
const instrument = () => score.instruments.find(entry => entry.id === selectedInstrumentId) || score.instruments[0];
const sound = (inst=instrument()) => inst.sounds.find(entry=>entry.id===selectedSounds.get(inst.id))||inst.sounds[0];
const chunkFor = (inst) => inst.chunks.find(entry => entry.id === selectedChunks.get(inst.id)) || inst.chunks[0];
const signal = inst => SIGNALS[Math.max(0, score.instruments.findIndex(entry => entry.id === inst.id)) % SIGNALS.length];

function element(tag, label, cls) {
 const el = document.createElement(tag);
 if (label !== undefined) el.textContent = label;
 if (cls) el.className = cls;
 return el;
}
function button(label, action, cls) {
 const el = element("button", label, cls);
 el.type = "button";
 el.addEventListener("click", action);
 return el;
}
function actionMenu(label,actions,kind=""){
 const menu=element("details",undefined,"entity-actions "+kind);
 const toggle=element("summary","⋯");
 toggle.setAttribute("aria-label",label);
 toggle.title=label;
 const options=element("div",undefined,"entity-action-list");
 for(const action of actions){
  const control=button(action.label,()=>{menu.open=false;action.run();},
   action.danger?"danger":"");
  control.disabled=!!action.disabled;
  options.append(control);
 }
 menu.append(toggle,options);
 return menu;
}
function renameInstrument(inst){
 closePicker();focus(inst);setInspector("expanded");
 $("instrument-name").focus();$("instrument-name").select();
}
function renameRackSound(inst,entry){
 closePicker();focus(inst);selectSound(entry);setInspector("expanded");
 $("sound-name").focus();$("sound-name").select();
}
document.addEventListener("pointerdown",event=>{
 const current=event.target.closest?.(".entity-actions");
 for(const menu of document.querySelectorAll(".entity-actions[open]"))
  if(menu!==current)menu.open=false;
},true);
function message(text, error = false) {
 $("status").textContent = text;
 $("status").className = error ? "error" : "ok";
}
let saveGeneration=0;
function store() {
 const current=score,generation=++saveGeneration;
 message("Saving locally…");
 void saveDraft(current).then(()=>{if(generation===saveGeneration)message("Saved locally");}).catch(()=>{
  if(generation!==saveGeneration)return;
  // For constrained private-browser modes, small synth-only scores still fit.
  try {
   const json=JSON.stringify(current);
   if(current.samples.length||json.length>800000)throw Error("large or sampled draft");
   localStorage.setItem(CACHE,json);
   message("Saved locally (limited browser storage)");
  }catch{message("Browser storage unavailable. Export .premidi to save your work.",true);}
 });
}
function closePicker() {
 if (picker) picker.remove();
 if (pickerTrigger?.isConnected) pickerTrigger.setAttribute("aria-expanded", "false");
 picker = null;
 pickerTrigger = null;
}
function stop() {
 if (playback) playback.stop();
 playback = null;
 pendingPlay = false;
 playBar = playStep = -1;
 pianoProgress = null;
 $("play").textContent = "▶ Play";
 $("position").textContent = "1.1";
 paintPlayhead();
}
function modify(change) {
 const before = snapshot(score);
 change();
 const referenced=referencedSampleIds(score.instruments);
 score.samples=score.samples.filter(asset=>referenced.has(asset.id));
 const errors = validate(score);
 if (errors.length) {
  score = before;
  repairSelection();render();
  message(errors[0], true);
  return false;
 }
 history.push(before);
 if (history.length > 100) history.shift();
 future = [];
 store();
 render();
 return true;
}
function resetTo(next) {
 closePicker();
 stop();
 score = next;
 selectedNoteId=null;
 editingNoteEffects=false;
 selectedInstrumentId = score.instruments[0].id;
 selectedChunks = new Map();
 selectedSlot = { instrumentId: selectedInstrumentId, bar: 0 };
 history = [];
 future = [];
 store();
 render();
}
function undo() {
 if (!history.length) return;
 closePicker();
 future.push(snapshot(score));
 score = history.pop();
 repairSelection();
 store();
 render();
}
function redo() {
 if (!future.length) return;
 closePicker();
 history.push(snapshot(score));
 score = future.pop();
 repairSelection();
 store();
 render();
}
function repairSelection() {
 if (!score.instruments.some(entry => entry.id === selectedInstrumentId)) selectedInstrumentId = score.instruments[0].id;
 selectedSlot.instrumentId = selectedInstrumentId;
 selectedSlot.bar = Math.min(selectedSlot.bar, score.bars - 1);
 for (const entry of score.instruments) {
  if(!entry.sounds.some(sound=>sound.id===selectedSounds.get(entry.id)))selectedSounds.set(entry.id,entry.sounds[0].id);
  if (!entry.chunks.some(chunk => chunk.id === selectedChunks.get(entry.id))) {
   selectedChunks.set(entry.id, entry.chunks[0].id);
  }
 }
}
function download(blob, name) {
 const url = URL.createObjectURL(blob);
 const a = element("a");
 a.href = url;
 a.download = name;
 document.body.append(a);
 a.click();
 a.remove();
 setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
function focus(inst, chunkId = null, bar = null) {
 selectedInstrumentId = inst.id;
 selectedNoteId=null;
 if (chunkId && inst.chunks.some(chunk => chunk.id === chunkId)) selectedChunks.set(inst.id, chunkId);
 if (bar !== null) selectedSlot = { instrumentId: inst.id, bar };
 render();
}
function renderInstruments() {
 const list = $("instrument-list");
 list.replaceChildren();
 for (const inst of score.instruments) {
  const selected = inst.id === selectedInstrumentId;
  const item=element("div",undefined,"instrument-entry");
  const el = button("", () => { closePicker(); focus(inst); }, "instrument-card" + (selected ? " active" : ""));
  el.style.setProperty("--track-accent", signal(inst));
  el.setAttribute("aria-pressed", String(selected));
  el.append(element("strong", inst.name), element("small", (inst.layout==="rack" ? inst.sounds.length+" sounds" : (getPreset(inst.sounds[0].patch.presetId)?.name ?? SAMPLE_LIBRARY.find(item=>item.id===inst.sounds[0].patch.presetId)?.name ?? savedSounds.find(item=>item.id===inst.sounds[0].patch.presetId)?.name ?? (inst.sounds[0].patch.type==="sample"?"Custom sample":"Custom synth"))) + " · " + inst.chunks.length + (inst.chunks.length === 1 ? " chunk" : " chunks")));
  item.append(el,actionMenu("Actions for "+inst.name,[
   {label:"Rename",run:()=>renameInstrument(inst)},
   {label:instrumentDeleteLabel(inst),danger:true,run:()=>removeInstrument(inst.id)}
  ],"instrument-actions"));
  list.append(item);
 }
 $("add-instrument").disabled = score.instruments.length >= 12;
}
function paintPlayhead() {
 for (const clip of $("arrangement").querySelectorAll(".clip")) {
  clip.classList.toggle("playing", playBar >= 0 && Number(clip.dataset.bar) === playBar);
 }
 paintPianoPlayhead();
}
function paintPianoPlayhead() {
 const grid = $("piano");
 const marker = grid.querySelector(".piano-playhead");
 if (!marker) return;
 const currentInstrument = instrument();
 const activeChunk = chunkFor(currentInstrument);
 const relative = pianoProgress!==null &&
  (playback!==null || pendingPlay) ?
  chunkProgress(score,currentInstrument.id,activeChunk.id,pianoProgress) : null;
 marker.hidden = relative===null;
 if(relative===null)return;
 const x=pianoScrubberX(relative,grid.clientWidth,instrument().layout==="rack"?128:63);
 marker.style.transform = `translateX(${x}px)`;
}
function renderTimeline() {
 const root=$("arrangement");
 root.replaceChildren();
 root.style.setProperty("--bars",score.bars);
 const heading=element("div",undefined,"arrangement-head");
 heading.append(element("span","INSTRUMENT"));
 for(let bar=0;bar<score.bars;bar++)heading.append(element("span",String(bar+1).padStart(2,"0")));
 root.append(heading);
 for(const inst of score.instruments){
  const lane=element("div",undefined,"arrangement-row"+(selectedInstrumentId===inst.id?" active":""));
  lane.style.setProperty("--track-accent",signal(inst));
  lane.dataset.instrumentId=inst.id;
  lane.append(button(inst.name,()=>{closePicker();focus(inst);},"label instrument-lane-label"));
  inst.timeline.forEach((chunkId,bar)=>{
   const chunk=inst.chunks.find(candidate=>candidate.id===chunkId);
   const timing=placementFor(inst,bar);
   const active=selectedSlot.instrumentId===inst.id&&selectedSlot.bar===bar;
   const label=chunk?.name??"+";
   const suffix=chunk&&(timing.offset||timing.repeats>1)?
    " · "+(timing.offset?"+"+timing.offset+"s ":"")+(timing.repeats>1?"×"+timing.repeats:""):"";
   const clip=button(label+suffix,()=>openPicker(inst.id,bar,clip),
    "clip"+(chunk?"":" empty")+(active?" selected":""));
   clip.dataset.bar=String(bar);
   clip.setAttribute("aria-label",inst.name+", bar "+(bar+1)+": "+(chunk?.name??"Empty")+
    (chunk?", starts "+timing.offset+" steps into bar, plays "+timing.repeats+
     " time(s), every "+timing.every+" steps":"")+". Choose chunk and timing");
   clip.setAttribute("aria-haspopup","dialog");
   clip.setAttribute("aria-expanded","false");
   clip.title=clip.getAttribute("aria-label");
   lane.append(clip);
  });
  // The strips show real onsets below the directly editable bar slots.
  for(const phrase of phraseInstances(score,inst)){
   const length=Math.min(phrase.length,score.bars*16-phrase.start);
   const segment=element("div",undefined,"phrase-segment"+(phrase.index?" repeated":""));
   segment.dataset.sourceBar=String(phrase.bar);
   segment.dataset.repeat=String(phrase.index);
   segment.style.setProperty("--phrase-start",String(phrase.start/(score.bars*16)));
   segment.style.setProperty("--phrase-width",String(length/(score.bars*16)));
   segment.setAttribute("aria-hidden","true");
   lane.append(segment);
  }
  root.append(lane);
 }
 paintPlayhead();
}
function place(instId, bar, chunkId) {
 closePicker();
 const inst = score.instruments.find(x => x.id === instId);
 if (!inst) return;
 if (chunkId === inst.timeline[bar]) {
  selectedInstrumentId = instId;
  selectedSlot = { instrumentId: instId, bar };
  if (chunkId !== null) selectedChunks.set(instId, chunkId);
  render();
  return;
 }
 modify(() => {
  inst.timeline[bar] = chunkId;
  if(chunkId===null)inst.placements[bar]=null;
  selectedInstrumentId = instId;
  selectedSlot = { instrumentId: instId, bar };
  if (chunkId !== null) selectedChunks.set(instId, chunkId);
 });
}
function openPicker(instId, bar, trigger) {
 closePicker();
 const inst = score.instruments.find(candidate => candidate.id === instId);
 if (!inst) return;
 selectedInstrumentId = inst.id;
 selectedSlot = { instrumentId: inst.id, bar };
 const assigned = inst.timeline[bar];
 if (assigned) selectedChunks.set(inst.id, assigned);
 // A direct timeline selection also opens that chunk in the notes editor.
 renderInstruments();
 renderChunkEditor();
 renderSound();
 for (const clip of $("arrangement").querySelectorAll(".clip")) {
  clip.classList.toggle("selected", clip.dataset.bar === String(bar) && clip.closest(".arrangement-row")?.dataset.instrumentId === inst.id);
 }
 const panel = element("div", undefined, "chunk-picker");
 panel.setAttribute("role", "dialog");
 panel.setAttribute("aria-label", "Choose chunk for " + inst.name + ", bar " + (bar + 1));
 panel.style.setProperty("--track-accent", signal(inst));
 const head = element("div", undefined, "picker-heading");
 head.append(element("span", inst.name + " / " + String(bar + 1).padStart(2, "0")),
  button("×", () => closePicker(), "picker-close"));
 panel.append(head);
 const choices = element("div", undefined, "picker-choices");
 const empty = button("– Empty", () => place(inst.id, bar, null), assigned === null ? "chosen" : "");
 empty.setAttribute("aria-pressed", String(assigned === null));
 choices.append(empty);
 for (const chunk of inst.chunks) {
  const option = button("", () => place(inst.id, bar, chunk.id), assigned === chunk.id ? "chosen" : "");
  option.setAttribute("aria-pressed", String(assigned === chunk.id));
  option.append(element("span", chunk.name), element("small", chunk.notes.length + (chunk.notes.length === 1 ? " note" : " notes")));
  choices.append(option);
 }
 panel.append(choices);
 // Timing belongs to this use of a reusable chunk, not the chunk definition.
 if(assigned){
  const settings=element("div",undefined,"placement-settings");
  const timing=placementFor(inst,bar);
  for(const [labelText,key,min,max] of [
   ["Offset in bar (steps)","offset",0,15],
   ["Phrase length (steps)","length",1,16],
   ["Repetitions","repeats",1,32],
   ["Repeat every (steps)","every",1,64]
  ]){
   const label=element("label",labelText);
   const value=element("input");
   value.type="number";value.min=String(min);value.max=String(max);
   value.step="1";value.value=String(timing[key]);
   value.setAttribute("aria-label",labelText+" for "+inst.name+" bar "+(bar+1));
   value.addEventListener("change",()=>{
    const next=Number(value.value);
    closePicker();
    const changed=modify(()=>{
     const old=placementFor(inst,bar),setting={...old,[key]:next};
     inst.placements[bar]=setting.offset===0&&setting.length===16&&setting.repeats===1&&setting.every===16?null:setting;
    });
    if(changed){
     const trigger=$("arrangement").querySelector(
      '.arrangement-row[data-instrument-id="'+inst.id+'"] .clip[data-bar="'+bar+'"]');
     if(trigger)openPicker(inst.id,bar,trigger);
    }
   });
   label.append(value);settings.append(label);
  }
  settings.append(element("p","Beat 3 = offset 8. A three-beat phrase has length 12 and repeats every 12 steps.","placement-tip"));
  panel.append(settings);
 }
 const add = button("+ New chunk", () => {
  closePicker();
  modify(() => {
   const next = makeChunk("Chunk " + (inst.chunks.length + 1));
   inst.chunks.push(next);
   inst.timeline[bar] = next.id;
   inst.placements[bar]=null;
   selectedInstrumentId = inst.id;
   selectedChunks.set(inst.id, next.id);
   selectedSlot = { instrumentId: inst.id, bar };
  });
 }, "picker-create");
 add.disabled = inst.chunks.length >= 32;
 panel.append(add);
 document.body.append(panel);
 const rect = trigger.getBoundingClientRect();
 const width = Math.min(310, window.innerWidth - 16);
 panel.style.width = width + "px";
 const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
 const panelHeight = panel.getBoundingClientRect().height;
 const below = window.innerHeight - rect.bottom - 8;
 const top = below >= panelHeight ? rect.bottom + 4
  : Math.max(8, rect.top - panelHeight - 4);
 panel.style.left = left + "px";
 panel.style.top = top + "px";
 picker = panel;
 pickerTrigger = trigger;
 trigger.setAttribute("aria-expanded", "true");
 (choices.querySelector(".chosen") || choices.querySelector("button"))?.focus();
}
document.addEventListener("pointerdown", event => {
 if (picker && !picker.contains(event.target) && !event.target.closest?.(".clip")) closePicker();
}, true);
document.addEventListener("keydown", event => {
 if (event.key === "Escape" && picker) { event.preventDefault(); const trigger = pickerTrigger; closePicker(); trigger?.focus(); }
});

const pitchNames = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const noteLabel = pitch => pitchNames[pitch % 12] + (Math.floor(pitch / 12) - 1);
for(const control of [$("sound-reference"),$("import-root")]){
 for(let pitch=0;pitch<=127;pitch++){
  const option=element("option",noteLabel(pitch));option.value=String(pitch);control.append(option);
 }
 control.value="60";
}
function selectSound(entry){
 selectedSounds.set(instrument().id,entry.id);selectedNoteId=null;
 if(inspectorState==="closed")setInspector("expanded");
 renderNotes();renderSound();
}
function renderRack(root,inst,chunk){
 const scroll=root.parentElement,top=scroll.scrollTop,left=scroll.scrollLeft;
 root.replaceChildren();root.style.setProperty("--track-accent",signal(inst));
 root.setAttribute("aria-label","Sound rack · "+inst.name);
 for(const entry of inst.sounds){
  const row=element("div",undefined,"rack-row"+(sound(inst).id===entry.id?" selected-sound":""));
  row.dataset.soundId=entry.id;
  const name=button((sound(inst).id===entry.id?"✓ ":"")+entry.name,()=>selectSound(entry),"rack-name");
  name.setAttribute("aria-pressed",String(sound(inst).id===entry.id));
  name.setAttribute("aria-label","Edit sound "+entry.name);name.title=entry.name;
  const head=element("div",undefined,"rack-row-head");
  const position=inst.sounds.indexOf(entry);
  head.append(name,actionMenu("Actions for "+entry.name,[
   {label:"Rename",run:()=>renameRackSound(inst,entry)},
   {label:"Replace sound",run:()=>{focus(inst);selectSound(entry);openLibrary("replace-row");}},
   {label:"Move to piano roll",disabled:!canMoveRackSoundToPianoRoll(score,inst.id,entry.id),
    run:()=>extractSoundToPianoRoll(inst.id,entry.id)},
   {label:"Duplicate sound",disabled:inst.sounds.length>=MAX_SOUNDS,run:()=>duplicateRackSound(inst.id,entry.id)},
   {label:"Move up",disabled:position===0,run:()=>moveRackSound(inst.id,entry.id,-1)},
   {label:"Move down",disabled:position===inst.sounds.length-1,run:()=>moveRackSound(inst.id,entry.id,1)},
   {label:soundDeleteLabel(inst),danger:true,run:()=>removeRackSound(inst.id,entry.id)}
  ],"rack-actions"));
  row.append(head);
  for(let step=0;step<16;step++){
   const existing=chunk.notes.find(note=>note.soundId===entry.id&&note.start===step);
   const cell=button(existing?"●":"",event=>{
    selectedSounds.set(inst.id,entry.id);
    if(existing&&event.shiftKey){
     const next=[.25,.55,.9].find(value=>value>existing.velocity+.01)??.25;
     modify(()=>{existing.velocity=next;});return;
    }
    if(existing&&editingNoteEffects){selectedNoteId=existing.id;renderNotes();renderSound();return;}
    if(existing){selectedNoteId=null;modify(()=>{chunk.notes=chunk.notes.filter(note=>note.id!==existing.id);});return;}
    const note={id:id(),soundId:entry.id,start:step,duration:1,velocity:Number($("velocity").value)};
    selectedNoteId=editingNoteEffects?note.id:null;
    if(modify(()=>chunk.notes.push(note))&&!playback&&!pendingPlay)
     void audition(inst,entry.referencePitch,score,{soundId:entry.id}).catch(()=>{});
   },"note rack-step"+(step%4===0?" beat":"")+(existing?" filled":"")+
    (editingNoteEffects&&existing?.id===selectedNoteId?" selected":"")+
    (existing?.bend?.shape&&existing.bend.shape!=="straight"?" bent":""));
   cell.setAttribute("aria-label",entry.name+", step "+(step+1)+(existing?", hit; "+Math.round(existing.velocity*100)+"% strength":"; add hit"));
   cell.setAttribute("aria-pressed",String(!!existing));
   cell.title=existing?(editingNoteEffects?"Edit hit effects":"Remove hit")+" · Shift-click strength":"Add hit";
   cell.addEventListener("keydown",event=>{
    if(existing&&["Delete","Backspace"].includes(event.key)){
     event.preventDefault();modify(()=>{chunk.notes=chunk.notes.filter(note=>note.id!==existing.id);});
    }
   });
   row.append(cell);
  }
  root.append(row);
 }
 const add=button("+ Sound",()=>openLibrary("replace"),"rack-add-sound");
 add.setAttribute("aria-label","Add sound to rack");root.append(add);
 const marker=element("div",undefined,"piano-playhead");marker.hidden=true;marker.setAttribute("aria-hidden","true");
 root.append(marker);paintPianoPlayhead();scroll.scrollTop=top;scroll.scrollLeft=left;
 const note=editingNoteEffects?chunk.notes.find(note=>note.id===selectedNoteId):null;
 const entry=note?inst.sounds.find(sound=>sound.id===note.soundId):sound(inst);
 renderNoteExpression($("note-expression"),note,entry.name,note?note.duration*60/score.bpm/4:0,
  bend=>modify(()=>{note.bend=bend;}),
  ()=>modify(()=>{chunk.notes=chunk.notes.filter(item=>item.id!==note.id);selectedNoteId=null;}),
  ()=>{void audition(inst,entry.referencePitch,score,{soundId:entry.id,velocity:note.velocity,bend:note.bend}).catch(error=>message(error.message,true));},entry.patch.bend);
 if(note){
  const label=element("label","Hit strength ","rack-strength");
  const input=element("input");input.type="range";input.min="0";input.max="1";input.step=".01";input.value=String(note.velocity);
  input.setAttribute("aria-label","Selected hit strength");
  input.addEventListener("change",()=>modify(()=>{note.velocity=Number(input.value);}));
  label.append(input,element("output",Math.round(note.velocity*100)+"%"));$("note-expression").prepend(label);
 }
}
function renderNotes() {
 const root = $("piano"), inst = instrument(), chunk = chunkFor(inst);
 root.classList.toggle("sound-rack",inst.layout==="rack");
 root.setAttribute("aria-label",inst.layout==="rack"?"Sound rack":"Piano roll");
 document.querySelector(".note-length-control").hidden=inst.layout==="rack";
 if(inst.layout==="rack"){renderRack(root,inst,chunk);return;}
 const scroll = root.parentElement, top = scroll.scrollTop, left = scroll.scrollLeft;
 root.replaceChildren();
 root.style.setProperty("--track-accent", signal(inst));

 for (let pitch = 83; pitch >= 36; pitch--) {
  const sharp = [1,3,6,8,10].includes(pitch % 12);
  const row = element("div", undefined, "piano-row" + (sharp ? " sharp" : ""));
  row.append(element("span", noteLabel(pitch), "note-name"));
  const cells = [];
  function previewRow() {
   for (let pos = 0; pos < 16; pos++) {
    const present = chunk.notes.find(n => n.pitch === pitch && pos >= n.start && pos < n.start + n.duration);
    const cell = cells[pos];
    cell.classList.toggle("filled", !!present && present.start === pos);
    cell.classList.toggle("tail", !!present && present.start !== pos);
    cell.classList.toggle("end", !!present && present.start + present.duration - 1 === pos);
    cell.classList.toggle("selected", editingNoteEffects && !!present && present.id===selectedNoteId);
    cell.classList.toggle("bent", !!present && present.bend?.shape && present.bend.shape!=="straight");
    cell.setAttribute("aria-label", noteLabel(pitch) + ", step " + (pos + 1)
     + (present ? ", note length " + present.duration + " steps; " + (editingNoteEffects?"click to edit note effects":"click to remove") : ", click to add note"));
    cell.title = present ? (editingNoteEffects?"Click to shape note · Shift-click strength":"Click to remove · Shift-click strength") + " · drag end to resize" : "Add " + noteLabel(pitch);
   }
  }

  for (let step = 0; step < 16; step++) {
   let ignoreClick = false;
   const cell = button("", event => {
    if (ignoreClick) return;
    const targetInst = instrument();
    const editedChunk = chunkFor(targetInst);
    const existing = editedChunk.notes.find(n => n.pitch === pitch && step >= n.start && step < n.start + n.duration);
    if(existing && event.shiftKey){
     const options=[.25,.55,.9];
     const next=options.find(value=>value>existing.velocity+.01)??options[0];
     if(modify(()=>{existing.velocity=next;}))message("Note strength: "+Math.round(next*100)+"%");
     return;
    }
    if(existing && editingNoteEffects){
     selectedNoteId=existing.id;
     renderNotes();
     return;
    }
    if(existing){
     selectedNoteId=null;
     modify(()=>{editedChunk.notes=editedChunk.notes.filter(n=>n.id!==existing.id);});
     return;
    }
    const created={id:id(),pitch,start:step,
     duration:Math.min(Number($("length").value),16-step),velocity:Number($("velocity").value)};
    selectedNoteId=editingNoteEffects?created.id:null;
    if(modify(()=>{editedChunk.notes.push(created);})&&!playback&&!pendingPlay)
     void audition(targetInst,pitch,score).catch(()=>{});
   }, "note" + (step % 4 === 0 ? " beat" : ""));
   cells.push(cell);

   // Resize is an edge gesture, never a separate editor or a save pathway.
   cell.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const note = chunk.notes.find(n => n.pitch === pitch && step >= n.start && step < n.start + n.duration);
    if (!note || step !== note.start + note.duration - 1) return;
    const bounds = cell.getBoundingClientRect();
    const edge = event.pointerType === "touch" ? 18 : 13;
    if (event.clientX < bounds.right - edge) return;
    event.preventDefault();
    ignoreClick = true;
    const initialX = event.clientX, originalDuration = note.duration;
    const width = bounds.width;
    const before = snapshot(score);
    let finished = false;
    cell.setPointerCapture(event.pointerId);
    cell.classList.add("resizing");

    function move(moveEvent) {
     if (finished) return;
     const offset = Math.round((moveEvent.clientX - initialX) / width);
     resizeNote(chunk, note.id, originalDuration + offset);
     previewRow();
    }
    function end(endEvent) {
     if (finished) return;
     finished = true;
     cell.removeEventListener("pointermove", move);
     cell.removeEventListener("pointerup", finish);
     cell.removeEventListener("pointercancel", cancel);
     if (cell.hasPointerCapture(endEvent.pointerId)) cell.releasePointerCapture(endEvent.pointerId);
     cell.classList.remove("resizing");
     if (endEvent.type === "pointercancel") note.duration = originalDuration;
     if (note.duration !== originalDuration) {
      history.push(before);
      if (history.length > 100) history.shift();
      future = [];
      store();
      render();
     } else previewRow();
     setTimeout(() => { ignoreClick = false; }, 0);
    }
    function finish(endEvent) { move(endEvent); end(endEvent); }
    function cancel(endEvent) { end(endEvent); }
    cell.addEventListener("pointermove", move);
    cell.addEventListener("pointerup", finish);
    cell.addEventListener("pointercancel", cancel);
   });
   // Backspace/Delete removes a selected note without hijacking text inputs.
   cell.addEventListener("keydown",event=>{
    if(!["Backspace","Delete"].includes(event.key))return;
    const selected=chunk.notes.find(n=>n.id===selectedNoteId);
    if(!selected||selected.pitch!==pitch||step<selected.start||step>=selected.start+selected.duration)return;
    event.preventDefault();
    const id=selectedNoteId;selectedNoteId=null;
    modify(()=>{chunk.notes=chunk.notes.filter(n=>n.id!==id);});
   });
   // Keyboard support is also immediate and uses the canonical undo pathway.
   cell.addEventListener("keydown", event => {
    if (!event.altKey || !["ArrowLeft","ArrowRight"].includes(event.key)) return;
    const target = chunk.notes.find(n => n.pitch === pitch && step >= n.start && step < n.start+n.duration);
    if (!target) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    modify(() => resizeNote(chunk, target.id, target.duration + delta));
   });
   row.append(cell);
  }
  root.append(row);
  previewRow();
 }
 const playhead = element("div", undefined, "piano-playhead");
 playhead.setAttribute("aria-hidden", "true");
 playhead.hidden = true;
 root.append(playhead);
 paintPianoPlayhead();
 scroll.scrollTop = top;
 scroll.scrollLeft = left;
 const note=editingNoteEffects?chunk.notes.find(entry=>entry.id===selectedNoteId):null;
 renderNoteExpression($("note-expression"),note,note?noteLabel(note.pitch):"",
  note?note.duration*60/score.bpm/4:0,bend=>{
  modify(()=>{const target=chunkFor(instrument()).notes.find(entry=>entry.id===selectedNoteId);if(target)target.bend=bend;});
 },()=>{
  const id=selectedNoteId;
  selectedNoteId=null;
  modify(()=>{const current=chunkFor(instrument());current.notes=current.notes.filter(entry=>entry.id!==id);});
 },()=>{
  const current=chunkFor(instrument()).notes.find(entry=>entry.id===selectedNoteId);
  if(!current)return;
  void audition(instrument(),current.pitch,score,{
   velocity:current.velocity,bend:current.bend,
   duration:current.duration*60/score.bpm/4
  }).catch(error=>message("Couldn't preview note: "+error.message,true));
 },sound().patch.bend);
}
function renderChunkEditor() {
 const inst = instrument(), select = $("chunk");
 const oldValue = selectedChunks.get(inst.id);
 select.replaceChildren();
 for (const chunk of inst.chunks) {
  const option = element("option", chunk.name);
  option.value = chunk.id;
  select.append(option);
 }
 const active = inst.chunks.find(c => c.id === oldValue) || inst.chunks[0];
 selectedChunks.set(inst.id, active.id);
 select.value = active.id;
 $("chunk-name").value = active.name;
 $("add-chunk").disabled = inst.chunks.length >= 32;
 $("duplicate-chunk").disabled = inst.chunks.length >= 32;
 $("delete-chunk").disabled = inst.chunks.length <= 1;
 $("editing-identity").textContent = inst.name + " / " + active.name;
 $("edit-instrument-note").textContent = inst.name;
 renderNotes();
}
function renderSound() {
 const inst=instrument(),entry=sound(inst),patch=entry.patch;
 $("instrument-name").value=inst.name;
 document.querySelector(".controls")?.style.setProperty("--track-accent",signal(inst));
 $("synth-editor").style.setProperty("--track-accent",signal(inst));
 document.querySelector(".patch-info")?.style.setProperty("--track-accent",signal(inst));
 const preset=getPreset(patch.presetId)||SAMPLE_LIBRARY.find(x=>x.id===patch.presetId)
  ||savedSounds.find(entry=>entry.id===patch.presetId);
 $("patch-label").textContent=(patch.type==="sample"?"Sample · ":"Synth · ")+(preset?.name||"Custom");
 const scope=createSignalDisplay($("sound-visualizer"),patch,score,signal(inst));
 const preview=(path,value)=>{
  // Construct a temporary sound-definition view, not an alternate mutable draft.
  const next=patchCopy(sound().patch);
  let parent=next;
  for(let i=0;i<path.length-1;i++)parent=parent[path[i]]??={};
  parent[path[path.length-1]]=value;
  scope(next);
 };
 const onChange=(path,value)=>{
  const changed=modify(()=>{
   const target=sound().patch;
   let owner=target;
   for(let i=0;i<path.length-1;i++)owner=owner[path[i]]??={};
   owner[path[path.length-1]]=value;
   target.presetId="custom";
  });
  if(changed&&!playback&&!pendingPlay){
   clearTimeout(soundPreviewTimer);
   const instId=inst.id,soundId=entry.id;
   soundPreviewTimer=setTimeout(()=>{
    soundPreviewTimer=null;
    if(playback||pendingPlay||instrument().id!==instId||sound().id!==soundId)return;
    void audition(instrument(),sound().referencePitch,score,{soundId,duration:.4})
     .catch(error=>message("Couldn't preview sound: "+error.message,true));
   },140);
  }
 };
 const volume=$("instrument-volume-dial");
 volume.replaceChildren();
 volume.append(createDial({label:inst.layout==="rack"?"Rack volume":"Volume",min:0,max:1,step:.01,display:"percent"},
  inst.volume,value=>modify(()=>{instrument().volume=value;})));
 $("sound-name").value=entry.name;
 $("move-sound-up").disabled=inst.sounds.indexOf(entry)===0;
 $("move-sound-down").disabled=inst.sounds.indexOf(entry)===inst.sounds.length-1;
 $("duplicate-sound").disabled=inst.sounds.length>=MAX_SOUNDS;
 $("remove-sound").disabled=false;
  $("remove-sound").textContent=soundDeleteLabel(inst);
 $("sound-controls").hidden=inst.layout!=="rack";
 $("save-row-sound").hidden=inst.layout!=="rack";
 $("save-sound").textContent=inst.layout==="rack"?"Save rack preset":"Save preset";
 const level=$("sound-volume-dial");level.replaceChildren();
 level.append(createDial({label:"Sound level",min:0,max:1,step:.01,display:"percent"},entry.gain,
  value=>modify(()=>{sound().gain=value;})));
 $("sound-reference").value=String(entry.referencePitch);
 $("convert-rack").hidden=inst.layout==="rack";
 $("convert-rack").disabled=!canConvertToRack(inst);
 $("convert-rack").title=canConvertToRack(inst)?"Use one named sound row":"Keep the piano roll: conversion would change pitches, zones, or simultaneous events";
 $("convert-pitched").hidden=inst.layout!=="rack";
 $("convert-pitched").disabled=!canMoveRackSoundToPianoRoll(score,inst.id,entry.id);
 $("convert-pitched").title=entry.referencePitch<36||entry.referencePitch>96?
  "Reference note must be within C2–C7 to use the piano roll":
  score.instruments.length>=12&&inst.sounds.length>1?
  "The composition already has 12 instruments": "Move this sound to its own piano-roll instrument";
 $("edit-instrument-note").textContent=inst.layout==="rack"?inst.name+" / "+entry.name:inst.name;
 if(patch.type==="sample"){
  renderSamplerEditor($("synth-editor"),patch,onChange,
   patch.zones.map(zone=>score.samples.find(x=>x.id===zone.assetId)?.name||zone.assetId).join(" / "),
   ()=>openAudioReplace(),preview);
 }else renderPatchEditor($("synth-editor"),patch,onChange,preview);
 $("remove-instrument").disabled=false;
  $("remove-instrument").textContent=instrumentDeleteLabel(inst);
}
function render() {
 repairSelection();
 syncInspector();
 $("note-mode").setAttribute("aria-pressed",String(editingNoteEffects));
 $("note-mode").textContent=editingNoteEffects?"✓ Note effects · Done":"Edit note effects";
 document.querySelector(".work")?.classList.toggle("editing-note-effects",editingNoteEffects);
 document.querySelector(".notes-section")?.classList.toggle("editing-note-effects",editingNoteEffects);
 $("title").value = score.title;
 $("bpm").value = String(score.bpm);
 $("bars").value = String(score.bars);
 renderInstruments();
 renderTimeline();
 renderChunkEditor();
 renderSound();
 $("undo").disabled = history.length === 0;
 $("redo").disabled = future.length === 0;
}


function syncInspector(){
 const work=document.querySelector(".work");
 for(const name of ["closed","expanded"])work.classList.toggle("inspector-"+name,inspectorState===name);
 const opened=inspectorState!=="closed";
 $("sound-section").setAttribute("aria-hidden",String(!opened));
 $("sound-toggle").setAttribute("aria-expanded",String(opened));
 $("sound-toggle").textContent=opened?"✓ Sound":"Sound";
}
function setInspector(state){
 inspectorState=state;
 syncInspector();
}
inspectorViewport.addEventListener("change",event=>{
 // Both layouts use precisely the same existing Sound element and editor.
 setInspector(event.matches?"expanded":"closed");
});
$("sound-toggle").addEventListener("click",()=>{
 setInspector(inspectorState==="closed"?"expanded":"closed");
});
$("sound-close").addEventListener("click",()=>setInspector("closed"));
function showExamples(){
 const root=$("example-list");root.replaceChildren();
 for(const example of EXAMPLES){
  const card=button("",()=>{void chooseExample(example);},"example-card");
  card.style.setProperty("--example-accent",example.accent);
  const title=element("strong",example.name);
  const tagline=element("span",example.tag+" · "+example.bpm+" BPM · "+example.bars+" bars · "+example.voices.length+" instruments","example-tag");
  card.append(title,tagline,element("span",example.description));
  root.append(card);
 }
 $("example-dialog").showModal();
}
async function chooseExample(example){
 if(loadingExample)return;
 if(!confirm("Load "+example.name+"? This replaces your current browser draft. Save .premidi first if you want to keep it."))return;
 loadingExample=true;
 for(const card of $("example-list").querySelectorAll("button"))card.disabled=true;
 message("Loading "+example.name+" and its sounds...");
 try {
  const document=await buildExample(example.id,async assetId=>{
   if(!builtinCache.has(assetId))builtinCache.set(assetId,loadLibrarySample(assetId).catch(error=>{
    builtinCache.delete(assetId);throw error;
   }));
   return builtinCache.get(assetId);
  });
  $("example-dialog").close();
  resetTo(document);
  message("Example loaded: "+example.name+" · Edit freely or export it");
 }catch(error){message("Could not load "+example.name+": "+error.message,true);}
 finally{
  loadingExample=false;
  for(const card of $("example-list").querySelectorAll("button"))card.disabled=false;
 }
}
$("examples").addEventListener("click",showExamples);
$("close-examples").addEventListener("click",()=>$("example-dialog").close());

$("note-mode").addEventListener("click",()=>{
 editingNoteEffects=!editingNoteEffects;
 selectedNoteId=null;
 render();
 if(editingNoteEffects) {
  $("note-mode").focus({preventScroll:true});
 }
});
$("new").addEventListener("click", () => {
 if (confirm("Start a new composition? Save the current .premidi if you want a copy.")) resetTo(create());
});
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change",async event=>{
 const file=event.currentTarget.files?.[0];
 if(!file)return;
 try {
  if(!confirm("Open "+file.name+"? This replaces the browser draft. Export it first if you want a copy."))return;
  const next=await importProject(file);
  resetTo(next);
  message("Opened "+file.name);
 }catch(error){message("Could not open file: "+error.message,true);}
 finally{$("file").value="";}
});
$("export").addEventListener("click",()=>{
 try{
  const result=exportProject(score);
  download(result.blob,result.name);
  message(result.name.endsWith(".zip")?"Saved music ZIP with separate audio assets":"Saved .premidi");
 }catch(error){message("Export failed: "+error.message,true);}
});
$("wav").addEventListener("click", async () => {
 const el = $("wav");
 el.disabled = true;
 message("Rendering WAV...");
 try { download(await wav(score), filename(score,".wav")); message("Saved WAV"); }
 catch (error) { message("WAV error: " + error.message, true); }
 finally { el.disabled = false; }
});
$("play").addEventListener("click", async () => {
 if (playback) { stop(); return; }
 if (pendingPlay) return;
 pendingPlay = true;
 try {
  playback = await play(() => score, {
   loop: () => $("loop").checked,
   onPosition: (bar, step) => {
    $("position").textContent = (bar + 1) + "." + (Math.floor(step / 4) + 1);
    if (playBar !== bar) { playBar = bar; paintPlayhead(); }
    playStep = step;
   },
   onProgress: (bar, step) => {
    pianoProgress = {bar, step};
    paintPianoPlayhead();
   },
   onStop: () => {
    playback = null;
    playBar = playStep = -1;
    pianoProgress = null;
    $("play").textContent = "▶ Play";
    paintPlayhead();
   }
  });
  $("play").textContent = "Ⅱ Stop";
 } catch (error) { message("Playback error: " + error.message, true); }
 finally { pendingPlay = false; }
});
$("stop").addEventListener("click", stop);
$("title").addEventListener("change", event => modify(() => score.title = event.target.value.trim() || "Untitled composition"));
$("bpm").addEventListener("change", event => modify(() => score.bpm = Math.round(Number(event.target.value))));
$("bars").addEventListener("change", event => modify(() => {
 const count = Number(event.target.value);
 score.bars = count;
 for (const inst of score.instruments) {
  while (inst.timeline.length < count) inst.timeline.push(null);
  inst.timeline.length = count;
  while(inst.placements.length<count)inst.placements.push(null);
  inst.placements.length=count;
 }
 selectedSlot.bar = Math.min(selectedSlot.bar, count - 1);
}));
$("add-instrument").addEventListener("click",()=>openLibrary("add"));
$("change-sound").addEventListener("click",()=>openLibrary("replace"));
$("close-library").addEventListener("click",()=>$("instrument-dialog").close());
function currentContext(mode="replace"){
 return {mode,instrumentId:instrument().id,soundId:sound().id};
}
function applySoundSelection(patch,name,trigger,assets,context,rackSounds=null,settings=null){
 const target=score.instruments.find(inst=>inst.id===context.instrumentId);
 if(!target){message("The original instrument was removed. Open the sound library again.",true);return false;}
 const row=target.sounds.find(sound=>sound.id===context.soundId);
 if(context.mode==="replace-row"&&!row)return false;
 const operation=context.mode==="replace-row"?"replace-row":rackSounds?"create-rack":
  selectionOperation(target.layout,trigger,context.mode==="add");
 return modify(()=>{
  for(const asset of assets)if(!score.samples.some(existing=>existing.id===asset.id))score.samples.push(asset);
  if(operation.startsWith("create-")){
   const entry=makeSound(name.slice(0,60),patch,trigger);
   if(settings){entry.referencePitch=settings.referencePitch??entry.referencePitch;entry.gain=settings.gain??entry.gain;}
   const inst=makeInstrument(score.instruments.length+1,score.bars,entry);
   if(rackSounds){
    inst.layout="rack";inst.sounds=clone(rackSounds).map(sound=>({...sound,id:id()}));
   }
   if(rackSounds)inst.volume=settings?.volume??.7;
   inst.name=name.slice(0,60);score.instruments.push(inst);
   selectedInstrumentId=inst.id;selectedSounds.set(inst.id,inst.sounds[0].id);
   selectedSlot={instrumentId:inst.id,bar:0};selectedChunks.set(inst.id,inst.chunks[0].id);
  }else if(operation==="append-rack"){
   const entry=makeSound(name.slice(0,60),patch,"hit");
   if(settings){entry.referencePitch=settings.referencePitch??entry.referencePitch;entry.gain=settings.gain??entry.gain;}
   target.sounds.push(entry);selectedSounds.set(target.id,entry.id);
   selectedInstrumentId=target.id;
  }else{
   const entry=operation==="replace-row"?row:target.sounds[0];
   entry.patch=patch;entry.name=name.slice(0,60);
   if(settings){entry.referencePitch=settings.referencePitch??entry.referencePitch;entry.gain=settings.gain??entry.gain;}
   if(operation==="replace-pitched")target.name=name.slice(0,60);
   selectedSounds.set(target.id,entry.id);selectedInstrumentId=target.id;
  }
  selectedNoteId=null;
 });
}
function addAuthoredSample(asset,options={},context=currentContext("add")){
 const {name=asset.name,root=60,followPitch=true}=options;
 const patch={type:"sample",presetId:"custom",zones:[{assetId:asset.id,root}],
  followPitch,oneShot:!followPitch,transpose:0,gain:.9,attack:.005,release:.17,pan:0,
  movement:{rate:5,depth:0,delay:0,glide:0,glideTime:.18,tremolo:0,tremoloRate:5,tone:0,toneRate:2},
  bend:{shape:"straight",amount:2,rate:4}};
 const target=score.instruments.find(inst=>inst.id===context.instrumentId);
 const row=target?.sounds.find(sound=>sound.id===context.soundId);
 if(context.mode==="replace-row"&&row){
  // Replacing audio preserves this sound's note/hit intent and recorded pitch.
  patch.followPitch=row.patch.type==="sample"?row.patch.followPitch:row.trigger==="pitched";
  patch.oneShot=row.trigger==="hit";patch.zones[0].root=root;
 }
 const ok=applySoundSelection(patch,name,followPitch?"pitched":"hit",[asset],context);
 if(ok){
  if($("instrument-dialog").open)$("instrument-dialog").close();
  if(playback)void primeSamples(score).catch(error=>message(error.message,true));
 }
 return ok;
}
let recordingMode=null;
const recorder=installMicrophoneRecorder({
 get:$,
 onSynth:({patch,name,trigger,referencePitch})=>{
  if(score.instruments.length>=12){message("The composition supports up to 12 instruments.",true);return false;}
  const names=new Set(score.instruments.flatMap(inst=>[inst.name,...inst.sounds.map(sound=>sound.name)]));
  const base=name;let suffix=2;
  while(names.has(name))name=(base.slice(0,54)+" "+suffix++).slice(0,60);
  const ok=applySoundSelection(patchCopy(patch),name,trigger,[],{...recordingMode,mode:"add"},null,{referencePitch});
  if(ok){setInspector("expanded");message("Created "+name+" · edit its synth controls in Sound");}
  return ok;
 },
 onUse:({wav,name,root,followPitch})=>{
  try{
   const asset=makeSampleAsset("recorded-"+id(),name,"audio/wav",wav,
    "Recorded by author in pre-midi");
   const ok=addAuthoredSample(asset,{name,root,followPitch},recordingMode);
   if(ok)message("Recorded "+name+". Export to get its separate WAV asset.");
   return ok;
  }catch(error){message("Could not use recording: "+error.message,true);return false;}
 }
});
function openRecorder(mode="add"){
 if(mode==="add"&&score.instruments.length>=12)
  return message("The composition supports up to 12 instruments.",true);
 recordingMode=libraryContext&&$("instrument-dialog").open?{...libraryContext}:currentContext(mode);
 if($("instrument-dialog").open)$("instrument-dialog").close();
 recorder.open();
}
$("record-sound").addEventListener("click",()=>openRecorder("replace"));
let audioReplaceContext=null,pendingImport=null;
function openAudioReplace(){audioReplaceContext=currentContext("replace-row");$("sample-file").click();}
$("sample-file").addEventListener("cancel",()=>{audioReplaceContext=null;});
$("sample-file").addEventListener("change",async event=>{
 const input=event.currentTarget,file=input.files?.[0];
 if(!file)return;
 const context=audioReplaceContext||{...libraryContext};audioReplaceContext=null;
 try{
  if(file.size>1_000_000)throw Error("Sample must be smaller than 1 MB.");
  const ext=file.name.split(".").pop()?.toLowerCase();
  const mime=ext==="wav"?"audio/wav":ext==="ogg"?"audio/ogg":ext==="mp3"?"audio/mpeg":"";
  const asset=makeSampleAsset("custom-"+id(),file.name,mime,
   new Uint8Array(await file.arrayBuffer()),"Imported by author: "+file.name);
  const name=file.name.replace(/\.[^.]+$/,"").slice(0,60);
  if(context.mode==="replace-row"){
   const target=score.instruments.find(inst=>inst.id===context.instrumentId);
   const row=target?.sounds.find(sound=>sound.id===context.soundId);
   if(!row)throw Error("The original sound was removed.");
   addAuthoredSample(asset,{name,root:row.patch.zones?.[0]?.root??row.referencePitch,followPitch:row.trigger==="pitched"},context);
  }else{
   pendingImport={asset,name,context};$("import-root").value="60";$("audio-kind-dialog").showModal();
  }
 }catch(error){message("Could not import audio: "+error.message,true);}
 finally{input.value="";}
});
function useImportedAudio(followPitch){
 if(!pendingImport)return;
 const {asset,name,context}=pendingImport;
 if(addAuthoredSample(asset,{name,followPitch,root:Number($("import-root").value)},context)){
  pendingImport=null;$("audio-kind-dialog").close();
  message("Imported "+name+". Export includes its separate audio file.");
 }
}
$("import-as-note").addEventListener("click",()=>useImportedAudio(true));
$("import-as-hit").addEventListener("click",()=>useImportedAudio(false));
$("import-as-synth").addEventListener("click",()=>{
 if(!pendingImport)return;
 const {asset,name,context}=pendingImport,bytes=getAsset(asset.id);
 if(!bytes)return message("The imported audio is unavailable. Choose the file again.",true);
 recordingMode={...context};pendingImport=null;$("audio-kind-dialog").close();
 void recorder.openFile(new Blob([bytes],{type:asset.mime}),name);
});
$("cancel-audio-kind").addEventListener("click",()=>{$("audio-kind-dialog").close();pendingImport=null;});
async function savePreset(wholeRack=false){
 const inst=instrument(),entry=sound();
 const name=prompt(wholeRack?"Name your complete rack preset:":"Name your sound preset:",
  (wholeRack?inst.name:entry.name)+" variation")?.trim();
 if(!name)return;
 if(name.length>60)return message("Preset name must be 60 characters or less.",true);
 if(savedSounds.length>=100)return message("Your sound library contains 100 presets.",true);
 const sounds=wholeRack?clone(inst.sounds):[clone(entry)];
 const needs=new Set(sounds.flatMap(sound=>sound.patch.type==="sample"?sound.patch.zones.map(zone=>zone.assetId):[]));
 const samples=score.samples.filter(asset=>needs.has(asset.id));
 const item={id:"user-"+id(),name,category:"Mine",description:wholeRack?"Complete rack · "+sounds.length+" sounds":"Your saved sound",samples};
 if(wholeRack){item.sounds=sounds;item.layout="rack";item.volume=inst.volume;}
 else {item.patch=entry.patch?patchCopy(entry.patch):null;item.trigger=entry.trigger;item.referencePitch=entry.referencePitch;item.gain=entry.gain;}
 try{
  await savePresetAssets(samples);
  localStorage.setItem(SAVED_SOUNDS,JSON.stringify([...savedSounds,item]));savedSounds.push(item);
  message("Saved "+name+" in your browser's sound library.");
 }catch(error){message("Could not save preset: "+error.message+". Export your composition to keep it.",true);}
}
$("save-sound").addEventListener("click",()=>{void savePreset(instrument().layout==="rack");});
$("save-row-sound").addEventListener("click",()=>{void savePreset(false);});
function allSounds(){return [...PRESETS,...SAMPLE_LIBRARY,...savedSounds];}
function openLibrary(mode) {
 closePicker();
 if(mode==="add"&&score.instruments.length>=12)return;
 libraryMode=mode;libraryContext=currentContext(mode);
 libraryCategory="All";
 $("library-description").textContent=mode==="add"?"Choose a sound for a separate instrument.":mode==="replace-row"?
  "Replace only the selected sound. Its row, events, and hit behavior stay in place.":
  "Notes use a piano roll. Hits join your current rack, or start a new rack.";
 renderLibrary();
 const dialog=$("instrument-dialog");
 if(!dialog.open)dialog.showModal();
}
const builtinCache=new Map();
async function resolveSamples(preset) {
 const ids=new Set(preset.sounds?preset.sounds.flatMap(sound=>sound.patch.type==="sample"?sound.patch.zones.map(zone=>zone.assetId):[]):
  preset.patch?.type==="sample"?preset.patch.zones.map(zone=>zone.assetId):preset.assets||[]);
 return Promise.all([...ids].map(async assetId=>{
  const existing=(preset.samples||[]).find(asset=>asset.id===assetId)||score.samples.find(asset=>asset.id===assetId);
  if(existing)return existing;
  if(!sampleAsset(assetId))throw Error("Saved sample is missing its audio: "+assetId);
  if(!builtinCache.has(assetId))builtinCache.set(assetId,loadLibrarySample(assetId).catch(error=>{builtinCache.delete(assetId);throw error;}));
  return builtinCache.get(assetId);
 }));
}
const presetTrigger = preset => preset.trigger||
 (SAMPLE_LIBRARY.find(item=>item.id===preset.patch?.presetId)?.trigger) ||
 (getPreset(preset.patch?.presetId)?.trigger) || "pitched";
async function chooseSound(preset) {
 const context={...libraryContext};
 const dialog=$("instrument-dialog");
 message("Loading "+preset.name+"...");
 try {
  const assets=await resolveSamples(preset);
  const patch=preset.sounds?patchCopy(preset.sounds[0].patch):preset.category==="Mine"?patchCopy(preset.patch):
   preset.assets?makeSamplerPatch(preset):makePatch(preset.id);
  patch.presetId=preset.id;
  const trigger=presetTrigger(preset);
  const ok=applySoundSelection(patch,preset.name,trigger,assets,context,preset.sounds,preset.category==="Mine"?preset:null);
  if(ok) {
   dialog.close();
   // A new sample can be introduced while the transport is running.
   if(playback)void primeSamples(score).catch(error=>message("Sample decode failed: "+error.message,true));
   message("Loaded "+preset.name);
  }
 }catch(error){message("Couldn't load "+preset.name+": "+error.message,true);}
}
async function auditionPreset(preset) {
 try {
  if(preset.sounds){
   const samples=await resolveSamples(preset);
   await Promise.all(preset.sounds.map(entry=>audition({...makeInstrument(1,1,entry),volume:preset.volume??.7},
    entry.referencePitch,{samples})));return;
  }
  const patch=preset.sounds?patchCopy(preset.sounds[0].patch):preset.category==="Mine"?patchCopy(preset.patch):
   preset.assets?makeSamplerPatch(preset):makePatch(preset.id);
  const pitch=preset.referencePitch??(presetTrigger(preset)==="hit"?patch.zones?.[0]?.root??60:preset.category==="Bass"?48:preset.category==="Guitars"?57:69);
  const inst=makeInstrument(1,1,makeSound(preset.name,patch,presetTrigger(preset)));inst.volume=.8;
  inst.sounds[0].referencePitch=pitch;inst.sounds[0].gain=preset.category==="Mine"?preset.gain??1:1;
  // Preview strumming as an actual chord, otherwise the Steel Strum and
  // Steel Acoustic presets can sound like the same single plucked note.
  const chord=preset.id==="steel-strum"?[52,57,60,64,69]:null;
  const pitches=chord||[pitch];
  const ids=[...new Set(pitches.map(key=>patch.type==="sample"?
   sampleForNote(patch,key,.8)?.assetId:null).filter(Boolean))];
  const assets=await Promise.all(ids.map(async id=>{
   return (preset.samples||[]).find(item=>item.id===id)
    ||score.samples.find(item=>item.id===id)
    ||await loadLibrarySample(id);
  }));
  if(chord)await auditionChord(inst,pitches,{samples:assets});
  else await audition(inst,pitch,{samples:assets});
 }catch(error){message("Preview failed: "+error.message,true);}
}
function renderLibrary() {
 const filters=$("library-filters"),list=$("library-sounds");
 filters.replaceChildren();list.replaceChildren();
 const categories=["All","Guitars","Recorded","Drums","Textures","Bass","Lead","Keys","Pads","Winds","Percussion",...(savedSounds.length?["Mine"]:[])];
 for(const category of categories) {
  const control=button(category,()=>{libraryCategory=category;renderLibrary();},
   "library-filter"+(libraryCategory===category?" selected":""));
  control.setAttribute("aria-pressed",String(libraryCategory===category));
  filters.append(control);
 }
 if(["add","replace","replace-row"].includes(libraryMode)) {
  const record=button("● Record a sound",()=>openRecorder(libraryMode),"library-import library-record");
  const personal=button("＋ Import audio file",()=>$("sample-file").click(),"library-import");
  list.append(record,personal);
 }
 for(const preset of allSounds().filter(p=>(libraryMode!=="replace-row"||!p.sounds)&&(libraryCategory==="All"||p.category===libraryCategory))) {
  const card=element("div",undefined,"preset-card");
  const info=element("div",undefined,"preset-information");
  info.append(element("strong",preset.name),element("span",preset.description));
  const actions=element("div",undefined,"preset-actions");
  const preview=button("▶",()=>{void auditionPreset(preset);},"preset-preview");
  preview.title="Preview "+preset.name;
  preview.setAttribute("aria-label","Preview "+preset.name);
  const use=button(libraryMode==="add"?"Add":"Use",()=>{void chooseSound(preset);},"preset-choose");
  use.setAttribute("aria-label",(libraryMode==="add"?"Add ":"Use ")+preset.name);
  actions.append(preview,use);
  card.append(info,actions);
  list.append(card);
 }
}
function removeInstrument(instrumentId){
 const target=score.instruments.find(entry=>entry.id===instrumentId);
 if(!target)return;
 const last=score.instruments.length===1;
 if(!confirm(instrumentDeleteLabel(target)+" “"+target.name+"” and all its chunks?"+
  (last?" A fresh, empty instrument will take its place.":"")))return;
 closePicker();
 modify(()=>{
  const replacementId=deleteInstrumentFromScore(score,instrumentId);
  selectedSounds.delete(instrumentId);
  selectedChunks.delete(instrumentId);
  selectedNoteId=null;
  if(selectedInstrumentId===instrumentId){
   selectedInstrumentId=replacementId;
   selectedSlot={instrumentId:selectedInstrumentId,bar:0};
  }
 });
}
$("remove-instrument").addEventListener("click",()=>removeInstrument(instrument().id));
$("chunk").addEventListener("change", event => {
 selectedChunks.set(instrument().id, event.target.value);
 renderChunkEditor();
});
$("add-chunk").addEventListener("click", () => {
 modify(() => {
  const inst = instrument(), chunk = makeChunk("Chunk " + (inst.chunks.length + 1));
  inst.chunks.push(chunk);
  selectedChunks.set(inst.id, chunk.id);
 });
});
$("duplicate-chunk").addEventListener("click", () => {
 modify(() => {
  const inst = instrument(), source = chunkFor(inst), chunk = clone(source);
  chunk.id = id();
  chunk.name = (source.name + " copy").slice(0,60);
  for (const note of chunk.notes) note.id = id();
  inst.chunks.push(chunk);
  selectedChunks.set(inst.id, chunk.id);
 });
});
$("delete-chunk").addEventListener("click", () => {
 const inst = instrument(), chunk = chunkFor(inst);
 if (inst.chunks.length < 2 || !confirm("Delete " + chunk.name + "?")) return;
 modify(() => {
  inst.chunks = inst.chunks.filter(candidate => candidate.id !== chunk.id);
  inst.placements=inst.placements.map((setting,bar)=>inst.timeline[bar]===chunk.id?null:setting);
  inst.timeline = inst.timeline.map(value => value === chunk.id ? null : value);
  selectedChunks.set(inst.id, inst.chunks[0].id);
 });
});
$("chunk-name").addEventListener("change", event => modify(() => chunkFor(instrument()).name = event.target.value.trim() || "Chunk"));
$("sound-name").addEventListener("change",event=>modify(()=>{sound().name=event.target.value.trim()||"Sound";}));
$("sound-reference").addEventListener("change",event=>modify(()=>{sound().referencePitch=Number(event.target.value);}));
$("replace-row-sound").addEventListener("click",()=>openLibrary("replace-row"));
$("hear-sound").addEventListener("click",()=>{void audition(instrument(),sound().referencePitch,score,{soundId:sound().id}).catch(error=>message(error.message,true));});
function moveRackSound(instrumentId,soundId,offset){
 const inst=score.instruments.find(item=>item.id===instrumentId);
 if(!inst)return;
 const index=inst.sounds.findIndex(item=>item.id===soundId);
 if(index<0||index+offset<0||index+offset>=inst.sounds.length)return;
 modify(()=>{
  [inst.sounds[index],inst.sounds[index+offset]]=[inst.sounds[index+offset],inst.sounds[index]];
  selectedInstrumentId=inst.id;
  selectedSounds.set(inst.id,soundId);
 });
}
function duplicateRackSound(instrumentId,soundId){
 const inst=score.instruments.find(item=>item.id===instrumentId);
 const index=inst?.sounds.findIndex(item=>item.id===soundId)??-1;
 if(index<0||inst.sounds.length>=MAX_SOUNDS)return;
 modify(()=>{
  const entry=clone(inst.sounds[index]);
  entry.id=id();
  entry.name=(entry.name+" copy").slice(0,60);
  inst.sounds.splice(index+1,0,entry);
  selectedInstrumentId=inst.id;
  selectedSounds.set(inst.id,entry.id);
 });
}
function removeRackSound(instrumentId,soundId){
 const inst=score.instruments.find(item=>item.id===instrumentId);
 const entry=inst?.sounds.find(item=>item.id===soundId);
 if(!entry||inst.layout!=="rack")return;
 if(inst.sounds.length===1){removeInstrument(instrumentId);return;}
 const count=inst.chunks.reduce((sum,chunk)=>sum+chunk.notes.filter(note=>note.soundId===entry.id).length,0);
 if(count&&!confirm("Remove "+entry.name+" and its "+count+" hits across all chunks?"))return;
 closePicker();
 modify(()=>{
  deleteSoundFromScore(score,instrumentId,soundId);
  selectedNoteId=null;
  selectedInstrumentId=instrumentId;
  selectedSounds.delete(instrumentId);
 });
}
$("move-sound-up").addEventListener("click",()=>moveRackSound(instrument().id,sound().id,-1));
$("move-sound-down").addEventListener("click",()=>moveRackSound(instrument().id,sound().id,1));
$("duplicate-sound").addEventListener("click",()=>duplicateRackSound(instrument().id,sound().id));
$("remove-sound").addEventListener("click",()=>removeRackSound(instrument().id,sound().id));
$("convert-rack").addEventListener("click",()=>{
 if(!canConvertToRack(instrument()))return;
 modify(()=>convertToRack(instrument()));
});
function extractSoundToPianoRoll(instrumentId,soundId){
 if(!canMoveRackSoundToPianoRoll(score,instrumentId,soundId))return;
 closePicker();
 const source=score.instruments.find(item=>item.id===instrumentId);
 const sourceChunkIndex=source.chunks.findIndex(chunk=>chunk.id===selectedChunks.get(instrumentId));
 const sourceBar=selectedSlot.instrumentId===instrumentId?selectedSlot.bar:0;
 modify(()=>{
  const newId=moveRackSoundToPianoRoll(score,instrumentId,soundId);
  if(!newId)return;
  const pitched=score.instruments.find(item=>item.id===newId);
  selectedInstrumentId=newId;
  selectedSounds.delete(instrumentId);
  selectedSounds.set(newId,soundId);
  selectedNoteId=null;
  selectedSlot={instrumentId:newId,bar:sourceBar};
  selectedChunks.set(newId,pitched.chunks[Math.max(0,sourceChunkIndex)].id);
  if(!score.instruments.some(item=>item.id===instrumentId))
   selectedChunks.delete(instrumentId);
 });
}
$("convert-pitched").addEventListener("click",()=>extractSoundToPianoRoll(instrument().id,sound().id));
$("instrument-name").addEventListener("change", event => modify(() => instrument().name = event.target.value.trim() || "Instrument"));


$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
document.addEventListener("keydown", event => {
 const target = document.activeElement?.tagName;
 if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
  event.preventDefault(); event.shiftKey ? redo() : undo();
 } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
  event.preventDefault(); redo();
 } else if (event.code === "Space" && !event.repeat && !["INPUT","SELECT","TEXTAREA","BUTTON"].includes(target)) {
  event.preventDefault(); $("play").click();
 }
});
render();
if (cached) message("Local synth draft restored");
void loadDraft().then(raw=>{
 if(!raw || history.length || future.length)return;
 try {const restored=parse(raw);resetTo(restored);message("Browser draft restored");}
 catch(error){console.warn("Draft could not be restored",error);}
}).catch(()=>{});
