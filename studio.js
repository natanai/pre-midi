import {renderCutoffAutomation} from "./automationUI.js";
import {upgradeBeatFeatures} from "./schema.js";
import {upgradeSongFeatures} from "./songModel.js";
import {MAX_SOUNDS,referencedSampleIds,selectionOperation,canConvertToRack,convertToRack} from "./soundModel.js";
import {instrumentDeleteLabel,soundDeleteLabel,deleteInstrumentFromBeat,deleteSoundFromBeat,canMoveRackSoundToPianoRoll,moveRackSoundToPianoRoll} from "./entityActions.js";
import { create, makeInstrument, makeSound, makeChunk, id, clone, parse, validate, filename } from "./schema.js";
import { play, audition, auditionChord, wav, primeSamples, nativeEnabled, cancelNativeTransport } from "./audio.js";
import { resizeNote, moveNote } from "./noteEditing.js";
import { SCALE_ROOTS,SCALE_MODES,normalizeScaleGuide,scaleGuideForBeat,isPitchInScaleAtStep,scaleDirectionAtStep } from "./scaleGuide.js";
import { chunkIsPlaying, pianoScrubberX } from "./pianoPlayhead.js";
import {pianoKeyGeometry} from "./pianoKeyboard.js";
import {placementFor,phraseInstances,chunkProgress} from "./arrangement.js";
import {attachNumberScrub} from "./dragNumber.js";
import { PRESETS, getPreset, makePatch, patchCopy, validatePatch } from "./synth.js";
import { renderPatchEditor,PRIMARY_SYNTH_FIELDS } from "./instrumentUI.js";
import { SAMPLE_LIBRARY, makeSamplerPatch } from "./samples.js";
import { DRUM_RACKS } from "./drumRacks.js";
import { loadLibrarySample, makeSampleAsset, MAX_BEAT_BYTES, sampleForNote } from "./sampler.js";
import { sampleAsset } from "./samples.js";
import { renderSamplerEditor } from "./samplerUI.js";
import {sampleTone} from "./audioEffects.js";
import { loadDraft, saveDraft, savePresetAssets } from "./storage.js";
import { renderNoteExpression } from "./expressionUI.js";
import {createDial} from "./dial.js";
import {createSignalDisplay} from "./soundScope.js";
import {EXAMPLES,EXAMPLE_SOUND_PRESETS,buildExample} from "./examples.js";
import {exportProject,importProject} from "./packageIO.js";
import {installMicrophoneRecorder} from "./microphoneUI.js";
import {getAsset} from "./assetRegistry.js";
import {createSong,addBeat,addSongTrack,addBeatClip,addVocalTake,validateSong} from "./songModel.js";
import {makeRecordingAsset} from "./recordingAssets.js";
import {prepareSongTake,waveformForTake,songCountIn} from "./songRecorder.js";
import {exportSongProject,importSongProject,parseSong} from "./songIO.js";
import {readZip} from "./zip.js";
import {installSongUI} from "./songUI.js";
import {installDesktopUI} from "./desktopUI.js";

const $ = key => document.getElementById(key);
let assetsReady=Promise.resolve();
const CACHE = "premidi-v5-draft";
const SAVED_SOUNDS = "premidi-user-sounds-v2";
// Retain the previous fallback key. Native v5 drafts and files migrate through
// the same parser, including safe hit conversion and preserved musical events.
const parseDocument=raw=>{
 const candidate=JSON.parse(raw);
 return candidate.kind==="song"?parseSong(raw):parse(raw);
};
const cached=(()=>{try{return parseDocument(localStorage.getItem(CACHE)||"");}catch{return null;}})();
const savedSounds=(()=>{
 try {
  const entries=JSON.parse(localStorage.getItem(SAVED_SOUNDS)||localStorage.getItem("premidi-user-sounds-v1")||"[]");
  return Array.isArray(entries)?entries.filter(item=>
   item && typeof item.id==="string" && item.id.length<80 &&
   typeof item.name==="string" && item.name.length<=60 && item.name.trim() &&
   (item.sounds ? validRackPreset(item) : validatePatch(item.patch).length===0)).slice(0,100):[];
 }catch{return [];}
})();
function validRackPreset(item){
 const trial=create(),inst=trial.instruments[0];
 inst.layout="rack";inst.sounds=item.sounds;trial.samples=item.samples||[];upgradeBeatFeatures(trial);
 return validate(trial).length===0;
}
let libraryMode="add",libraryCategory="All",libraryContext=null;
const inspectorViewport=window.matchMedia("(min-width:1100px)");
let inspectorState=inspectorViewport.matches?"expanded":"closed";
let loadingExample=false;
let song=cached?.kind==="song"?cached:null;
let beat=song?.beats[0]||cached||create();
let songExpanded=!!song,selectedBeatId=beat.id,songUI=null;
let selectedInstrumentId=beat.instruments[0].id;
let selectedNoteId = null;
let selectedSounds=new Map();
let editingNoteEffects = false;
let selectedChunks = new Map();
let selectedSlot = { instrumentId: selectedInstrumentId, bar: 0 };
let history = [], future = [], playback = null, pendingPlay = false, playbackGeneration=0;
let vocalTake=null,vocalRequest=false,vocalFinalizing=false,vocalStartStep=0;
let voiceCountAbort=null,voiceToken=0;
let soundPreviewTimer=null;
let playBar = -1, playStep = -1, pianoProgress = null, picker = null, pickerTrigger = null;
const SIGNALS = ["#08e4ec", "#ff416d", "#ba82eb", "#ffc266"];
const DEFAULT_NOTE_LEVEL=.9;

// Scale controls are non-destructive editor preferences scoped to each Beat.
// Canonical notes and compact .premidi playback instructions stay unchanged.
const SCALE_PREFS = "premidi-scale-guide-v1";
const scaleGuides = new Map();
const PIANO_KEYS_PREF = "premidi-piano-keys-v1";
let showPianoKeys = true;
try {showPianoKeys=localStorage.getItem(PIANO_KEYS_PREF)!=="off";}catch{}
let scaleFocusStep=0;
try {
 const stored=JSON.parse(localStorage.getItem(SCALE_PREFS)||"{}");
 if(stored && typeof stored==="object" && !Array.isArray(stored)){
  for(const [key,value] of Object.entries(stored).slice(-128))
   scaleGuides.set(key,normalizeScaleGuide(value));
 }
}catch{}
function scaleGuideFor(targetBeat=beat){
 return scaleGuideForBeat(scaleGuides,targetBeat);
}
function setBeatScaleGuide(targetBeat,guide) {
 // Canonical keys use only Beat IDs. Old per-instrument keys are migrated
 // when the beat scale changes, without touching saved note data.
 const key=targetBeat.id;
 for(const inst of targetBeat.instruments)scaleGuides.delete(key+":"+inst.id);
 scaleGuides.delete(key);
 scaleGuides.set(key,normalizeScaleGuide(guide));
 while(scaleGuides.size>128)scaleGuides.delete(scaleGuides.keys().next().value);
 try {localStorage.setItem(SCALE_PREFS,JSON.stringify(Object.fromEntries(scaleGuides)));}catch{}
}
function updateScaleGuide(change) {
 setBeatScaleGuide(beat,{...scaleGuideFor(),...change});
 renderNotes();
}
function initializeScaleControls() {
 const root=$("scale-root"),mode=$("scale-mode");
 SCALE_ROOTS.forEach((name,index)=>{
  const option=element("option",name);option.value=String(index);root.append(option);
 });
 SCALE_MODES.forEach(({id,name})=>{
  const option=element("option",name);option.value=id;mode.append(option);
 });
 root.addEventListener("change",event=>updateScaleGuide({root:Number(event.target.value)}));
 mode.addEventListener("change",event=>updateScaleGuide({mode:event.target.value}));
 $("scale-lock").addEventListener("change",event=>updateScaleGuide({lock:event.target.checked}));
 $("piano-keys").addEventListener("click",()=>{
  showPianoKeys=!showPianoKeys;
  try {localStorage.setItem(PIANO_KEYS_PREF,showPianoKeys?"on":"off");}catch{}
  renderNotes();
 });
}
function renderScaleControls(inst) {
 const rack=inst.layout==="rack";
 // The Beat scale remains visible even while editing its drum racks.
 document.querySelector(".piano-tools").hidden=rack;
 const guide=scaleGuideFor();
 $("scale-root").value=String(guide.root);
 $("scale-mode").value=guide.mode;
 $("scale-lock").checked=guide.lock;
 $("scale-lock").disabled=guide.mode==="chromatic";
 $("piano-keys").setAttribute("aria-pressed",String(showPianoKeys));
 $("piano-keys").title=showPianoKeys?"show note names":"show piano keys";
}

// Audio assets are immutable blobs. Undo stores only mutable beat structure
// plus a shallow list of shared samples, not 100 copies of multi-MB recordings.
const snapshot = document => {
 if(document.kind==="song")return clone(document);
 const {samples,...mutable}=document;
 return {...clone(mutable),samples:[...samples]};
};
const currentDocument=()=>song||beat;
function restoreDocument(document){
 if(document.kind==="song"){
  song=document;beat=song.beats.find(item=>item.id===selectedBeatId)||song.beats[0];
 }else{song=null;beat=document;songExpanded=false;}
 selectedBeatId=beat.id;repairSelection();
}
function selectBeat(beatId){
 const candidate=song?.beats.find(item=>item.id===beatId);
 if(!candidate)return;
 closePicker();selectedBeatId=beatId;beat=candidate;
 selectedInstrumentId=beat.instruments[0].id;
 selectedChunks=new Map();selectedSounds=new Map();
 selectedSlot={instrumentId:selectedInstrumentId,bar:0};
 selectedNoteId=null;editingNoteEffects=false;render();
}
const instrument = () => beat.instruments.find(entry => entry.id === selectedInstrumentId) || beat.instruments[0];
const sound = (inst=instrument()) => inst.sounds.find(entry=>entry.id===selectedSounds.get(inst.id))||inst.sounds[0];
const chunkFor = (inst) => inst.chunks.find(entry => entry.id === selectedChunks.get(inst.id)) || inst.chunks[0];
const signal = inst => SIGNALS[Math.max(0, beat.instruments.findIndex(entry => entry.id === inst.id)) % SIGNALS.length];

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
 const current=currentDocument(),generation=++saveGeneration;
 $("status").dataset.saving="true";
 message("Saving locally…");
 void saveDraft(current).then(()=>{if(generation===saveGeneration){$("status").dataset.saving="false";if($("status").textContent==="Saving locally…")message("Saved locally");}}).catch(()=>{
  if(generation!==saveGeneration)return;
  $("status").dataset.saving="error";
  // For constrained private-browser modes, small synth-only scores still fit.
  try {
   const json=JSON.stringify(current);
   const assets=current.kind==="song"?current.beats.flatMap(entry=>entry.samples):current.samples;
    if(assets.length||json.length>800000)throw Error("large or sampled draft");
   localStorage.setItem(CACHE,json);
   $("status").dataset.saving="false";
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
function setPlaybackButton(isPlaying,playingSong=!!(song&&songExpanded)){
 const control=$("play");
 control.textContent=isPlaying?"■ stop":"▶ play";
 control.setAttribute("aria-label",(isPlaying?"stop ":"play ")+(playingSong?"song":"beat"));
 const pause=$("native-pause");if(pause){pause.disabled=!isPlaying;pause.textContent=playback?.paused?'resume':'pause';}
}
const voiceDialog=$("voice-dialog");
function voiceStatus(label,error=false){
 const output=$("voice-status");output.textContent=label;output.dataset.error=String(error);
}
function showVocalState(active=false){
 $("song-record").textContent="● voice";
 const control=$("voice-start");
 control.textContent=active?"■ stop + save":"▶ ● play + record";
 control.setAttribute("aria-pressed",String(active));
 control.disabled=vocalFinalizing;
}
function cancelVoiceCountdown(){
 voiceToken++;voiceCountAbort?.abort();voiceCountAbort=null;
}
async function finalizeVocalTake(){
 const session=vocalTake;
 if(!session)return;
 vocalTake=null;vocalFinalizing=true;showVocalState(false);
 voiceStatus("Saving vocal recording…");
 try{
  const take=await session.finish();
  if(!take||take.durationSeconds<=take.trimSeconds+.07){
   message("Recording was too short to save.",true);return;
  }
  const assetId="voice-"+id();
  const asset=makeRecordingAsset(assetId,"Voice "+((song?.recordings?.length||0)+1),
   take.mime,take.bytes,{durationSeconds:take.durationSeconds,trimSeconds:take.trimSeconds});
  if(!song)throw Error("No Song is available for this take.");
  // Persist the recording reference immediately; waveform decoding is optional.
  const saved=modifySong(()=>addVocalTake(song,asset,{startStep:vocalStartStep}));
  if(saved){
   message("Saved "+asset.name+" · export Song to keep its audio asset.");
   voiceStatus("Saved "+asset.name+" at bar "+(Math.floor(vocalStartStep/16)+1)+".");
   void waveformForTake(take.bytes).then(peaks=>{
    if(song?.recordings?.some(item=>item.id===asset.id))
     modifySong(()=>{song.recordings.find(item=>item.id===asset.id).waveform=peaks;});
   }).catch(error=>console.warn("Could not read vocal waveform",error));
  }
  }catch(error){
  voiceStatus("Could not save vocal take: "+error.message,true);
  message("Could not save vocal take: "+error.message,true);
 }
 finally{vocalFinalizing=false;showVocalState(false);}
}
function stop() {
 playbackGeneration++;
 if(window.__TAURI__)void cancelNativeTransport().catch(error=>console.warn('Native stop:',error));
 if(vocalTake&&!playback)void finalizeVocalTake();
 if (playback) playback.stop();
 playback = null;
 pendingPlay = false;
 playBar = playStep = -1;
 pianoProgress = null;
 setPlaybackButton(false);
 $("position").textContent="1:1";
 $("position").setAttribute("aria-label","bar 1, beat 1");
 songUI?.setPosition(-1);
 paintPlayhead();
}
let nativeEditTimer;
function refreshNativePlayback(){
 clearTimeout(nativeEditTimer);const current=playback;if(current?.backend!=='native-cpp')return;
 nativeEditTimer=setTimeout(()=>{if(playback===current)void current.refresh().catch(error=>{if(playback===current)message('playback edit: '+error.message,true);});},90);
}
function commitChange(before){
 history.push(before);
 if(history.length>100)history.shift();
 future=[];store();render();
 refreshNativePlayback();
 return true;
}
function modify(change){
 const before=snapshot(currentDocument());
 change();
 const referenced=referencedSampleIds(beat.instruments);
 beat.samples=beat.samples.filter(asset=>referenced.has(asset.id));
 if(song)upgradeSongFeatures(song);else upgradeBeatFeatures(beat);
 const errors=validate(beat);
 if(song)errors.push(...validateSong(song));
 if(errors.length){restoreDocument(before);render();message(errors[0],true);return false;}
 return commitChange(before);
}
function modifySong(change){
 if(!song)return false;
 const before=snapshot(song);
 if(change==="add-track")addSongTrack(song);
 else change();
 upgradeSongFeatures(song);
 const errors=validateSong(song);
 if(errors.length){restoreDocument(before);render();message(errors[0],true);return false;}
 return commitChange(before);
}
function addSongBeat(source,{inheritScale=false}={}){
 if(!song)return;
 const inheritedGuide=inheritScale?scaleGuideFor():null;
 let added;
 const saved=modifySong(()=>{
  added=addBeat(song,source,{independent:song.beats.some(b=>b.id===source.id)});
  const lane=addSongTrack(song,"beat");
  addBeatClip(song,lane.id,added.id,0);
  beat=added;selectedBeatId=beat.id;
  selectedInstrumentId=beat.instruments[0].id;
  selectedChunks=new Map();selectedSounds=new Map();
  selectedSlot={instrumentId:selectedInstrumentId,bar:0};
 });
 if(saved&&inheritedGuide){
  setBeatScaleGuide(added,inheritedGuide);
  renderNotes();
 }
}
function resetTo(next) {
 if(vocalTake||vocalFinalizing||vocalRequest){
  message("Stop recording before opening another project.",true);return;
 }
 closePicker();
 stop();
 if(next.kind==="song"){song=next;beat=song.beats[0];songExpanded=true;}
 else{song=null;beat=next;songExpanded=false;}
 selectedBeatId=beat.id;
 selectedNoteId=null;
 editingNoteEffects=false;
 selectedInstrumentId = beat.instruments[0].id;
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
 future.push(snapshot(currentDocument()));
 restoreDocument(history.pop());
 store();
 render();
 refreshNativePlayback();
}
function redo() {
 if (!future.length) return;
 closePicker();
 history.push(snapshot(currentDocument()));
 restoreDocument(future.pop());
 store();
 render();
 refreshNativePlayback();
}
function repairSelection() {
 if (!beat.instruments.some(entry => entry.id === selectedInstrumentId)) selectedInstrumentId = beat.instruments[0].id;
 selectedSlot.instrumentId = selectedInstrumentId;
 selectedSlot.bar = Math.min(selectedSlot.bar, beat.bars - 1);
 for (const entry of beat.instruments) {
  if(!entry.sounds.some(sound=>sound.id===selectedSounds.get(entry.id)))selectedSounds.set(entry.id,entry.sounds[0].id);
  if (!entry.chunks.some(chunk => chunk.id === selectedChunks.get(entry.id))) {
   selectedChunks.set(entry.id, entry.chunks[0].id);
  }
 }
}
function download(blob, name) {
 if(window.premidiDesktop)return blob.arrayBuffer().then(bytes=>window.premidiDesktop.saveFile(name,bytes));
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
 for (const inst of beat.instruments) {
  const selected = inst.id === selectedInstrumentId;
  const item=element("div",undefined,"instrument-entry");
  const el = button("", () => { closePicker(); focus(inst); }, "instrument-card" + (selected ? " active" : ""));
  el.style.setProperty("--track-accent", signal(inst));
  el.setAttribute("aria-pressed", String(selected));
  el.append(element("strong",inst.name));
  if(inst.layout==="rack")el.append(element("small",inst.sounds.length+" sounds"));
  item.append(el,actionMenu("Actions for "+inst.name,[
   {label:"Rename",run:()=>renameInstrument(inst)},
   {label:instrumentDeleteLabel(inst),danger:true,run:()=>removeInstrument(inst.id)}
  ],"instrument-actions"));
  list.append(item);
 }
 $("add-instrument").disabled = beat.instruments.length >= 12;
}
function paintPlayhead() {
 for(const clip of $("arrangement").querySelectorAll(".clip")){
  const start=Number(clip.dataset.start),end=start+Number(clip.dataset.length);
  const current=playBar*16;
  clip.classList.toggle("playing",playBar>=0&&
   (clip.classList.contains("phrase-clip")?
    start<current+16&&end>current:Number(clip.dataset.bar)===playBar));
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
  chunkProgress(beat,currentInstrument.id,activeChunk.id,pianoProgress) : null;
 marker.hidden = relative===null;
 if(relative===null)return;
 // The painted grid gutter may be wider in piano-keyboard mode.
 const gutter=currentInstrument.layout==="rack"?128:
  (grid.querySelector(".piano-row .note-name")?.getBoundingClientRect().width??63);
 const x=pianoScrubberX(relative,grid.clientWidth,gutter);
 marker.style.transform = `translateX(${x}px)`;
}
function renderTimeline(){
 const root=$("arrangement");
 root.replaceChildren();
 root.style.setProperty("--bars",beat.bars);
 const heading=element("div",undefined,"arrangement-head");
 heading.append(element("span","INSTRUMENT"));
 for(let bar=0;bar<beat.bars;bar++)
  heading.append(element("span",String(bar+1).padStart(2,"0")));
 root.append(heading);
 for(const inst of beat.instruments){
  const lane=element("div",undefined,"arrangement-row"+
   (selectedInstrumentId===inst.id?" active":""));
  lane.style.setProperty("--track-accent",signal(inst));
  lane.dataset.instrumentId=inst.id;
  lane.append(button(inst.name,()=>{closePicker();focus(inst);},"label instrument-lane-label"));
  // Empty bar positions are insertion targets. Occupied positions leave a
  // transparent grid cell; their ONE visible, clickable chunk is placed
  // at its actual musical start instead of in a second visualization row.
  inst.timeline.forEach((chunkId,bar)=>{
   if(chunkId){
    const cell=element("span",undefined,"timeline-slot assigned");
    cell.setAttribute("aria-hidden","true");
    lane.append(cell);
    return;
   }
   const empty=button("+",()=>openPicker(inst.id,bar,empty),"clip empty timeline-slot");
   empty.dataset.bar=String(bar);
   empty.setAttribute("aria-label",inst.name+", bar "+(bar+1)+": Empty. Choose chunk");
   empty.setAttribute("aria-haspopup","dialog");
   empty.setAttribute("aria-expanded","false");
   lane.append(empty);
  });
  // The phrase itself is the editable surface. Each repeated instance opens
  // the same placement controls; no decorative duplicate below the bar.
  for(const phrase of phraseInstances(beat,inst)){
   const length=Math.min(phrase.length,beat.bars*16-phrase.start);
   const timing=placementFor(inst,phrase.bar);
   const selected=selectedSlot.instrumentId===inst.id&&selectedSlot.bar===phrase.bar;
   const repeat=phrase.index>0;
   const label=phrase.chunk.name+(repeat?" ↻":"");
   const clip=button(label,()=>openPicker(inst.id,phrase.bar,clip),
    "clip phrase-clip"+(repeat?" repeated":"")+(selected?" selected":""));
   clip.dataset.bar=String(phrase.bar);
   clip.dataset.sourceBar=String(phrase.bar);
   clip.dataset.repeat=String(phrase.index);
   clip.dataset.start=String(phrase.start);
   clip.dataset.length=String(length);
   clip.style.setProperty("--phrase-start",String(phrase.start/(beat.bars*16)));
   clip.style.setProperty("--phrase-width",String(length/(beat.bars*16)));
   clip.setAttribute("aria-label",inst.name+": "+phrase.chunk.name+
    (repeat?", repetition "+(phrase.index+1):"")+
    ", starts at step "+(phrase.start+1)+" of the beat"+
    ", source bar "+(phrase.bar+1)+", offset "+timing.offset+
    ", phrase length "+timing.length+". Edit placement");
   clip.setAttribute("aria-haspopup","dialog");
   clip.setAttribute("aria-expanded","false");
   clip.title=clip.getAttribute("aria-label");
   lane.append(clip);
  }
  root.append(lane);
 }
 paintPlayhead();
}
function place(instId, bar, chunkId) {
 closePicker();
 const inst = beat.instruments.find(x => x.id === instId);
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
 const inst = beat.instruments.find(candidate => candidate.id === instId);
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
      '.arrangement-row[data-instrument-id="'+inst.id+'"] .phrase-clip[data-source-bar="'+bar+'"][data-repeat="0"]');
     if(trigger)openPicker(inst.id,bar,trigger);
    }
   });
   attachNumberScrub(value);
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
   {label:"Move to piano roll",disabled:!canMoveRackSoundToPianoRoll(beat,inst.id,entry.id),
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
    if(existing&&editingNoteEffects){selectedNoteId=existing.id;renderNotes();renderSound();return;}
    if(existing){selectedNoteId=null;modify(()=>{chunk.notes=chunk.notes.filter(note=>note.id!==existing.id);});return;}
    const note={id:id(),soundId:entry.id,start:step,duration:1,velocity:DEFAULT_NOTE_LEVEL};
    selectedNoteId=editingNoteEffects?note.id:null;
    if(modify(()=>chunk.notes.push(note))&&!playback&&!pendingPlay)
     void audition(inst,entry.referencePitch,beat,{soundId:entry.id,velocity:note.velocity}).catch(()=>{});
   },"note rack-step"+(step%4===0?" beat":"")+(existing?" filled":"")+
    (editingNoteEffects&&existing?.id===selectedNoteId?" selected":"")+
    (existing?.bend?.shape&&existing.bend.shape!=="straight"?" bent":""));
   cell.setAttribute("aria-label",entry.name+", step "+(step+1)+(existing?", hit; "+Math.round(existing.velocity*100)+"% level":"; add hit"));
   cell.setAttribute("aria-pressed",String(!!existing));
   cell.title=existing?(editingNoteEffects?"Edit hit effects":"Remove hit")+" · right-click effects":"Add hit";
   cell.addEventListener("contextmenu",event=>{
    // Only actual hits open the inspector; retain the native menu on empty steps.
    const hit=chunk.notes.find(note=>note.soundId===entry.id&&note.start===step);
    if(!hit)return;
    event.preventDefault();
    selectedSounds.set(inst.id,entry.id);
    setNoteEffectsMode(true,hit.id,false);
   });
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
 renderNoteExpression($("note-expression"),note,entry.name,note?note.duration*60/beat.bpm/4:0,
  bend=>modify(()=>{note.bend=bend;}),
  ()=>modify(()=>{chunk.notes=chunk.notes.filter(item=>item.id!==note.id);selectedNoteId=null;}),
  ()=>{void audition(inst,entry.referencePitch,beat,{soundId:entry.id,velocity:note.velocity,bend:note.bend}).catch(error=>message(error.message,true));},entry.patch.bend,level=>{
   if(modify(()=>{note.velocity=level;})&&!playback&&!pendingPlay)
    void audition(inst,entry.referencePitch,beat,{soundId:entry.id,velocity:level,bend:note.bend}).catch(error=>message("Couldn't preview hit: "+error.message,true));
  });

}
// Feedback belongs to the studio keyboard, never to saved notes or audio.
function tapPianoKey(pitch) {
 const key=$("piano").querySelector('.piano-key[data-pitch="'+pitch+'"]');
 if(!key)return;
 key.classList.remove("pressed");
 // Let another click on the same pitch restart the small tactile animation.
 void key.offsetWidth;
 key.classList.add("pressed");
 setTimeout(()=>key.classList.remove("pressed"),220);
}
function renderNotes() {
 const root = $("piano"), inst = instrument(), chunk = chunkFor(inst);
 root.classList.toggle("sound-rack",inst.layout==="rack");
 root.classList.toggle("piano-keyboard",inst.layout!=="rack"&&showPianoKeys);
 root.setAttribute("aria-label",inst.layout==="rack"?"Sound rack":"Piano roll");
 renderScaleControls(inst);
 if(inst.layout==="rack"){renderRack(root,inst,chunk);return;}
 const scroll = root.parentElement, top = scroll.scrollTop, left = scroll.scrollLeft;
 root.replaceChildren();
 root.style.setProperty("--track-accent", signal(inst));
 const scaleGuide=scaleGuideFor();
 const scaleActive=scaleGuide.mode!=="chromatic";
 const scaleMode=SCALE_MODES.find(mode=>mode.id===scaleGuide.mode);
 const scaleName=scaleMode?.name||"chromatic";
 const directionalScale=!!scaleMode?.descendingSteps;
 const keys=[];
 const keyByPitch=new Map();
 const rowPreviews=new Map();
 let draggedNoteId=null;
 let hoveredPitch=null;
 function hoverPianoPitch(pitch){
  if(pitch===hoveredPitch)return;
  keyByPitch.get(hoveredPitch)?.classList.remove("hovered");
  keys.find(entry=>entry.pitch===hoveredPitch)?.row.classList.remove("hovered");
  hoveredPitch=pitch;
  keyByPitch.get(pitch)?.classList.add("hovered");
  keys.find(entry=>entry.pitch===pitch)?.row.classList.add("hovered");
 }
 // Delegating avoids hundreds of listeners on the note grid, works for
 // out-of-scale (disabled) cells, and survives each editor redraw.
 root.onpointermove=event=>{
  if(draggedNoteId){
   const active=chunk.notes.find(note=>note.id===draggedNoteId);
   if(active){hoverPianoPitch(active.pitch);return;}
  }
  const key=event.target.closest?.(".piano-key");
  const row=event.target.closest?.(".piano-row");
  if(key&&root.contains(key))hoverPianoPitch(Number(key.dataset.pitch));
  else if(row&&root.contains(row))hoverPianoPitch(Number(row.dataset.pitch));
  else hoverPianoPitch(null);
 };
 root.onpointerleave=()=>hoverPianoPitch(null);
 root.onfocusin=event=>{
  const key=event.target.closest?.(".piano-key");
  const row=event.target.closest?.(".piano-row");
  if(key&&root.contains(key))hoverPianoPitch(Number(key.dataset.pitch));
  else if(row&&root.contains(row))hoverPianoPitch(Number(row.dataset.pitch));
 };
 root.onfocusout=event=>{
  if(!root.contains(event.relatedTarget))hoverPianoPitch(null);
 };
 function paintKeys(step){
  if(!scaleActive)return;
  for(const {pitch,row,label} of keys){
   const valid=isPitchInScaleAtStep(pitch,scaleGuide,chunk.notes,step);
   row.classList.toggle("in-scale",valid);
   row.classList.toggle("out-of-scale",!valid);
   const key=keyByPitch.get(pitch);
   if(key){
    key.classList.toggle("in-scale",valid);
    key.classList.toggle("out-of-scale",!valid);
   }
   const direction=directionalScale?scaleDirectionAtStep(pitch,chunk.notes,step):"";
   label.title=noteLabel(pitch)+" · "+(valid?"in ":"outside ")+SCALE_ROOTS[scaleGuide.root]+" "+scaleName+
    (direction?" · "+(direction==="either"?"either direction":direction):"");
  }
 }
 function focusScaleStep(step){
  if(scaleFocusStep===step)return;
  scaleFocusStep=step;
  paintKeys(step);
 }

 for (let pitch = 83; pitch >= 36; pitch--) {
  const pitchClass=pitch%12;
  const sharp=[1,3,6,8,10].includes(pitchClass);
  const row=element("div",undefined,"piano-row"+(sharp?" sharp":""));
  row.dataset.pitch=String(pitch);
  // The note column remains a fixed-width grid gutter. In keyboard mode,
  // actual piano keys render in one independent layer above all rows.
  const label=element(showPianoKeys?"span":"button",showPianoKeys?"":noteLabel(pitch),"note-name");
  label.setAttribute("aria-label",showPianoKeys?noteLabel(pitch):"Play "+noteLabel(pitch));
  label.title=showPianoKeys?noteLabel(pitch):"play "+noteLabel(pitch);
  if(!showPianoKeys){
   label.type="button";
   label.addEventListener("click",()=>{
    label.classList.add("pressed");
    setTimeout(()=>label.classList.remove("pressed"),220);
    if(!playback&&!pendingPlay)
     void audition(inst,pitch,beat).catch(error=>message("Couldn't preview key: "+error.message,true));
   });
  }
  row.append(label);
  keys.push({pitch,row,label});
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
    cell.classList.toggle("dragging", !!present && present.id===draggedNoteId);
    // Direction is evaluated at this *time column*, not per pitch row.
    const inScale=isPitchInScaleAtStep(pitch,scaleGuide,chunk.notes,pos);
    const direction=directionalScale?scaleDirectionAtStep(pitch,chunk.notes,pos):"";
    cell.classList.toggle("out-of-scale",scaleActive&&!inScale);
    // A locked scale blocks only new out-of-scale notes; old notes remain
    // selectable, removable, resizable and audible.
    cell.disabled=scaleGuide.lock&&!inScale&&!present&&!draggedNoteId;
    cell.setAttribute("aria-label", noteLabel(pitch) + ", step " + (pos + 1)
     + (scaleActive?(inScale?", in scale":", outside scale"):"")
     + (direction?", "+(direction==="either"?"either direction":direction):"")
     + (present ? ", note length " + present.duration + " steps; " + (editingNoteEffects?"click to edit note effects":"click to remove") + "; hold and drag to move" :
      cell.disabled?", adding notes restricted":", click to add note"));
    cell.title = present ? (editingNoteEffects?"Click to shape note":"Click to remove") + " · hold and drag to move · drag end to resize · right-click effects" : "Add " + noteLabel(pitch) + " · drag to extend";
   }
  }

  rowPreviews.set(pitch,previewRow);
  for (let step = 0; step < 16; step++) {
   let ignoreClick = false;
   const cell = button("", event => {
    if (ignoreClick) return;
    const targetInst = instrument();
    const editedChunk = chunkFor(targetInst);
    const existing = editedChunk.notes.find(n => n.pitch === pitch && step >= n.start && step < n.start + n.duration);
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
    if(scaleGuide.lock&&!isPitchInScaleAtStep(pitch,scaleGuide,editedChunk.notes,step))return;
    const created={id:id(),pitch,start:step,
     duration:1,velocity:DEFAULT_NOTE_LEVEL};
    selectedNoteId=editingNoteEffects?created.id:null;
    if(modify(()=>{editedChunk.notes.push(created);})){
     tapPianoKey(pitch);
     if(!playback&&!pendingPlay)
      void audition(targetInst,pitch,beat,{velocity:created.velocity}).catch(()=>{});
    }
   }, "note" + (step % 4 === 0 ? " beat" : ""));
   cells.push(cell);
   cell.addEventListener("contextmenu",event=>{
    // A note tail is still the same note. Never add/remove on a right-click.
    const note=chunk.notes.find(n=>n.pitch===pitch&&step>=n.start&&step<n.start+n.duration);
    if(!note)return;
    event.preventDefault();
    setNoteEffectsMode(true,note.id,false);
   });
   cell.addEventListener("pointerenter",()=>focusScaleStep(step));
   cell.addEventListener("focus",()=>focusScaleStep(step));

   // End-cap resizing keeps priority; drag a note body to move it.
   // Empty-cell pointerdown creates immediately, allowing one-gesture length painting.
   cell.addEventListener("pointerdown", event => {
    if(event.button!==0 || event.isPrimary===false)return;
    const existing=chunk.notes.find(n=>n.pitch===pitch && step>=n.start && step<n.start+n.duration);
    if(!existing && (cell.disabled ||
     (scaleGuide.lock && !isPitchInScaleAtStep(pitch,scaleGuide,chunk.notes,step))))return;
    const bounds=cell.getBoundingClientRect(),edge=event.pointerType==="touch"?18:13;
    const atEnd=!!existing && step===existing.start+existing.duration-1 && event.clientX>=bounds.right-edge;
    const mode=existing?(atEnd?"resize":"move"):"paint";
    const before=snapshot(currentDocument()),previousSelectedNoteId=selectedNoteId;
    let note=existing;
    const original=existing?{start:existing.start,pitch:existing.pitch,duration:existing.duration}:null;
    const pointerId=event.pointerId,x=event.clientX,y=event.clientY;
    const cellWidth=bounds.width,rowHeight=bounds.height;
    let finished=false,grabbed=mode!=="move";
    if(mode==="paint"){
     note={id:id(),pitch,start:step,
      duration:1,velocity:DEFAULT_NOTE_LEVEL};
     chunk.notes.push(note);
     resizeNote(chunk,note.id,note.duration);
     selectedNoteId=editingNoteEffects?note.id:null;
     ignoreClick=true;
     draggedNoteId=note.id;
     previewRow();
     tapPianoKey(pitch);
     if(!playback&&!pendingPlay)void audition(inst,pitch,beat,{velocity:note.velocity}).catch(()=>{});
    }else if(mode==="resize"){
     ignoreClick=true;
     draggedNoteId=note.id;
     previewRow();
    }
    // A long hold starts the drag even before any grid step changes.
    // Moving six pixels starts dragging promptly without waiting.
    const holdTimer=mode==="move"?setTimeout(()=>{
     if(finished)return;
     grabbed=true;ignoreClick=true;draggedNoteId=note.id;previewRow();
    },180):null;
    if(mode!=="move")event.preventDefault();
    cell.setPointerCapture(pointerId);
    function paintRows(oldPitch){
     rowPreviews.get(oldPitch)?.();
     if(note.pitch!==oldPitch)rowPreviews.get(note.pitch)?.();
    }
    function move(moveEvent){
     if(finished||moveEvent.pointerId!==pointerId)return;
     const dx=moveEvent.clientX-x,dy=moveEvent.clientY-y;
     if(!grabbed && Math.hypot(dx,dy)>=6){
      grabbed=true;ignoreClick=true;draggedNoteId=note.id;clearTimeout(holdTimer);
     }
     if(!grabbed)return;
     moveEvent.preventDefault();
     const oldPitch=note.pitch;
     if(mode==="move"){
      moveNote(chunk,note.id,original.start+Math.round(dx/cellWidth),
       original.pitch-Math.round(dy/rowHeight),{minPitch:36,maxPitch:83});
     }else{
      resizeNote(chunk,note.id,(original?.duration??1)+
       Math.round(dx/cellWidth));
     }
     paintRows(oldPitch);
    }
    function end(endEvent){
     if(finished||endEvent.pointerId!==pointerId)return;
     if(endEvent.type==="pointerup")move(endEvent);
     finished=true;
     clearTimeout(holdTimer);
     cell.removeEventListener("pointermove",move);
     cell.removeEventListener("pointerup",end);
     cell.removeEventListener("pointercancel",end);
     if(cell.hasPointerCapture(pointerId))cell.releasePointerCapture(pointerId);
     const cancelled=endEvent.type!=="pointerup",oldPitch=note.pitch;
     if(cancelled){
      if(mode==="paint"){
       chunk.notes=chunk.notes.filter(item=>item.id!==note.id);
       selectedNoteId=previousSelectedNoteId;
      }else Object.assign(note,original);
      ignoreClick=true;
     }
     const changed=!cancelled && (mode==="paint" ||
      note.start!==original.start || note.pitch!==original.pitch || note.duration!==original.duration);
     draggedNoteId=null;
     paintRows(oldPitch);
     if(changed){
      ignoreClick=true;
      // Click follows pointerup; suppress it before rebuilding the buttons.
      setTimeout(()=>commitChange(before),0);
     }else setTimeout(()=>{ignoreClick=false;},0);
    }
    cell.addEventListener("pointermove",move);
    cell.addEventListener("pointerup",end);
    cell.addEventListener("pointercancel",end);
    // Lost capture (tab switch, interrupted touch) must not leave unsaved edits.
    cell.addEventListener("lostpointercapture",end,{once:true});
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
 if(showPianoKeys){
  const keyboard=element("div",undefined,"piano-keys-overlay");
  keyboard.setAttribute("role","group");
  keyboard.setAttribute("aria-label","Play piano keys");
  const geometry=pianoKeyGeometry();
  // White keys share a single boundary, so they cannot overlap or leave
  // gaps. Black keys are painted afterwards, above adjacent whites.
  for(const [kind,items] of [["white",geometry.white],["black",geometry.black]]){
   for(const {pitch,top,height} of items){
    const key=element("button",undefined,"piano-key "+kind);
    key.type="button";
    key.style.top=top+"px";
    key.style.height=height+"px";
    key.dataset.pitch=String(pitch);
    key.setAttribute("aria-label","Play "+noteLabel(pitch));
    key.title="play "+noteLabel(pitch);
    if(kind==="white"&&pitch%12===0)
     key.append(element("span",noteLabel(pitch),"piano-key-caption"));
    key.addEventListener("click",()=>{
     tapPianoKey(pitch);
     if(!playback&&!pendingPlay)
      void audition(inst,pitch,beat).catch(error=>message("Couldn't preview key: "+error.message,true));
    });
    keyboard.append(key);
    keyByPitch.set(pitch,key);
   }
  }
  root.append(keyboard);
 }
 const playhead = element("div", undefined, "piano-playhead");
 playhead.setAttribute("aria-hidden", "true");
 playhead.hidden = true;
 root.append(playhead);
 paintKeys(scaleFocusStep);
 paintPianoPlayhead();
 scroll.scrollTop = top;
 scroll.scrollLeft = left;
 const note=editingNoteEffects?chunk.notes.find(entry=>entry.id===selectedNoteId):null;
 renderNoteExpression($("note-expression"),note,note?noteLabel(note.pitch):"",
  note?note.duration*60/beat.bpm/4:0,bend=>{
  modify(()=>{const target=chunkFor(instrument()).notes.find(entry=>entry.id===selectedNoteId);if(target)target.bend=bend;});
 },()=>{
  const id=selectedNoteId;
  selectedNoteId=null;
  modify(()=>{const current=chunkFor(instrument());current.notes=current.notes.filter(entry=>entry.id!==id);});
 },()=>{
  const current=chunkFor(instrument()).notes.find(entry=>entry.id===selectedNoteId);
  if(!current)return;
  void audition(instrument(),current.pitch,beat,{
   velocity:current.velocity,bend:current.bend,
   duration:current.duration*60/beat.bpm/4
  }).catch(error=>message("Couldn't preview note: "+error.message,true));
 },sound().patch.bend,level=>{
  const target=chunkFor(instrument()).notes.find(entry=>entry.id===selectedNoteId);
  if(!target)return;
  if(modify(()=>{target.velocity=level;})&&!playback&&!pendingPlay)
   void audition(instrument(),target.pitch,beat,{velocity:level,bend:target.bend,duration:target.duration*60/beat.bpm/4})
    .catch(error=>message("Couldn't preview note: "+error.message,true));
 });
}
function closeChunkMenu() {
 $("chunk-menu").hidden=true;
 $("chunk").setAttribute("aria-expanded","false");
}
function createChunk() {
 modify(()=>{
  const inst=instrument(),chunk=makeChunk("Chunk "+(inst.chunks.length+1));
  inst.chunks.push(chunk);
  selectedChunks.set(inst.id,chunk.id);
 });
}
function duplicateChunk(chunkId) {
 modify(()=>{
  const inst=instrument(),source=inst.chunks.find(chunk=>chunk.id===chunkId);
  if(!source||inst.chunks.length>=32)return;
  const copy=clone(source);
  copy.id=id();
  copy.name=(source.name+" copy").slice(0,60);
  for(const note of copy.notes)note.id=id();
  inst.chunks.push(copy);
  selectedChunks.set(inst.id,copy.id);
 });
}
function renderChunkEditor() {
 const inst=instrument(),menu=$("chunk-menu");
 const active=chunkFor(inst);
 selectedChunks.set(inst.id,active.id);
 closeChunkMenu();
 menu.replaceChildren();
 for(const chunk of inst.chunks){
  const row=element("div",undefined,"chunk-menu-row");
  const select=button(chunk.name,()=>{
   closeChunkMenu();
   selectedChunks.set(inst.id,chunk.id);
   renderChunkEditor();
  },"chunk-menu-select");
  select.setAttribute("aria-current",chunk.id===active.id?"true":"false");
  const duplicate=button("+",()=>{
   closeChunkMenu();
   duplicateChunk(chunk.id);
  },"chunk-menu-duplicate");
  duplicate.setAttribute("aria-label","duplicate "+chunk.name);
  duplicate.title="duplicate "+chunk.name;
  duplicate.disabled=inst.chunks.length>=32;
  row.append(select,duplicate);
  menu.append(row);
 }
 const add=button("+",()=>{
  closeChunkMenu();
  createChunk();
 },"chunk-menu-new");
 add.setAttribute("aria-label","new chunk");
 add.title="new chunk";
 add.disabled=inst.chunks.length>=32;
 menu.append(add);
 $("chunk-name").value=active.name;
 $("delete-chunk").disabled=inst.chunks.length<=1;
 $("editing-identity").textContent=inst.name;
 renderNotes();
}
function renderSound() {
 const inst=instrument(),entry=sound(inst),patch=entry.patch;
 $("instrument-name").value=inst.name;
 document.querySelector(".controls")?.style.setProperty("--track-accent",signal(inst));
 $("synth-editor").style.setProperty("--track-accent",signal(inst));
 const scope=createSignalDisplay($("sound-visualizer"),patch,beat,signal(inst),inst.volume*entry.gain,entry.referencePitch,inst.automation);
 const preview=(path,value)=>{
  // Construct a temporary sound-definition view, not an alternate mutable draft.
  const next=patchCopy(sound().patch);
  const updates=Array.isArray(path[0])?path.map((key,i)=>[key,value[i]]):[[path,value]];
  for(const [keys,newValue] of updates){
   let owner=next;
   for(const key of keys.slice(0,-1))owner=owner[key]??={};
   owner[keys.at(-1)]=newValue;
  }
  scope(next);
  for(const panel of $("synth-editor").querySelectorAll(".visual-sound-panel"))
   panel.drawSoundIllustration?.(next);
 };
 const onChange=(path,value)=>{
  const changed=modify(()=>{
   const target=sound().patch;
   const updates=Array.isArray(path[0])?path.map((key,i)=>[key,value[i]]):[[path,value]];
   for(const [keys,newValue] of updates){
    let owner=target;
    for(const key of keys.slice(0,-1))owner=owner[key]??={};
    owner[keys.at(-1)]=newValue;
   }
   if(target.modulation!==undefined)target.version=2;
   target.presetId="custom";
  });
  if(changed&&!playback&&!pendingPlay){
   clearTimeout(soundPreviewTimer);
   const instId=inst.id,soundId=entry.id;
   soundPreviewTimer=setTimeout(()=>{
    soundPreviewTimer=null;
    if(playback||pendingPlay||instrument().id!==instId||sound().id!==soundId)return;
    void audition(instrument(),sound().referencePitch,beat,{soundId,duration:.4})
     .catch(error=>message("Couldn't preview sound: "+error.message,true));
   },140);
  }
 };
 // Prominent edits share exactly the same persistent patch fields as the
 // existing sound modules, with no duplicate parameter controls below.
 const volume=$("instrument-volume-dial");
 volume.replaceChildren();
 volume.append(createDial({label:inst.layout==="rack"?"rack volume":"volume",min:0,max:1,step:.01,display:"percent"},
  inst.volume,value=>modify(()=>{instrument().volume=value;}),
  value=>scope(patch,value*entry.gain)));
 const topFields=patch.type==="synth"?PRIMARY_SYNTH_FIELDS:[
  {label:"brightness",path:["filter"],min:50,max:14000,step:1,display:"hz",log:true},
  {label:"attack",path:["attack"],min:0,max:2,step:.005,display:"seconds"},
  {label:"release",path:["release"],min:.01,max:3,step:.01,display:"seconds"}
 ];
 // Return the same dial nodes to the header before replacing the editor.
 // The visuals adopt them after rendering, without duplicate parameters.
 const primary=document.querySelector(".sound-primary-controls");
 for(const key of ["primary-brightness-dial","primary-attack-dial","primary-release-dial"]){
  const dial=$(key);if(dial.parentElement!==primary)primary.append(dial);
 }
 const topNodes=["primary-brightness-dial","primary-attack-dial","primary-release-dial"];
 topFields.forEach((field,index)=>{
  const root=$(topNodes[index]);root.replaceChildren();
  const filter=patch.type==="sample"&&index===0;
  const current=filter?sampleTone(patch).filter.cutoff:
   field.path.reduce((value,key)=>value?.[key],patch);
  const update=(value,apply)=>{
   if(filter)apply(["filter"],{...sampleTone(patch).filter,cutoff:value});
   else apply(field.path,value);
  };
  const filterType=patch.type==="sample"?sampleTone(patch).filter.type:patch.filter.type;
  const help=index===0?(filterType==="lowpass"?
   "turn it down to muffle the high stuff":"move the filter to reshape the sound"):undefined;
  root.append(createDial({...field,help},current,
   value=>update(value,onChange),value=>update(value,preview)));
 });
 $("sound-name").value=entry.name;
 $("move-sound-up").disabled=inst.sounds.indexOf(entry)===0;
 $("move-sound-down").disabled=inst.sounds.indexOf(entry)===inst.sounds.length-1;
 $("duplicate-sound").disabled=inst.sounds.length>=MAX_SOUNDS;
 $("remove-sound").disabled=false;
  $("remove-sound").textContent=soundDeleteLabel(inst);
 $("sound-controls").hidden=inst.layout!=="rack";
 $("save-row-sound").hidden=inst.layout!=="rack";
 $("save-sound").setAttribute("aria-label",inst.layout==="rack"?"Save rack preset":"Save preset");
 const level=$("sound-volume-dial");level.replaceChildren();
 level.append(createDial({label:"Sound level",min:0,max:1,step:.01,display:"percent"},entry.gain,
  value=>modify(()=>{sound().gain=value;})));
 $("sound-reference").value=String(entry.referencePitch);
 $("convert-rack").hidden=inst.layout==="rack";
 $("convert-rack").disabled=!!inst.automation||!canConvertToRack(inst);
 $("convert-rack").title=inst.automation?"remove cutoff movement before converting to rack":canConvertToRack(inst)?"convert this instrument into a one-sound rack":"requires a single pitch without overlapping hits";
 $("convert-pitched").hidden=inst.layout!=="rack";
 $("convert-pitched").textContent=inst.sounds.length===1?"convert to piano roll":"extract sound to piano roll";
 $("convert-pitched").disabled=!canMoveRackSoundToPianoRoll(beat,inst.id,entry.id);
 $("convert-pitched").title=entry.referencePitch<36||entry.referencePitch>96?
  "Reference note must be within C2–C7 to use the piano roll":
  beat.instruments.length>=12&&inst.sounds.length>1?
  "The beat already has 12 instruments": "Move this sound to its own piano-roll instrument";
 $("sound-section").setAttribute("aria-label",
  "sound editor for "+inst.name+(inst.layout==="rack"?" / "+entry.name:""));
 if(patch.type==="sample"){
  renderSamplerEditor($("synth-editor"),patch,onChange,
   patch.zones.map(zone=>beat.samples.find(x=>x.id===zone.assetId)?.name||zone.assetId).join(" / "),
   ()=>openAudioReplace(),preview,entry.id);
 }else {
  renderPatchEditor($("synth-editor"),patch,onChange,preview,entry.id);
  renderCutoffAutomation($("synth-editor"),inst,beat,block=>{const changed=modify(()=>{if(block)instrument().automation=block;else delete instrument().automation;});if(changed&&playback)message("cutoff movement updates with new notes");});
 }
 const editor=$("synth-editor");
 const placeDial=(id,kind)=>{
  const fields=editor.querySelector('.visual-sound-panel[data-visual-kind="'+kind+'"] .synth-fields');
  if(fields)fields.prepend($(id));
 };
 placeDial("primary-brightness-dial","filter");
 placeDial("primary-attack-dial",patch.type==="sample"?"sample":"envelope");
 placeDial("primary-release-dial",patch.type==="sample"?"sample":"envelope");
 $("remove-instrument").disabled=false;
  $("remove-instrument").textContent=instrumentDeleteLabel(inst);
}
function render() {
 repairSelection();
 syncInspector();
 $("note-mode").setAttribute("aria-pressed",String(editingNoteEffects));
 $("note-mode").textContent="✎";
 $("note-mode").setAttribute("aria-label",editingNoteEffects?"finish editing note effects":"edit note effects");
 $("note-mode").title=editingNoteEffects?"finish editing note effects":"edit note effects";
 document.querySelector(".work")?.classList.toggle("editing-note-effects",editingNoteEffects);
 document.querySelector(".notes-section")?.classList.toggle("editing-note-effects",editingNoteEffects);
 $("title").value = beat.title;
 $("bpm").value = String(song&&songExpanded?song.bpm:beat.bpm);
 $("bars").value = String(beat.bars);
 songUI?.render();
 $("song-expand").textContent=songExpanded?"↓ Beat":"↑ Song";
 setPlaybackButton(!!playback);
 $("play").title=playback?"stop playback":song&&songExpanded?"play song":"play beat";
 $("song-expand").setAttribute("aria-expanded",String(songExpanded));
 renderInstruments();
 renderTimeline();
 renderChunkEditor();
 renderSound();
 syncNoteEffectsInspector();
 $("undo").disabled = history.length === 0;
 $("redo").disabled = future.length === 0;
}


function positionNoteEffectsInspector(){
 // One real note editor, moved only when the desktop/mobile layout changes.
 const panel=$("note-effects-section");
 const notes=document.querySelector(".notes-section");
 const main=document.querySelector(".mainwork");
 if(inspectorViewport.matches){
  if(panel.parentElement!==main)main.append(panel);
 }else if(panel.parentElement!==notes){
  notes.insertBefore(panel,notes.querySelector(".piano-scroll"));
 }
}
function syncNoteEffectsInspector(){
 const panel=$("note-effects-section");
 panel.setAttribute("aria-hidden",String(!editingNoteEffects));
 $("note-effects-empty").hidden=!editingNoteEffects||!$("note-expression").hidden;
}
function syncInspector(){
 positionNoteEffectsInspector();
 const work=document.querySelector(".work");
 for(const name of ["closed","expanded"])work.classList.toggle("inspector-"+name,inspectorState===name);
 const opened=inspectorState!=="closed"&&!editingNoteEffects;
 $("sound-section").setAttribute("aria-hidden",String(!opened));
 $("sound-toggle").setAttribute("aria-expanded",String(opened));
 $("sound-toggle").textContent="♫";
 $("sound-toggle").setAttribute("aria-label",opened?"close sound editor":"open sound editor");
 $("sound-toggle").title=opened?"close sound editor":"open sound editor";
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
  card.dataset.exampleId=example.id;
  card.dataset.exampleId=example.id;
  card.style.setProperty("--example-accent",example.accent);
  const title=element("strong",example.name);
  const tagline=element("span",example.tag+" · "+example.bpm+" BPM · "+example.bars+" bars · "+example.voices.length+" instruments","example-tag");
  card.append(title,tagline);
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
  message("Loaded example: "+example.name);
 }catch(error){message("Could not load "+example.name+": "+error.message,true);}
 finally{
  loadingExample=false;
  for(const card of $("example-list").querySelectorAll("button"))card.disabled=false;
 }
}
$("examples").addEventListener("click",showExamples);
$("close-examples").addEventListener("click",()=>$("example-dialog").close());

function setNoteEffectsMode(active,noteId=null,focusButton=true){
 editingNoteEffects=active;
 selectedNoteId=active?noteId:null;
 render();
 // Direct note context actions should not move focus to the toolbar.
 if(focusButton)$("note-mode").focus({preventScroll:true});
}
$("note-mode").addEventListener("click",()=>setNoteEffectsMode(!editingNoteEffects));
$("note-effects-done").addEventListener("click",()=>setNoteEffectsMode(false));
$("new").addEventListener("click", () => {
 if(confirm("Start a new Beat? This replaces the current "+(song?"Song":"Beat")+". Save .premidi first to keep it."))resetTo(create());
});
$("import").addEventListener("click", () => $("file").click());
$("song-expand").addEventListener("click",()=>{
 if(playback||pendingPlay)stop();
 if(!song){song=createSong(beat);selectedBeatId=beat.id;beat=song.beats[0];}
 songExpanded=!songExpanded;store();render();
});
$("song-collapse").addEventListener("click",()=>{
 if(playback||pendingPlay)stop();
 songExpanded=false;render();
});
$("song-import-file").addEventListener("change",async event=>{
 const file=event.currentTarget.files?.[0];if(!file)return;
 try{const imported=await importProject(file);addSongBeat(imported);message("Added "+imported.title);}
 catch(error){message("Could not add Beat: "+error.message,true);}
 finally{event.currentTarget.value="";}
});
$("file").addEventListener("change",async event=>{
 const file=event.currentTarget.files?.[0];if(!file)return;
 try{
  const content=file.name.toLowerCase().endsWith(".zip")?
   [...(await readZip(file))].find(([path])=>path.endsWith(".premidi"))?.[1]:null;
  const raw=content?new TextDecoder().decode(content):
   file.name.toLowerCase().endsWith(".premidi")?await file.text():null;
  if(!raw)throw Error("Choose a .premidi or music ZIP.");
  const kind=JSON.parse(raw).kind;
  // "Open" replaces the current project. Only Song's "Add .premidi"
  // imports a Beat into an existing Song.
  if(!confirm("Open "+file.name+"? This replaces the current "+(song?"Song":"Beat")+". Save it first to keep it."))return;
  const next=kind==="song"?await importSongProject(file):await importProject(file);
  resetTo(next);message("Opened "+file.name);
 }catch(error){message("Could not open file: "+error.message,true);}
 finally{$("file").value="";}
});
// One export entry point for either editable Beat or full Song.
const exportDialog=$("export-dialog"),exportForm=$("export-form");
const exportScope=value=>exportForm.querySelector('input[name="export-scope"][value="'+value+'"]');
const exportFormat=value=>exportForm.querySelector('input[name="export-format"][value="'+value+'"]');
$("export").addEventListener("click",()=>{
 exportScope("song").disabled=!song;
 exportScope(song&&songExpanded?"song":"beat").checked=true;
 exportFormat("premidi").checked=true;
 $("export-confirm").disabled=false;
 exportDialog.showModal();
});
$("export-close").addEventListener("click",()=>exportDialog.close());
exportForm.addEventListener("submit",async event=>{
 event.preventDefault();
 const scope=exportForm.querySelector('input[name="export-scope"]:checked')?.value;
 const format=exportForm.querySelector('input[name="export-format"]:checked')?.value;
 if(!["beat","song"].includes(scope)||!["premidi","wav"].includes(format))return;
 if(scope==="song"&&!song)return message("Create a Song before exporting it.",true);
 const source=scope==="song"?song:beat,control=$("export-confirm");
 control.disabled=true;
 try{
  if(format==="wav"){
   message("Rendering "+scope+" WAV...");
   const output=await wav(source);
   const saved=download(output,filename(source,".wav"));
   if(saved?.then && !await saved){message("export cancelled");return;}
   message("Exported "+scope+" WAV");
  }else{
   const output=scope==="song"?exportSongProject(source):exportProject(source);
   const saved=download(output.blob,output.name);
   if(saved?.then && !await saved){message("export cancelled");return;}
   message("Exported "+scope+(output.name.endsWith(".zip")?" with audio assets":".premidi"));
  }
  exportDialog.close();
 }catch(error){message("Export failed: "+error.message,true);}
 finally{control.disabled=false;}
});
async function startTransport({onStart=null,recording=false,startStep=null,countIn=0,captureOwner=null,onCountIn=()=>{}}={}){
 if (playback) { stop(); return; }
 if (pendingPlay) return;
 pendingPlay = true;
 const playingSong=!!(song&&songExpanded),generation=++playbackGeneration;
 try {
  const session = await play(() => playingSong?song:beat, {
   countIn,recording:captureOwner,onCountIn,
   onStart:metadata=>onStart?.(metadata),
   startStep:playingSong?(startStep??songUI?.getStartStep()??0):0,
   loop: () => recording?false:$("loop").checked,
   onPosition: (bar, step) => {
    $("position").textContent = (bar+1)+":"+(Math.floor(step/4)+1);
    $("position").setAttribute("aria-label","bar "+(bar+1)+", beat "+(Math.floor(step/4)+1));
    if(playingSong){songUI?.setPosition(bar+step/16);playBar=playStep=-1;}
    else{
     if(playBar!==bar){playBar=bar;paintPlayhead();}
     playStep=step;
    }
   },
   onProgress: (bar, step) => {
    pianoProgress=playingSong?null:{bar,step};
    if(playingSong)songUI?.setPosition(bar+step/16);
    else paintPianoPlayhead();
   },
   onStop: () => {
    playback = null;
    playBar = playStep = -1;
    pianoProgress = null;
    setPlaybackButton(false);
    $("position").textContent="1:1";
    $("position").setAttribute("aria-label","bar 1, beat 1");
    songUI?.setPosition(-1);
    paintPlayhead();
    if(vocalTake)void finalizeVocalTake();
   }
  });
  if(generation!==playbackGeneration){session.stop();return;}
  playback=session;
  setPlaybackButton(true,playingSong);
 } catch (error) {
  if(vocalTake)void finalizeVocalTake();
  if(generation===playbackGeneration)message("Playback error: " + error.message, true);
 }
 finally { pendingPlay = false; }
}
$("play").addEventListener("click",()=>void startTransport());
window.addEventListener('premidi-audio-mode',()=>stop());
window.addEventListener('premidi-native-error',event=>message(String(event.detail),true));
window.addEventListener('premidi-native-pause',async()=>{
 if(!playback?.pause)return;
 const current=playback;
 try{if(current.paused)await current.resume();else await current.pause();if(playback===current)setPlaybackButton(true);}
 catch(error){message('Native audio: '+String(error),true);}
});
// Voice capture opens a separate dialog; permissions come after explicit Play + Record.
$("song-record").addEventListener("click",()=>{
 if(!song||!songExpanded)return;
 $("voice-start-bar").value=String(Math.floor((songUI?.getStartStep()||0)/16)+1);
 $("voice-count-in").value="0";
 voiceStatus("Play the Song and record your microphone from this bar.");
 showVocalState(!!vocalTake);
 if(!voiceDialog.open)voiceDialog.showModal();
});
$("voice-start-bar").addEventListener("change",event=>{
 if(!song||vocalRequest||vocalTake)return;
 const bar=Math.max(1,Math.floor(Number(event.target.value)||1));
 const step=songUI?.setStartStep((bar-1)*16)??0;
 event.target.value=String(Math.floor(step/16)+1);
});
$("voice-close").addEventListener("click",()=>{
 if(vocalTake){voiceStatus("Stopping and saving…");stop();return;}
 if(vocalFinalizing){voiceStatus("Saving vocal recording…");return;}
 cancelVoiceCountdown();voiceDialog.close();
});
voiceDialog.addEventListener("cancel",event=>{
 if(vocalTake||vocalFinalizing){
  event.preventDefault();if(vocalTake)stop();
 }else cancelVoiceCountdown();
});
$("voice-start").addEventListener("click",async()=>{
 if(vocalTake){stop();return;}
 if(vocalRequest){cancelVoiceCountdown();voiceStatus("Count-in cancelled.");return;}
 if(vocalFinalizing||!song||!songExpanded)return;
 if(playback||pendingPlay)stop();
 const token=++voiceToken,originalId=song.id;
 const chosenBar=Math.max(1,Math.floor(Number($("voice-start-bar").value)||1));
 const requestedStep=songUI?.setStartStep((chosenBar-1)*16)??0;
 const countBars=Number($("voice-count-in").value);
 vocalRequest=true;
 $("voice-start").textContent="cancel";
 voiceStatus("Requesting microphone permission…");
 let prepared;
 try{
  prepared=await prepareSongTake();
  if(token!==voiceToken||!voiceDialog.open||!songExpanded||song?.id!==originalId){
   prepared.cancel();return;
  }
  voiceCountAbort=new AbortController();
  if(countBars&&!nativeEnabled()){
   await songCountIn(song.bpm,countBars,{
    signal:voiceCountAbort.signal,
    onBeat:({beat,bar,remaining})=>{
     voiceStatus("Count-in · bar "+bar+" · beat "+beat+" · "+remaining+" left");
    }
   });
  }
  if(token!==voiceToken||!voiceDialog.open||!songExpanded||song?.id!==originalId){
   prepared.cancel();return;
  }
  vocalStartStep=requestedStep;vocalTake=prepared;
  showVocalState(true);
  voiceStatus("Recording from bar "+(Math.floor(requestedStep/16)+1)+". Stop to save.");
  await startTransport({recording:true,startStep:requestedStep,countIn:nativeEnabled()?countBars:0,captureOwner:prepared.captureOwner??null,
   onCountIn:({remaining,beat,bar})=>{if(vocalTake===prepared)voiceStatus(remaining?'Count-in · bar '+bar+' · beat '+beat+' · '+remaining+' left':'Recording from bar '+(Math.floor(requestedStep/16)+1)+'. Stop to save.');},onStart:metadata=>{
   if(vocalTake===prepared&&songExpanded)
    prepared.begin({...metadata,onLimit:()=>stop()});
   else prepared.cancel();
  }});
 }catch(error){
  if(vocalTake===prepared)vocalTake=null;
  prepared?.cancel();showVocalState(false);
  if(error?.name!=="AbortError"){
   const reason=error?.name==="NotAllowedError"?"Microphone permission denied. Check browser permissions.":error.message;
   voiceStatus(reason,true);message("Microphone error: "+reason,true);
  }
 }finally{
  voiceCountAbort=null;vocalRequest=false;
  if(!vocalTake)showVocalState(false);
 }
});
$("title").addEventListener("change", event => modify(() => beat.title = event.target.value.trim() || "Untitled beat"));
$("bpm").addEventListener("change",event=>{
 const next=Math.round(Number(event.target.value));
 if(song&&songExpanded)modifySong(()=>{song.bpm=next;});
 else modify(()=>{beat.bpm=next;});
});
$("bars").addEventListener("change", event => modify(() => {
 const count = Number(event.target.value);
 beat.bars = count;
 for (const inst of beat.instruments) {
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
 const target=beat.instruments.find(inst=>inst.id===context.instrumentId)||(context.mode==="add"?instrument():null);
 if(!target){message("The original instrument was removed. Open the sound library again.",true);return false;}
 const row=target.sounds.find(sound=>sound.id===context.soundId);
 if(context.mode==="replace-row"&&!row)return false;
 const operation=context.mode==="replace-row"?"replace-row":rackSounds?"create-rack":
  selectionOperation(target.layout,trigger,context.mode==="add");
 return modify(()=>{
  for(const asset of assets)if(!beat.samples.some(existing=>existing.id===asset.id))beat.samples.push(asset);
  if(operation.startsWith("create-")){
   const entry=makeSound(name.slice(0,60),patch,trigger);
   if(settings){entry.referencePitch=settings.referencePitch??entry.referencePitch;entry.gain=settings.gain??entry.gain;}
   const inst=makeInstrument(beat.instruments.length+1,beat.bars,entry);
   if(rackSounds){
    inst.layout="rack";inst.sounds=clone(rackSounds).map(sound=>({...sound,id:id()}));
   }
   inst.volume=settings?.volume??inst.volume;
   inst.name=name.slice(0,60);beat.instruments.push(inst);
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
   if(operation==="replace-pitched"){target.name=name.slice(0,60);if(settings?.volume!==undefined)target.volume=settings.volume;}
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
 const target=beat.instruments.find(inst=>inst.id===context.instrumentId)||(context.mode==="add"?instrument():null);
 const row=target?.sounds.find(sound=>sound.id===context.soundId);
 if(context.mode==="replace-row"&&row){
  // Replacing audio preserves this sound's note/hit intent and recorded pitch.
  patch.followPitch=row.patch.type==="sample"?row.patch.followPitch:row.trigger==="pitched";
  patch.oneShot=row.trigger==="hit";patch.zones[0].root=root;
 }
 const ok=applySoundSelection(patch,name,followPitch?"pitched":"hit",[asset],context);
 if(ok){
  if($("instrument-dialog").open)$("instrument-dialog").close();
  if(playback)void primeSamples(beat).catch(error=>message(error.message,true));
 }
 return ok;
}
let recordingMode=null;
const recorder=installMicrophoneRecorder({
 get:$,
 onSynth:({patch,name,trigger,referencePitch})=>{
  if(beat.instruments.length>=12){message("The beat supports up to 12 instruments.",true);return false;}
  const names=new Set(beat.instruments.flatMap(inst=>[inst.name,...inst.sounds.map(sound=>sound.name)]));
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
 if(mode==="add"&&beat.instruments.length>=12)
  return message("Maximum 12 instruments.",true);
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
   const target=beat.instruments.find(inst=>inst.id===context.instrumentId)||(context.mode==="add"?instrument():null);
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
async function savePreset(name,wholeRack=false){
 const inst=instrument(),entry=sound();
 if(!name||name.length>60){message("Preset name must be 1–60 characters.",true);return false;}
 if(savedSounds.length>=100){message("Your sound library contains 100 presets.",true);return false;}
 const sounds=wholeRack?clone(inst.sounds):[clone(entry)];
 const needs=new Set(sounds.flatMap(sound=>sound.patch.type==="sample"?sound.patch.zones.map(zone=>zone.assetId):[]));
 const samples=beat.samples.filter(asset=>needs.has(asset.id));
 const item={id:"user-"+id(),name,category:"Mine",description:wholeRack?"Rack · "+sounds.length+" sounds":"Saved sound",samples};
 if(wholeRack){item.sounds=sounds;item.layout="rack";item.volume=inst.volume;}
 else {item.volume=inst.volume;item.patch=entry.patch?patchCopy(entry.patch):null;item.trigger=entry.trigger;item.referencePitch=entry.referencePitch;item.gain=entry.gain;}
 try{
  await savePresetAssets(samples);
  localStorage.setItem(SAVED_SOUNDS,JSON.stringify([...savedSounds,item]));savedSounds.push(item);
  message("Saved "+name+" locally.");
  return true;
 }catch(error){message("Could not save preset: "+error.message+". Export your beat to keep it.",true);return false;}
}
const presetDialog=$("save-preset-dialog"),presetForm=$("save-preset-form");
let presetRack=false,presetSaving=false;
function openPresetSave(wholeRack=false){
 presetRack=wholeRack;
 $("save-preset-title").textContent=wholeRack?"save rack preset":"save preset";
 $("save-preset-name").value=(wholeRack?instrument().name:sound().name)+" variation";
 $("save-preset-confirm").disabled=false;
 presetDialog.showModal();
 $("save-preset-name").select();
}
$("save-preset-close").addEventListener("click",()=>presetDialog.close());
$("save-preset-cancel").addEventListener("click",()=>presetDialog.close());
presetForm.addEventListener("submit",async event=>{
 event.preventDefault();
 if(presetSaving)return;
 const name=$("save-preset-name").value.trim();
 if(!name){$("save-preset-name").focus();return;}
 presetSaving=true;$("save-preset-confirm").disabled=true;
 try{if(await savePreset(name,presetRack))presetDialog.close();}
 finally{presetSaving=false;$("save-preset-confirm").disabled=false;}
});
$("hear-sound").addEventListener("click",()=>{void audition(instrument(),sound().referencePitch,beat,{soundId:sound().id,duration:.6}).catch(error=>message("Could not preview sound: "+error.message,true));});
$("save-sound").addEventListener("click",()=>openPresetSave(instrument().layout==="rack"));
$("save-row-sound").addEventListener("click",()=>openPresetSave(false));
function allSounds(){return [...PRESETS,...SAMPLE_LIBRARY,...EXAMPLE_SOUND_PRESETS,...savedSounds,...DRUM_RACKS];}
function openLibrary(mode) {
 closePicker();
 if(mode==="add"&&beat.instruments.length>=12)return;
 libraryMode=mode;libraryContext=currentContext(mode);
 libraryCategory="All";
 $("library-description").textContent=mode==="add"?"new instrument":mode==="replace-row"?"replaces selected sound":"notes use keys · hits use racks";
 renderLibrary();
 const dialog=$("instrument-dialog");
 if(!dialog.open)dialog.showModal();
}
const builtinCache=new Map();
async function resolveSamples(preset) {
 await assetsReady;
 const ids=new Set(preset.sounds?preset.sounds.flatMap(sound=>sound.patch.type==="sample"?sound.patch.zones.map(zone=>zone.assetId):[]):
  preset.patch?.type==="sample"?preset.patch.zones.map(zone=>zone.assetId):preset.assets||[]);
 return Promise.all([...ids].map(async assetId=>{
  const existing=(preset.samples||[]).find(asset=>asset.id===assetId)||beat.samples.find(asset=>asset.id===assetId);
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
  const patch=preset.sounds?patchCopy(preset.sounds[0].patch):getPreset(preset.id)?makePatch(preset.id):preset.patch?patchCopy(preset.patch):
   preset.assets?makeSamplerPatch(preset):makePatch(preset.id);
  if(preset.category!=="Examples")patch.presetId=preset.id;
  const trigger=presetTrigger(preset);
  const selected=beat.instruments.find(item=>item.id===context.instrumentId);
  if(context.mode!=="add"&&selected?.automation&&patch.type!=="synth"&&trigger==="pitched"&&!preset.sounds){
   message("Remove cutoff movement before replacing this instrument with a recording.",true);return;
  }
 const ok=applySoundSelection(patch,preset.name,trigger,assets,context,preset.sounds,
   preset.sounds || ["Mine","Examples"].includes(preset.category)?preset:null);
  if(ok) {
   dialog.close();
   // A new sample can be introduced while the transport is running.
   if(playback)void primeSamples(beat).catch(error=>message("Sample decode failed: "+error.message,true));
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
  const patch=preset.sounds?patchCopy(preset.sounds[0].patch):getPreset(preset.id)?makePatch(preset.id):preset.patch?patchCopy(preset.patch):
   preset.assets?makeSamplerPatch(preset):makePatch(preset.id);
  const pitch=preset.referencePitch??(presetTrigger(preset)==="hit"?patch.zones?.[0]?.root??60:preset.category==="Bass"?48:preset.category==="Guitars"?57:69);
  const inst=makeInstrument(1,1,makeSound(preset.name,patch,presetTrigger(preset)));inst.volume=preset.volume??.8;
  inst.sounds[0].referencePitch=pitch;inst.sounds[0].gain=preset.gain??1;
  // Preview strumming as an actual chord, otherwise the Steel Strum and
  // Steel Acoustic presets can sound like the same single plucked note.
  const chord=preset.id==="steel-strum"?[52,57,60,64,69]:null;
  const pitches=chord||[pitch];
  const ids=[...new Set(pitches.map(key=>patch.type==="sample"?
   sampleForNote(patch,key,.8)?.assetId:null).filter(Boolean))];
  const assets=await Promise.all(ids.map(async id=>{
   return (preset.samples||[]).find(item=>item.id===id)
    ||beat.samples.find(item=>item.id===id)
    ||await loadLibrarySample(id);
  }));
  if(chord)await auditionChord(inst,pitches,{samples:assets});
  else await audition(inst,pitch,{samples:assets});
 }catch(error){message("Preview failed: "+error.message,true);}
}
function renderLibrary() {
 const filters=$("library-filters"),list=$("library-sounds");
 filters.replaceChildren();list.replaceChildren();
 const categories=["All","Guitars","Recorded","Drums","Textures","Bass","Lead","Keys","Pads","Winds","Percussion","Examples",...(savedSounds.length?["Mine"]:[])];
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
 const matching=allSounds().filter(p=>
  (libraryMode==="add" || !p.sounds) &&
  (libraryCategory==="All" || p.category===libraryCategory ||
   (libraryCategory==="Drums" && p.category==="Mine" && !!p.sounds)));
 // Keep individual drum sounds available; complete racks live beneath them.
 const grouped=libraryCategory==="Drums"
  ?[...matching.filter(p=>!p.sounds),...matching.filter(p=>p.sounds)]
  :matching;
 let rackHeading=false;
 for(const preset of grouped) {
  if(libraryCategory==="Drums" && preset.sounds && !rackHeading){
   list.append(element("h3","preset racks","library-rack-heading"));
   rackHeading=true;
  }
  const card=element("div",undefined,"preset-card");
  card.dataset.presetId=preset.id;
  card.dataset.presetId=preset.id;
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
 const target=beat.instruments.find(entry=>entry.id===instrumentId);
 if(!target)return;
 const last=beat.instruments.length===1;
 if(!confirm(instrumentDeleteLabel(target)+" “"+target.name+"” and all its chunks?"+
  (last?" A fresh, empty instrument will take its place.":"")))return;
 closePicker();
 modify(()=>{
  const replacementId=deleteInstrumentFromBeat(beat,instrumentId);
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
$("chunk").addEventListener("click",()=>{
 const menu=$("chunk-menu"),opening=menu.hidden;
 menu.hidden=!opening;
 $("chunk").setAttribute("aria-expanded",String(opening));
 if(opening)menu.querySelector(".chunk-menu-select")?.focus();
});
document.addEventListener("pointerdown",event=>{
 if(!event.target.closest?.(".chunk-switcher"))closeChunkMenu();
},true);
document.addEventListener("keydown",event=>{
 if(event.key==="Escape"&&!$("chunk-menu").hidden){
  closeChunkMenu();
  $("chunk").focus();
 }
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
function moveRackSound(instrumentId,soundId,offset){
 const inst=beat.instruments.find(item=>item.id===instrumentId);
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
 const inst=beat.instruments.find(item=>item.id===instrumentId);
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
 const inst=beat.instruments.find(item=>item.id===instrumentId);
 const entry=inst?.sounds.find(item=>item.id===soundId);
 if(!entry||inst.layout!=="rack")return;
 if(inst.sounds.length===1){removeInstrument(instrumentId);return;}
 const count=inst.chunks.reduce((sum,chunk)=>sum+chunk.notes.filter(note=>note.soundId===entry.id).length,0);
 if(count&&!confirm("Remove "+entry.name+" and its "+count+" hits across all chunks?"))return;
 closePicker();
 modify(()=>{
  deleteSoundFromBeat(beat,instrumentId,soundId);
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
 $("instrument-actions").open=false;
 if(!canConvertToRack(instrument()))return;
 modify(()=>convertToRack(instrument()));
});
function extractSoundToPianoRoll(instrumentId,soundId){
 if(!canMoveRackSoundToPianoRoll(beat,instrumentId,soundId))return;
 closePicker();
 const source=beat.instruments.find(item=>item.id===instrumentId);
 const sourceChunkIndex=source.chunks.findIndex(chunk=>chunk.id===selectedChunks.get(instrumentId));
 const sourceBar=selectedSlot.instrumentId===instrumentId?selectedSlot.bar:0;
 modify(()=>{
  const newId=moveRackSoundToPianoRoll(beat,instrumentId,soundId);
  if(!newId)return;
  const pitched=beat.instruments.find(item=>item.id===newId);
  selectedInstrumentId=newId;
  selectedSounds.delete(instrumentId);
  selectedSounds.set(newId,soundId);
  selectedNoteId=null;
  selectedSlot={instrumentId:newId,bar:sourceBar};
  selectedChunks.set(newId,pitched.chunks[Math.max(0,sourceChunkIndex)].id);
  if(!beat.instruments.some(item=>item.id===instrumentId))
   selectedChunks.delete(instrumentId);
 });
}
$("convert-pitched").addEventListener("click",()=>{
 $("instrument-actions").open=false;
 extractSoundToPianoRoll(instrument().id,sound().id);
});
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
songUI=installSongUI({
 root:$("song-panel"),getSong:()=>songExpanded?song:null,
 getSelectedBeatId:()=>selectedBeatId,
 onSelectBeat:selectBeat,onChange:modifySong,
 onSeek:step=>{
  if(playback?.seek)void playback.seek(step).catch(error=>message('Native seek: '+String(error),true));
  if(voiceDialog.open&&!vocalRequest&&!vocalTake)
   $("voice-start-bar").value=String(Math.floor(step/16)+1);
 },
 onAddBeat:()=>{const next=create();next.bpm=song.bpm;addSongBeat(next,{inheritScale:true});},
 onImportBeat:()=>$("song-import-file").click()
});
initializeScaleControls();
render();
if(cached)message("Local draft restored");
assetsReady=loadDraft().then(raw=>{
 if(cached || !raw || history.length || future.length || saveGeneration>0)return;
 try {const restored=parseDocument(raw);resetTo(restored);message("Browser draft restored");}
 catch(error){console.warn("Draft could not be restored",error);}
}).catch(()=>{});
installDesktopUI({flush:async()=>{
 if(vocalTake||vocalRequest||$("microphone-dialog").open)
  throw Error("Finish and use or cancel your recording before closing pre-midi.");
 await assetsReady;
 await saveDraft(currentDocument());
 stop();
}});
