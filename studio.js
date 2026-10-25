import { create, makeInstrument, makeChunk, id, clone, parse, validate, filename } from "./schema.js";
import { play, audition, auditionChord, wav, primeSamples } from "./audio.js";
import { resizeNote } from "./noteEditing.js";
import { chunkIsPlaying, pianoScrubberX } from "./pianoPlayhead.js";
import { PRESETS, getPreset, makePatch, patchCopy, validatePatch } from "./synth.js";
import { renderPatchEditor } from "./instrumentUI.js";
import { SAMPLE_LIBRARY, makeSamplerPatch } from "./samples.js";
import { loadLibrarySample, makeSampleAsset, MAX_SCORE_BYTES, sampleForNote } from "./sampler.js";
import { sampleAsset } from "./samples.js";
import { renderSamplerEditor } from "./samplerUI.js";
import { loadDraft, saveDraft } from "./storage.js";
import { renderNoteExpression } from "./expressionUI.js";
import {createDial} from "./dial.js";
import {createSignalDisplay} from "./soundScope.js";
import {EXAMPLES,buildExample} from "./examples.js";
import {exportProject,importProject} from "./packageIO.js";
import {installMicrophoneRecorder} from "./microphoneUI.js";

const $ = key => document.getElementById(key);
const CACHE = "premidi-v5-draft";
const SAVED_SOUNDS = "premidi-user-sounds-v1";
// Recover the browser's own previous synth-only draft in place. Old exported
// formats deliberately aren't supported; this does not change file parsing.
const cached=(()=>{try{return parse(localStorage.getItem(CACHE)||"");}catch{return null;}})();
const savedSounds=(()=>{
 try {
  const entries=JSON.parse(localStorage.getItem(SAVED_SOUNDS)||"[]");
  return Array.isArray(entries)?entries.filter(item=>
   item && typeof item.id==="string" && item.id.length<80 &&
   typeof item.name==="string" && item.name.length<=60 && item.name.trim() &&
   validatePatch(item.patch).length===0).slice(0,100):[];
 }catch{return [];}
})();
let libraryMode="add",libraryCategory="All";
const inspectorViewport=window.matchMedia("(min-width:1100px)");
let inspectorState=inspectorViewport.matches?"expanded":"closed";
let loadingExample=false;
let score = cached || create();
let selectedInstrumentId = score.instruments[0].id;
let selectedNoteId = null;
let editingNoteEffects = false;
let selectedChunks = new Map();
let selectedSlot = { instrumentId: selectedInstrumentId, bar: 0 };
let history = [], future = [], playback = null, pendingPlay = false;
let playBar = -1, playStep = -1, pianoProgress = null, picker = null, pickerTrigger = null;
const SIGNALS = ["#08e4ec", "#ff416d", "#ba82eb", "#ffc266"];

// Audio assets are immutable blobs. Undo stores only mutable score structure
// plus a shallow list of shared samples, not 100 copies of multi-MB recordings.
const snapshot = document => {
 const {samples,...mutable}=document;
 return {...clone(mutable),samples:[...samples]};
};
const instrument = () => score.instruments.find(entry => entry.id === selectedInstrumentId) || score.instruments[0];
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
function message(text, error = false) {
 $("status").textContent = text;
 $("status").className = error ? "error" : "ok";
}
function store() {
 const current=score;
 void saveDraft(current).then(()=>message("Saved locally")).catch(()=>{
  // For constrained private-browser modes, small synth-only scores still fit.
  try {
   const json=JSON.stringify(current);
   if(json.length>800000)throw Error("large draft");
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
 const errors = validate(score);
 if (errors.length) {
  score = before;
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
  const el = button("", () => { closePicker(); focus(inst); }, "instrument-card" + (selected ? " active" : ""));
  el.style.setProperty("--track-accent", signal(inst));
  el.setAttribute("aria-pressed", String(selected));
  el.append(element("strong", inst.name), element("small", (getPreset(inst.patch.presetId)?.name ?? SAMPLE_LIBRARY.find(item=>item.id===inst.patch.presetId)?.name ?? savedSounds.find(item=>item.id===inst.patch.presetId)?.name ?? (inst.patch.type==="sample"?"Custom sample":"Custom synth")) + " · " + inst.chunks.length + (inst.chunks.length === 1 ? " chunk" : " chunks")));
  list.append(el);
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
 const isAudibleChunk = pianoProgress !== null &&
  (playback !== null || pendingPlay) &&
  chunkIsPlaying(score, currentInstrument.id, activeChunk.id, pianoProgress);
 marker.hidden = !isAudibleChunk;
 if (!isAudibleChunk) return;
 // The note-label gutter is 63px; the remaining width represents 16 steps.
 const x = pianoScrubberX(pianoProgress.step, grid.clientWidth);
 marker.style.transform = `translateX(${x}px)`;
}
function renderTimeline() {
 const root = $("arrangement");
 root.replaceChildren();
 root.style.setProperty("--bars", score.bars);
 const heading = element("div", undefined, "arrangement-head");
 heading.append(element("span", "INSTRUMENT"));
 for (let bar = 0; bar < score.bars; bar++) heading.append(element("span", String(bar + 1).padStart(2, "0")));
 root.append(heading);
 for (const inst of score.instruments) {
  const lane = element("div", undefined, "arrangement-row" + (selectedInstrumentId === inst.id ? " active" : ""));
  lane.style.setProperty("--track-accent", signal(inst));
  lane.dataset.instrumentId = inst.id;
  const name = button(inst.name, () => { closePicker(); focus(inst); }, "label instrument-lane-label");
  lane.append(name);
  inst.timeline.forEach((chunkId, bar) => {
   const chunk = inst.chunks.find(candidate => candidate.id === chunkId);
   const active = selectedSlot.instrumentId === inst.id && selectedSlot.bar === bar;
   const clip = button(chunk?.name ?? "+", () => openPicker(inst.id, bar, clip),
    "clip" + (chunk ? "" : " empty") + (active ? " selected" : ""));
   clip.dataset.bar = String(bar);
   clip.setAttribute("aria-label", inst.name + ", bar " + (bar + 1) + ": " + (chunk?.name ?? "Empty") + ". Choose chunk");
   clip.setAttribute("aria-haspopup", "dialog");
   clip.setAttribute("aria-expanded", "false");
   clip.title = inst.name + " / bar " + (bar + 1);
   lane.append(clip);
  });
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
 const add = button("+ New chunk", () => {
  closePicker();
  modify(() => {
   const next = makeChunk("Chunk " + (inst.chunks.length + 1));
   inst.chunks.push(next);
   inst.timeline[bar] = next.id;
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
function renderNotes() {
 const root = $("piano"), inst = instrument(), chunk = chunkFor(inst);
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
 },instrument().patch.bend);
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
 const inst=instrument(),patch=inst.patch;
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
  const next=patchCopy(instrument().patch);
  let parent=next;
  for(let i=0;i<path.length-1;i++)parent=parent[path[i]]??={};
  parent[path[path.length-1]]=value;
  scope(next);
 };
 const onChange=(path,value)=>modify(()=>{
  const target=instrument().patch;
  let owner=target;
  for(let i=0;i<path.length-1;i++)owner=owner[path[i]]??={};
  owner[path[path.length-1]]=value;
  target.presetId="custom";
 });
 const volume=$("instrument-volume-dial");
 volume.replaceChildren();
 volume.append(createDial({label:"Volume",min:0,max:1,step:.01,display:"percent"},
  inst.volume,value=>modify(()=>{instrument().volume=value;})));
 if(patch.type==="sample"){
  renderSamplerEditor($("synth-editor"),patch,onChange,
   patch.zones.map(zone=>score.samples.find(x=>x.id===zone.assetId)?.name||zone.assetId).join(" / "),
   ()=>$("sample-file").click(),preview);
 }else renderPatchEditor($("synth-editor"),patch,onChange,preview);
 $("remove-instrument").disabled=score.instruments.length===1;
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
 for(const name of ["closed","compact","expanded"])work.classList.toggle("inspector-"+name,inspectorState===name);
 const opened=inspectorState!=="closed";
 $("sound-section").setAttribute("aria-hidden",String(!opened));
 $("sound-toggle").setAttribute("aria-expanded",String(opened));
 $("sound-toggle").textContent=opened?"✓ Sound":"Sound";
 $("sound-expand").textContent=inspectorState==="expanded"?"Compact":"Expand";
 $("sound-expand").setAttribute("aria-label",inspectorState==="expanded"?"Show compact sound controls":"Expand sound editor");
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
 setInspector(inspectorState==="closed"?(inspectorViewport.matches?"expanded":"compact"):"closed");
});
$("sound-expand").addEventListener("click",()=>setInspector(inspectorState==="expanded"?"compact":"expanded"));
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
 }
 selectedSlot.bar = Math.min(selectedSlot.bar, count - 1);
}));
$("add-instrument").addEventListener("click",()=>openLibrary("add"));
$("change-sound").addEventListener("click",()=>openLibrary("replace"));
$("close-library").addEventListener("click",()=>$("instrument-dialog").close());
function addAuthoredSample(asset,options={},mode="add"){
 const {name=asset.name,root=60,followPitch=true}=options;
 if(mode==="add"&&score.instruments.length>=12){
  message("The composition supports up to 12 instruments.",true);return false;
 }
 const patch={type:"sample",presetId:"custom",zones:[{assetId:asset.id,root}],
  followPitch,transpose:0,gain:.9,attack:.005,release:.17,pan:0,
  movement:{rate:5,depth:0,delay:0,glide:0,glideTime:.18,tremolo:0,tremoloRate:5,tone:0,toneRate:2},
  bend:{shape:"straight",amount:2,rate:4}};
 const ok=modify(()=>{
  score.samples.push(asset);
  if(mode==="add"){
   const inst=makeInstrument(score.instruments.length+1,score.bars);
   inst.name=name.slice(0,60);inst.patch=patch;
   score.instruments.push(inst);
   selectedInstrumentId=inst.id;
   selectedSlot={instrumentId:inst.id,bar:0};
   selectedChunks.set(inst.id,inst.chunks[0].id);
  }else{
   instrument().patch=patch;
   instrument().name=name.slice(0,60);
  }
 });
 if(ok){
  if($("instrument-dialog").open)$("instrument-dialog").close();
  if(playback)void primeSamples(score).catch(error=>message(error.message,true));
 }
 return ok;
}
let recordingMode="add";
const recorder=installMicrophoneRecorder({
 get:$,
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
 recordingMode=mode;
 if($("instrument-dialog").open)$("instrument-dialog").close();
 recorder.open();
}
$("record-sound").addEventListener("click",()=>openRecorder("add"));
$("sample-file").addEventListener("change",async event=>{
 const file=event.currentTarget.files?.[0];
 if(!file)return;
 try{
  if(file.size>1_000_000)throw Error("Sample must be smaller than 1 MB.");
  const ext=file.name.split(".").pop()?.toLowerCase();
  const mime=ext==="wav"?"audio/wav":ext==="ogg"?"audio/ogg":ext==="mp3"?"audio/mpeg":"";
  const asset=makeSampleAsset("custom-"+id(),file.name,mime,
   new Uint8Array(await file.arrayBuffer()),"Imported by author: "+file.name);
  const mode=$("instrument-dialog").open?libraryMode:"replace";
  if(addAuthoredSample(asset,{name:file.name.replace(/\.[^.]+$/,""),followPitch:true},mode))
   message("Imported "+file.name+". Export includes its separate audio file.");
 }catch(error){message("Could not import audio: "+error.message,true);}
 finally{event.currentTarget.value="";}
});
$("save-sound").addEventListener("click",()=>{
 const inst=instrument();
 const suggested=(getPreset(inst.patch.presetId)?.name||inst.name)+" variation";
 const name=prompt("Name your sound preset:",suggested)?.trim();
 if(!name)return;
 if(name.length>60)return message("Preset name must be 60 characters or less.",true);
 if(savedSounds.length>=100)return message("Your sound library contains 100 presets.",true);
 const item={id:"user-"+id(),name,category:"Mine",description:"Your saved sound",patch:patchCopy(inst.patch)};
 if(inst.patch.type==="sample") {
  item.samples=inst.patch.zones.filter(zone=>!sampleAsset(zone.assetId))
   .map(zone=>score.samples.find(asset=>asset.id===zone.assetId));
  if(item.samples.some(value=>!value))return message("The sample is missing audio data.",true);
 }
 item.patch.presetId=item.id;
 try {
  localStorage.setItem(SAVED_SOUNDS,JSON.stringify([...savedSounds,item]));
  savedSounds.push(item);
  modify(()=>{instrument().patch.presetId=item.id;});
  message("Saved "+name+" in your browser's sound library.");
 } catch {
  message("Browser storage is unavailable. Your composition still contains this sound.",true);
 }
});
function allSounds(){return [...PRESETS,...SAMPLE_LIBRARY,...savedSounds];}
function openLibrary(mode) {
 closePicker();
 if(mode==="add"&&score.instruments.length>=12)return;
 libraryMode=mode;
 libraryCategory="All";
 renderLibrary();
 const dialog=$("instrument-dialog");
 if(!dialog.open)dialog.showModal();
}
const builtinCache=new Map();
async function resolveSamples(preset) {
 if(preset.patch?.type==="sample") {
  return Promise.all(preset.patch.zones.map(async zone=>{
   const existing=(preset.samples||[]).find(item=>item.id===zone.assetId)
    ||score.samples.find(item=>item.id===zone.assetId);
   if(existing)return existing;
   if(sampleAsset(zone.assetId))return loadLibrarySample(zone.assetId);
   throw Error("Saved sample is missing its audio: "+zone.assetId);
  }));
 }
 if(!preset.assets)return [];
 return Promise.all(preset.assets.map(async assetId=>{
  const existing=score.samples.find(asset=>asset.id===assetId);
  if(existing)return existing;
  if(!builtinCache.has(assetId))builtinCache.set(assetId,loadLibrarySample(assetId).catch(error=>{
   builtinCache.delete(assetId);throw error;
  }));
  return builtinCache.get(assetId);
 }));
}
async function chooseSound(preset) {
 const useMode=libraryMode;
 const dialog=$("instrument-dialog");
 message("Loading "+preset.name+"...");
 try {
  const assets=await resolveSamples(preset);
  const patch=preset.category==="Mine"?patchCopy(preset.patch):
   preset.assets?makeSamplerPatch(preset):makePatch(preset.id);
  patch.presetId=preset.id;
  const ok=modify(()=>{
   for(const asset of assets)if(!score.samples.some(existing=>existing.id===asset.id))
    score.samples.push(asset);
   if(useMode==="add") {
    const inst=makeInstrument(score.instruments.length+1,score.bars);
    inst.name=preset.name;inst.patch=patch;
    score.instruments.push(inst);selectedInstrumentId=inst.id;
    selectedSlot={instrumentId:inst.id,bar:0};
    selectedChunks.set(inst.id,inst.chunks[0].id);
   } else {
    instrument().patch=patch;
    instrument().name=preset.name;
   }
  });
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
  const patch=preset.category==="Mine"?patchCopy(preset.patch):
   preset.assets?makeSamplerPatch(preset):makePatch(preset.id);
  const pitch=preset.category==="Bass"?48:preset.category==="Guitars"?57:69;
  const inst={...instrument(),patch,volume:.8};
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
 if(libraryMode==="add"||libraryMode==="replace") {
  const record=button("● Record a sound",()=>openRecorder(libraryMode),"library-import library-record");
  const personal=button("＋ Import audio file",()=>$("sample-file").click(),"library-import");
  list.append(record,personal);
 }
 for(const preset of allSounds().filter(p=>libraryCategory==="All"||p.category===libraryCategory)) {
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
$("remove-instrument").addEventListener("click", () => {
 const inst = instrument();
 if (!confirm("Remove " + inst.name + " and all its chunks?")) return;
 closePicker();
 modify(() => {
  score.instruments = score.instruments.filter(entry => entry.id !== inst.id);
  selectedInstrumentId = score.instruments[0].id;
  selectedSlot = {instrumentId:selectedInstrumentId,bar:0};
 });
});
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
  inst.timeline = inst.timeline.map(value => value === chunk.id ? null : value);
  selectedChunks.set(inst.id, inst.chunks[0].id);
 });
});
$("chunk-name").addEventListener("change", event => modify(() => chunkFor(instrument()).name = event.target.value.trim() || "Chunk"));
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
