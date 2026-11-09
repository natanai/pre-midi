import {processingFromPatch,applyProcessingToPatch} from "./recordedAudio.js";
import {renderAutomation} from "./automationUI.js";
import {upgradeBeatFeatures,resizeBeatBars,MAX_BEAT_BARS,SUSTAIN_BEAT_VERSION,CAPTURED_AUTOMATION_BEAT_VERSION} from "./schema.js";
import {upgradeSongFeatures} from "./songModel.js";
import {MAX_SOUNDS,referencedSampleIds,selectionOperation,canConvertToRack,convertToRack} from "./soundModel.js";
import {instrumentDeleteLabel,soundDeleteLabel,deleteInstrumentFromBeat,deleteSoundFromBeat,canMoveRackSoundToPianoRoll,moveRackSoundToPianoRoll,moveRackSoundRow} from "./entityActions.js";
import { create, makeInstrument, makeSound, makeChunk, id, clone, parse, validate, filename } from "./schema.js";
import { play, audition, auditionChord, auditionHeld, auditionVocal, wav, primeSamples, nativeEnabled, cancelNativeTransport, cancelWebTransport } from "./audio.js";
import { installKeyboardPiano } from "./keyboardPiano.js";
import { applyNoteCommand } from "./studioCommands.js";
import { SCALE_MODES,normalizeScaleGuide,scaleGuideForBeat,isPitchInScaleAtStep,scaleDirectionAtStep } from "./scaleGuide.js";
import { chunkIsPlaying, pianoScrubberX } from "./pianoPlayhead.js";
import {mountPianoKeyOverlay,populateScaleSelectors,paintPianoScale} from "./editorPianoView.js";
import {renderPianoRollRows,createPianoNoteSurface,applyPianoNoteState,noteAtPianoStep,noteStartingAtPianoStep} from "./editorPianoRoll.js";
import {mountEditorWorkspace,syncEditorInspector} from "./editorWorkspace.js";
import {createInstrumentCard,createInstrumentActionMenu,instrumentAccent} from "./editorInstrumentCard.js";
import {bindPianoNoteGesture,noteEndGrabWidth} from "./pianoNoteGesture.js";
import {incomingChunkSustains,continuationProposal,continueNoteFromEarlierChunk,resizeIncomingSustain} from "./chunkContinuation.js";
import {placementFor,phraseInstances,chunkProgress} from "./arrangement.js";
import {attachNumberScrub} from "./dragNumber.js";
import { PRESETS, getPreset, makePatch, patchCopy, validatePatch } from "./synth.js";
import {renderSoundInspectorCore,auditionSoundInspector,bindSoundInspectorIdentity,bindSoundInspectorCatalogActions,mountSoundInspectorChrome,soundInspectorOwner,populateSoundInspectorReferenceNotes,noteLabelForPitch} from "./soundInspector.js";
import { SAMPLE_LIBRARY, makeSamplerPatch } from "./samples.js";
import {FACTORY_SOUND_CATALOG} from "./soundCatalog.js";
import { nextRackPreview } from "./rackPreview.js";
import { loadLibrarySample, makeSampleAsset, MAX_BEAT_BYTES, sampleForNote } from "./sampler.js";
import { sampleAsset } from "./samples.js";
import {assignSoundEdit} from "./soundEditPath.js";
import { loadDraft, saveDraft, savePresetAssets } from "./storage.js";
import {loadUserSounds,writeUserSounds,presetFromInstrument,presetFromProcessing} from "./userSoundLibrary.js";
import { renderNoteExpression } from "./expressionUI.js";
import {EXAMPLES,EXAMPLE_SOUND_PRESETS,buildExample} from "./examples.js";
import {exportProject,importProject} from "./packageIO.js";
import {installMicrophoneRecorder} from "./microphoneUI.js";
import {getAsset} from "./assetRegistry.js";
import {createSong,addBeat,addSongTrack,addBeatClip,addVocalTake,duplicateVocalClip,renameVocalRecording,trimVocalClip,setSongTempo,pruneUnusedRecordings,validateSong} from "./songModel.js";
import {renderVocalEditor,syncVocalInspector,decodeVocalRecording} from "./vocalEditor.js";
import {vocalEffects} from "./vocalEffects.js";
import {encodePcmWav,RECORDING_RATE} from "./recording.js";
import {makeRecordingAsset} from "./recordingAssets.js";
import {linkedVocalSample} from "./vocalBeatReuse.js";
import {prepareSongTake,waveformForTake,songCountIn} from "./songRecorder.js";
import {readRecordingAlignment,saveRecordingAlignment} from "./recordingAlignment.js";
import {exportSongProject,importSongProject,parseSong} from "./songIO.js";
import {readZip} from "./zip.js";
import {installSongUI} from "./songUI.js";
import {synchronizeLinkedFreeform} from "./freeformModel.js";
import {applyFreeformPreset} from "./freeformPresets.js";
import {installDesktopUI} from "./desktopUI.js";

let beatSoundFrame;
const $ = key => beatSoundFrame?.get(key)??document.getElementById(key);
const bindBeatSound=(key,event,callback)=>$(key).addEventListener(event,e=>{
 if(soundInspectorOwner()==="beat")callback(e);
});
const beatEditor=mountEditorWorkspace($("beat-workspace"));
const beatWorkspace=beatEditor.root;
// Install the common Sound frame before any of the existing Beat controls bind.
beatSoundFrame=mountSoundInspectorChrome($("sound-section"),{owner:"beat"});
let assetsReady=Promise.resolve();
const CACHE = "premidi-v5-draft";
// Retain the previous fallback draft for desktop compatibility.
const parseDocument=raw=>{
 const candidate=JSON.parse(raw);
 return candidate.kind==="song"?parseSong(raw):parse(raw);
};
const cached=(()=>{try{return parseDocument(localStorage.getItem(CACHE)||"");}catch{return null;}})();
const savedSounds=loadUserSounds();
let libraryMode="add",libraryCategory="All",libraryContext=null;
const rackPreviewPositions=new Map(),rackPreviewRequests=new Map();
const beatAuditionRequests=new Map();
const inspectorViewport=window.matchMedia("(min-width:1100px)");
let inspectorState=inspectorViewport.matches?"expanded":"closed";
let loadingExample=false;
let song=cached?.kind==="song"?cached:null;
let beat=song?.beats[0]||cached||create();
let songExpanded=!!song,selectedBeatId=beat.id,songUI=null;
let selectedInstrumentId=beat.instruments[0].id;
let selectedNoteId = null;
let keyboardPiano = null;
let selectedSounds=new Map();
let editingNoteEffects = false;
let selectedChunks = new Map();
let selectedSlot = { instrumentId: selectedInstrumentId, bar: 0 };
let history = [], future = [], playback = null, pendingPlay = false, playbackGeneration=0;
 let songEditRevision=0;
let vocalTake=null,vocalRequest=false,vocalFinalizing=false,vocalStartStep=0,vocalTargetTrackId=null;
let voiceCountAbort=null,voiceToken=0;
let soundPreviewTimer=null;
let playBar = -1, playStep = -1, pianoProgress = null, picker = null, pickerTrigger = null;
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
 populateScaleSelectors(root,mode);
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
 beatWorkspace.querySelector(".piano-tools").hidden=rack;
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
const signal = inst => instrumentAccent(beat.instruments.findIndex(entry => entry.id === inst.id));

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
 const control=$("play"),active=isPlaying||pendingPlay;
 control.textContent=active?"■ stop":"▶ play";
 control.setAttribute("aria-label",(active?"stop ":"play ")+(playingSong?"song":"beat"));
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
 $("voice-offset-ms").disabled=active||vocalFinalizing||vocalRequest;
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
  const saved=modifySong(()=>addVocalTake(song,asset,{startStep:vocalStartStep,trackId:vocalTargetTrackId}));
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
 finally{vocalFinalizing=false;vocalTargetTrackId=null;showVocalState(false);}
}
function stop() {
 playbackGeneration++;cancelWebTransport();
 if(window.__TAURI__)void cancelNativeTransport().catch(error=>console.warn('Native stop:',error));
 if(vocalTake&&!playback)void finalizeVocalTake();
 if (playback) void Promise.resolve(playback.stop()).catch(error=>console.warn('Native stop:',error));
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
let playbackEditTimer;
function refreshPlayback(){
 clearTimeout(playbackEditTimer);const current=playback;if(typeof current?.refresh!=='function')return;
 playbackEditTimer=setTimeout(()=>{if(playback===current)void current.refresh().catch(error=>{if(playback===current)message('playback edit: '+error.message,true);});},90);
}
function commitChange(before){
 // A keyboard edit commits through the canonical document path and redraws
 // the Sound inspector. Restore its diagram handle so successive arrow presses
 // remain usable rather than silently returning focus to the document body.
 const focused=document.activeElement;
 const panel=focused?.closest?.(".visual-sound-panel");
 const graphFocus=panel&&focused?.classList.contains("visual-graph-point")?
  {id:panel.dataset.visualId,handle:focused.dataset.handle}:null;
 history.push(before);
 songEditRevision++;
 if(history.length>100)history.shift();
 future=[];store();render();
 if(graphFocus){
  const replacement=[...document.querySelectorAll(".visual-sound-panel")]
   .find(item=>item.dataset.visualId===graphFocus.id);
  replacement?.querySelector('.visual-graph-point[data-handle="'+graphFocus.handle+'"]')
   ?.focus({preventScroll:true});
 }
 refreshPlayback();
 return true;
}
function modify(change){
 const before=snapshot(currentDocument());
 change();
 const referenced=referencedSampleIds(beat.instruments);
 beat.samples=beat.samples.filter(asset=>referenced.has(asset.id));
 if(song){synchronizeLinkedFreeform(song);pruneUnusedRecordings(song);upgradeSongFeatures(song);}else upgradeBeatFeatures(beat);
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
 synchronizeLinkedFreeform(song);
 pruneUnusedRecordings(song);
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
 restoreDocument(history.pop());songEditRevision++;
 store();
 render();
 refreshPlayback();
}
function redo() {
 if (!future.length) return;
 closePicker();
 history.push(snapshot(currentDocument()));
 restoreDocument(future.pop());songEditRevision++;
 store();
 render();
 refreshPlayback();
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
  const el=createInstrumentCard(inst,{
   selected,accent:signal(inst),onSelect:()=>{closePicker();focus(inst);}
  });
  item.append(el,createInstrumentActionMenu({label:"Actions for "+inst.name,actions:[
   {label:"Rename",run:()=>renameInstrument(inst)},
   {label:instrumentDeleteLabel(inst),danger:true,run:()=>removeInstrument(inst.id)}
  ]}));
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

const noteLabel=noteLabelForPitch;
for(const control of [$("sound-reference"),$("import-root")])
 populateSoundInspectorReferenceNotes(control);
function selectSound(entry){
 selectedSounds.set(instrument().id,entry.id);selectedNoteId=null;
 if(inspectorState==="closed")setInspector("expanded");
 renderNotes();renderSound();
}
function renderRack(root,inst,chunk){
 const scroll=root.parentElement,top=scroll.scrollTop,left=scroll.scrollLeft;
 root.replaceChildren();root.style.setProperty("--track-accent",signal(inst));
 root.setAttribute("aria-label","Sound rack · "+inst.name);
 for(const {rowData,row,label:name,surface,head} of renderPianoRollRows(inst)){
  const entry=inst.sounds.find(sound=>sound.id===rowData.soundId);
  if(!entry)continue;
  row.classList.toggle("selected-sound",sound(inst).id===entry.id);
  row.dataset.soundId=entry.id;
  name.textContent=(sound(inst).id===entry.id?"✓ ":"")+entry.name;
  name.addEventListener("click",()=>selectSound(entry));
  name.setAttribute("aria-pressed",String(sound(inst).id===entry.id));
  name.setAttribute("aria-label","Edit sound "+entry.name);name.title=entry.name;
  const position=inst.sounds.indexOf(entry);
  head.append(actionMenu("Actions for "+entry.name,[
   {label:"Rename",run:()=>renameRackSound(inst,entry)},
   {label:"Replace sound",run:()=>{focus(inst);selectSound(entry);openLibrary("replace-row");}},
   {label:"Move to piano roll",disabled:!canMoveRackSoundToPianoRoll(beat,inst.id,entry.id),
    run:()=>extractSoundToPianoRoll(inst.id,entry.id)},
   {label:"Duplicate sound",disabled:inst.sounds.length>=MAX_SOUNDS,run:()=>duplicateRackSound(inst.id,entry.id)},
   {label:"Move up",disabled:position===0,run:()=>moveRackSound(inst.id,entry.id,-1)},
   {label:"Move down",disabled:position===inst.sounds.length-1,run:()=>moveRackSound(inst.id,entry.id,1)},
   {label:soundDeleteLabel(inst),danger:true,run:()=>removeRackSound(inst.id,entry.id)}
  ],"rack-actions"));
  for(let step=0;step<16;step++){
   const existing=noteStartingAtPianoStep(chunk.notes,rowData,step);
   const cell=createPianoNoteSurface({className:"note rack-step"+(step%4===0?" beat":""),onClick:event=>{
    selectedSounds.set(inst.id,entry.id);
    if(existing&&editingNoteEffects){selectedNoteId=existing.id;renderNotes();renderSound();return;}
    if(existing){selectedNoteId=null;modify(()=>applyNoteCommand(chunk,{type:"note.delete",noteId:existing.id}));return;}
    const note={id:id(),soundId:entry.id,start:step,duration:1,velocity:DEFAULT_NOTE_LEVEL};
    selectedNoteId=editingNoteEffects?note.id:null;
    if(modify(()=>applyNoteCommand(chunk,{type:"note.add",note},{layout:"rack",sounds:inst.sounds}))&&!playback&&!pendingPlay)
     void audition(inst,entry.referencePitch,beat,{soundId:entry.id,velocity:note.velocity}).catch(()=>{});
   }});
   cell.textContent=existing?"●":"";
   applyPianoNoteState(cell,{
    head:!!existing,selected:editingNoteEffects&&existing?.id===selectedNoteId,
    bent:!!existing?.bend?.shape&&existing.bend.shape!=="straight"
   });
   cell.setAttribute("aria-label",entry.name+", step "+(step+1)+(existing?", hit; "+Math.round(existing.velocity*100)+"% level":"; add hit"));
   cell.setAttribute("aria-pressed",String(!!existing));
   cell.title=existing?(editingNoteEffects?"Edit hit effects":"Remove hit")+" · right-click effects":"Add hit";
   cell.addEventListener("contextmenu",event=>{
    // Only actual hits open the inspector; retain the native menu on empty steps.
    const hit=noteStartingAtPianoStep(chunk.notes,rowData,step);
    if(!hit)return;
    event.preventDefault();
    selectedSounds.set(inst.id,entry.id);
    setNoteEffectsMode(true,hit.id,false);
   });
   cell.addEventListener("keydown",event=>{
    if(existing&&["Delete","Backspace"].includes(event.key)){
     event.preventDefault();modify(()=>applyNoteCommand(chunk,{type:"note.delete",noteId:existing.id}));
    }
   });
   surface.append(cell);
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
  ()=>modify(()=>{applyNoteCommand(chunk,{type:"note.delete",noteId:note.id});selectedNoteId=null;}),
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
 if(inst.layout==="rack"){keyboardPiano?.stop();renderRack(root,inst,chunk);return;}
 const scroll = root.parentElement, top = scroll.scrollTop, left = scroll.scrollLeft;
 root.replaceChildren();
 root.style.setProperty("--track-accent", signal(inst));
 const scaleGuide=scaleGuideFor();
 const scaleActive=scaleGuide.mode!=="chromatic";
 const scaleMode=SCALE_MODES.find(mode=>mode.id===scaleGuide.mode);
 const directionalScale=!!scaleMode?.descendingSteps;
 const keys=[];
 const keyByPitch=new Map();
 const rowPreviews=new Map();
 let draggedNoteId=null;
 // The keyboard is a viewport boundary, not a separate note-on lane.
 const activeBar=selectedSlot.instrumentId===inst.id&&
  inst.timeline[selectedSlot.bar]===chunk.id?selectedSlot.bar:null;
 let continuationPreview=null;
 let incomingResizePreview=null;
 const visibleNotes=()=>{
  const notes=continuationPreview?chunk.notes.map(note=>
   note.id===continuationPreview.noteId?{...note,start:0,
    pitch:continuationPreview.pitch,
    duration:Math.max(0,continuationPreview.relativeEnd),
    continuation:true,preview:true}:note).filter(note=>note.duration>0):chunk.notes;
  const incoming=activeBar===null?[]:incomingChunkSustains(beat,inst.id,activeBar);
  const tails=incomingResizePreview?incoming.map(entry=>
   entry.sourceBar===incomingResizePreview.sourceBar&&
   entry.sourceNoteId===incomingResizePreview.sourceNoteId?
   {...entry,duration:incomingResizePreview.duration}:entry):incoming;
  return [...notes,...tails];
 };
 function openIncomingContinuation(note,effects=false){
  selectedSlot={instrumentId:inst.id,bar:note.sourceBar};
  selectedChunks.set(inst.id,note.sourceChunkId);
  selectedNoteId=effects?note.sourceNoteId:null;
  editingNoteEffects=effects;
  render();
 }
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
  paintPianoScale(keys,keyByPitch,scaleGuide,chunk.notes,step,noteLabel);
 }
 function focusScaleStep(step){
  if(scaleFocusStep===step)return;
  scaleFocusStep=step;
  paintKeys(step);
 }

 for (const {rowData,row,label,surface} of renderPianoRollRows(inst,{
  keyboard:showPianoKeys,low:36,high:83,noteLabel,
  onPlay:(pitch,key)=>{
   key.classList.add("pressed");
   setTimeout(()=>key.classList.remove("pressed"),220);
   if(!playback&&!pendingPlay)
    void audition(inst,pitch,beat).catch(error=>message("Couldn't preview key: "+error.message,true));
  }
 })) {
  const pitch=rowData.pitch;
  keys.push({rowData,pitch,row,label});
  const cells = [];
  function previewRow() {
   for (let pos = 0; pos < 16; pos++) {
    const present = noteAtPianoStep(visibleNotes(),rowData,pos);
    const cell = cells[pos];
    applyPianoNoteState(cell,{
     head:!!present&&!present.continuation&&present.start===pos,
     tail:!!present&&(!!present.continuation||present.start!==pos),
     end:!!present&&present.start+present.duration-1===pos,
     selected:editingNoteEffects&&!!present&&present.id===selectedNoteId,
     bent:!!present&&!!present.bend?.shape&&present.bend.shape!=="straight",
     dragging:!!present&&present.id===draggedNoteId
    });
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
     + (present ? (present.continuation?", held from earlier Chunk; click to view the original":", note length " + present.duration + " steps; " + (editingNoteEffects?"click to edit note effects":"click to remove") + "; hold and drag to move") :
      cell.disabled?", adding notes restricted":", click to add note"));
    cell.title = present?.continuation?"Held from previous Chunk · drag the right end to extend or click to edit original":present ? (editingNoteEffects?"Click to shape note":"Click to remove") + " · hold and drag to move · drag end to resize · right-click effects" : "Add " + noteLabel(pitch) + " · drag to extend";
   }
  }

  rowPreviews.set(pitch,previewRow);
  for (let step = 0; step < 16; step++) {
   let ignoreClick = false;
   const cell = createPianoNoteSurface({className:"note"+(step%4===0?" beat":""),onClick:event=>{
    if (ignoreClick) return;
    const targetInst = instrument();
    const editedChunk = chunkFor(targetInst);
    const existing = noteAtPianoStep(visibleNotes(),rowData,step);
    if(existing?.continuation){openIncomingContinuation(existing,editingNoteEffects);return;}
    if(existing && editingNoteEffects){
     selectedNoteId=existing.id;
     renderNotes();
     return;
    }
    if(existing){
     selectedNoteId=null;
     modify(()=>applyNoteCommand(editedChunk,{type:"note.delete",noteId:existing.id}));
     return;
    }
    if(scaleGuide.lock&&!isPitchInScaleAtStep(pitch,scaleGuide,editedChunk.notes,step))return;
    const created={id:id(),pitch,start:step,
     duration:1,velocity:DEFAULT_NOTE_LEVEL};
    selectedNoteId=editingNoteEffects?created.id:null;
    if(modify(()=>applyNoteCommand(editedChunk,{type:"note.add",note:created}))){
     tapPianoKey(pitch);
     if(!playback&&!pendingPlay)
      void audition(targetInst,pitch,beat,{velocity:created.velocity}).catch(()=>{});
    }
   }});
   cells.push(cell);
   cell.addEventListener("contextmenu",event=>{
    // A note tail is still the same note. Never add/remove on a right-click.
    const note=noteAtPianoStep(visibleNotes(),rowData,step);
    if(!note)return;
    event.preventDefault();
    if(note.continuation){openIncomingContinuation(note,true);return;}
    setNoteEffectsMode(true,note.id,false);
   });
   cell.addEventListener("pointerenter",()=>focusScaleStep(step));
   cell.addEventListener("focus",()=>focusScaleStep(step));

   // End-cap resizing keeps priority; drag a note body to move it.
   // Empty-cell pointerdown creates immediately, allowing one-gesture length painting.
   bindPianoNoteGesture(cell,{
    stepWidth:()=>cell.getBoundingClientRect().width,
    rowHeight:()=>cell.getBoundingClientRect().height,
    begin:event=>{
     const existing=noteAtPianoStep(visibleNotes(),rowData,step);
     if(existing?.continuation){
      const bounds=cell.getBoundingClientRect();
      const atTailEnd=step===existing.start+existing.duration-1&&
       event.clientX>=bounds.right-noteEndGrabWidth(bounds.width,event.pointerType);
      if(!atTailEnd)return null;
      const previous=inst.chunks.find(entry=>entry.id===existing.sourceChunkId)
       ?.notes.find(entry=>entry.id===existing.sourceNoteId);
      if(!previous)return null;
      const originalDuration=previous.duration,before=snapshot(currentDocument());
      let nextDuration=originalDuration;
      return {
       mode:"resize",
       grab:()=>{ignoreClick=true;draggedNoteId=existing.id;},
       preview:({steps})=>{
        nextDuration=Math.max(1,Math.min(MAX_BEAT_BARS*16,originalDuration+steps));
        incomingResizePreview={sourceBar:existing.sourceBar,
         sourceNoteId:existing.sourceNoteId,duration:nextDuration};
        rowPreviews.get(pitch)?.();
       },
       finish:({cancelled})=>{
        incomingResizePreview=null;
        draggedNoteId=null;
        let changed=false;
        if(!cancelled&&nextDuration!==originalDuration){
         const result=resizeIncomingSustain(beat,{
          instrumentId:inst.id,sourceBar:existing.sourceBar,
          sourceNoteId:existing.sourceNoteId,duration:nextDuration
         });
         if(result.changed){
          if(song){synchronizeLinkedFreeform(song);upgradeSongFeatures(song);}
          const problems=[...validate(beat),...(song?validateSong(song):[])];
          if(problems.length){restoreDocument(before);message(problems[0],true);render();}
          else changed=true;
         }else message(result.reason,true);
        }
        rowPreviews.get(pitch)?.();
        ignoreClick=true;
        if(changed)setTimeout(()=>commitChange(before),0);
        else setTimeout(()=>{ignoreClick=false;},0);
       }
      };
     }
     if(!existing && (cell.disabled ||
      (scaleGuide.lock && !isPitchInScaleAtStep(pitch,scaleGuide,chunk.notes,step))))return null;
     const bounds=cell.getBoundingClientRect();
     const atEnd=!!existing&&step===existing.start+existing.duration-1&&
      event.clientX>=bounds.right-noteEndGrabWidth(bounds.width,event.pointerType);
     const mode=existing?(atEnd?"resize":"move"):"paint";
     const before=snapshot(currentDocument()),previousSelectedNoteId=selectedNoteId;
     const note=existing??{id:id(),pitch,start:step,duration:1,velocity:DEFAULT_NOTE_LEVEL};
     const original=existing?{start:existing.start,pitch:existing.pitch,duration:existing.duration}:null;
     if(mode==="paint"){
      applyNoteCommand(chunk,{type:"note.add",note});
      selectedNoteId=editingNoteEffects?note.id:null;
      ignoreClick=true;draggedNoteId=note.id;previewRow();
      tapPianoKey(pitch);
      if(!playback&&!pendingPlay)
       void audition(inst,pitch,beat,{velocity:note.velocity}).catch(()=>{});
     }
     return {
      mode,
      grab:()=>{
       ignoreClick=true;draggedNoteId=note.id;previewRow();
      },
      preview:({steps,pitches})=>{
       const oldPitch=note.pitch;
       if(mode==="move"){
        // The WHOLE-note move, not a left-edge resize, can cross the keyboard.
        Object.assign(note,original);
        continuationPreview=activeBar!==null&&original.start+steps<0?
         (()=>{const candidate=continuationProposal(beat,{
          instrumentId:inst.id,bar:activeBar,noteId:note.id,steps,pitches
         });return candidate.ok?{...candidate,noteId:note.id}:null;})():null;
        if(!continuationPreview)applyNoteCommand(chunk,{type:"note.move",noteId:note.id,
         start:original.start+steps,pitch:original.pitch+pitches},
         {minPitch:36,maxPitch:83,allowSustain:[SUSTAIN_BEAT_VERSION,CAPTURED_AUTOMATION_BEAT_VERSION].includes(beat.version)});
       }else
        applyNoteCommand(chunk,{type:"note.resize",noteId:note.id,
         duration:(original?.duration??1)+steps},
         {allowSustain:true});
       rowPreviews.get(oldPitch)?.();
       if(note.pitch!==oldPitch)rowPreviews.get(note.pitch)?.();
      },
      finish:({cancelled,steps,pitches})=>{
       const oldPitch=note.pitch;
       let continued=false;
       if(!cancelled&&mode==="move"&&continuationPreview){
        Object.assign(note,original);
        const result=continueNoteFromEarlierChunk(beat,{
         instrumentId:inst.id,bar:activeBar,noteId:note.id,steps,pitches
        });
        if(result.changed){
         selectedChunks.set(inst.id,result.currentChunkId);
         selectedNoteId=null;
         if(song){synchronizeLinkedFreeform(song);upgradeSongFeatures(song);}
         const problems=[...validate(beat),...(song?validateSong(song):[])];
         if(problems.length){
          restoreDocument(before);
          message(problems[0],true);
        }else continued=true;
        }else message(result.reason,true);
       }
       continuationPreview=null;
       if(cancelled){
        if(mode==="paint"){
         chunk.notes=chunk.notes.filter(item=>item.id!==note.id);
         selectedNoteId=previousSelectedNoteId;
        }else Object.assign(note,original);
        ignoreClick=true;
       }
       let changed=!cancelled&&(continued||mode==="paint"||
        note.start!==original.start||note.pitch!==original.pitch||note.duration!==original.duration);
       if(changed){
        upgradeBeatFeatures(beat);
        if(song){synchronizeLinkedFreeform(song);upgradeSongFeatures(song);}
        const problems=[...validate(beat),...(song?validateSong(song):[])];
        if(problems.length){
         restoreDocument(before);
         message(problems[0],true);
         render();
         changed=false;
        }
       }
       draggedNoteId=null;
       rowPreviews.get(oldPitch)?.();
       if(note.pitch!==oldPitch)rowPreviews.get(note.pitch)?.();
       if(changed){
        ignoreClick=true;
        setTimeout(()=>commitChange(before),0);
       }else setTimeout(()=>{ignoreClick=false;},0);
      }
     };
    }
   });
   // Backspace/Delete removes a selected note without hijacking text inputs.
   cell.addEventListener("keydown",event=>{
    if(!["Backspace","Delete"].includes(event.key))return;
    const selected=chunk.notes.find(n=>n.id===selectedNoteId);
    if(!selected||selected.pitch!==pitch||step<selected.start||step>=selected.start+selected.duration)return;
    event.preventDefault();
    const id=selectedNoteId;selectedNoteId=null;
    modify(()=>applyNoteCommand(chunk,{type:"note.delete",noteId:id}));
   });
   // Keyboard support is also immediate and uses the canonical undo pathway.
   cell.addEventListener("keydown", event => {
    if (!event.altKey || !["ArrowLeft","ArrowRight"].includes(event.key)) return;
    const target = noteAtPianoStep(chunk.notes,rowData,step);
    if (!target) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    modify(() => applyNoteCommand(chunk,{type:"note.resize",noteId:target.id,duration:target.duration+delta},{allowSustain:true}));
   });
   surface.append(cell);
  }
  root.append(row);
  previewRow();
 }
 if(showPianoKeys){
  const keyboard=mountPianoKeyOverlay({
   noteLabel, onPlay:pitch=>{
    tapPianoKey(pitch);
    if(!playback&&!pendingPlay)
     void audition(inst,pitch,beat).catch(error=>message("Couldn't preview key: "+error.message,true));
   }
  });
  root.append(keyboard.element);
  for(const [pitch,key] of keyboard.keys)keyByPitch.set(pitch,key);
 }
 const playhead = element("div", undefined, "piano-playhead");
 playhead.setAttribute("aria-hidden", "true");
 playhead.hidden = true;
 root.append(playhead);
 paintKeys(scaleFocusStep);
 paintPianoPlayhead();
 keyboardPiano?.refresh();
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
 if(document.querySelector("main")?.matches(".editing-freeform,.editing-vocal"))return;
 mountSoundInspectorChrome($("sound-section"),{owner:"beat"});
 const inst=instrument(),entry=sound(inst),patch=entry.patch;
 const hear=$("hear-sound");
 hear.textContent="▶";
 hear.title=inst.layout==="rack"?"hear rack sounds one at a time":"hear current sound";
 hear.setAttribute("aria-label",inst.layout==="rack"?"Hear rack sounds one at a time":"Hear current sound");
 $("instrument-name").value=inst.name;
 document.querySelector(".controls")?.style.setProperty("--track-accent",signal(inst));
 $("synth-editor").style.setProperty("--track-accent",signal(inst));
 const onChange=(path,value)=>{
  const changed=modify(()=>{
   const target=sound().patch;
   assignSoundEdit(target,path,value);
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
 // The persistent Beat header hosts the same Inspector's primary controls
 // that the attached freeform Song editor mounts in its own Sound view.
 // Reparent the nodes before rebuilding their previous illustration owners.
 const primary=document.querySelector(".sound-quick-controls");
 const primaryKeys=["primary-brightness-dial","primary-attack-dial","primary-release-dial"];
 for(const key of primaryKeys){
  const node=$(key);
  if(node.parentElement!==primary)primary.append(node);
 }
 bindSoundInspectorIdentity({
  sound:entry,nameInput:$("sound-name"),referenceInput:$("sound-reference"),
  onRename:value=>{if(sound().id===entry.id)modify(()=>{sound().name=value;});},
  onReferencePitch:value=>{if(sound().id===entry.id)modify(()=>{sound().referencePitch=value;});}
 });
 $("move-sound-up").disabled=inst.sounds.indexOf(entry)===0;
 $("move-sound-down").disabled=inst.sounds.indexOf(entry)===inst.sounds.length-1;
 $("duplicate-sound").disabled=inst.sounds.length>=MAX_SOUNDS;
 $("remove-sound").disabled=false;
  $("remove-sound").textContent=soundDeleteLabel(inst);
 $("sound-controls").hidden=inst.layout!=="rack";
 $("save-row-sound").hidden=inst.layout!=="rack";
 bindSoundInspectorCatalogActions({
  instrument:inst,browseButton:$("change-sound"),saveButton:$("save-sound"),
  rowBrowseButton:$("replace-row-sound"),rowSaveButton:$("save-row-sound"),
  onBrowse:mode=>openLibrary(mode),onSave:wholeRack=>openPresetSave(wholeRack)
 });
 $("convert-rack").hidden=inst.layout==="rack";
 $("convert-rack").disabled=!!inst.automation||!canConvertToRack(inst);
 $("convert-rack").title=inst.automation?"remove automation before converting to rack":canConvertToRack(inst)?"convert this instrument into a one-sound rack":"requires a single pitch without overlapping hits";
 $("convert-pitched").hidden=inst.layout!=="rack";
 $("convert-pitched").textContent=inst.sounds.length===1?"convert to piano roll":"extract sound to piano roll";
 $("convert-pitched").disabled=!canMoveRackSoundToPianoRoll(beat,inst.id,entry.id);
 $("convert-pitched").title=entry.referencePitch<36||entry.referencePitch>96?
  "Reference note must be within C2–C7 to use the piano roll":
  beat.instruments.length>=12&&inst.sounds.length>1?
  "The beat already has 12 instruments": "Move this sound to its own piano-roll instrument";
 $("sound-section").setAttribute("aria-label",
  "sound editor for "+inst.name+(inst.layout==="rack"?" / "+entry.name:""));

 renderSoundInspectorCore({
  instrument:inst,sound:entry,context:beat,
  modulesRoot:$("synth-editor"),scopeRoot:$("sound-visualizer"),
  volumeRoot:$("instrument-volume-dial"),gainRoot:$("sound-volume-dial"),
  primaryRoots:primaryKeys.map(key=>$(key)),
  accent:signal(inst),
  sampleNames:patch.type==="sample"?patch.zones.map(zone=>
   beat.samples.find(asset=>asset.id===zone.assetId)?.name||zone.assetId).join(" / "):"",
  onReplaceSample:()=>openAudioReplace(),
  onPatchChange:onChange,
  onLevelChange:(kind,value)=>modify(()=>{
   if(kind==="volume")instrument().volume=value;
   else sound().gain=value;
  }),
  onStageChange:edits=>modify(()=>{
   for(const [keys,value] of edits){
    if(keys[0]==="volume")instrument().volume=value;
    else if(keys[0]==="gain")sound().gain=value;
    else if(keys[0]==="pan"){
     sound().patch.pan=value;
     sound().patch.presetId="custom";
    }
   }
  }),
  onAutomation:(root,current,source)=>
   renderAutomation(root,{...current,automation:current.automation??sound().patch.automation},source,block=>{
    const changed=modify(()=>{
     const target=instrument().automation!==undefined?instrument():sound().patch;
     if(block)target.automation=block;else delete target.automation;
    });
    if(changed&&playback)message("automation updated");
   })
 });
 $("remove-instrument").disabled=false;
 $("remove-instrument").textContent=instrumentDeleteLabel(inst);
}
// Song clips use the existing lower Beat editing space, not a second window.
function renderVocalWorkspace(){
 const selected=songExpanded? songUI?.getSelectedVocal():null;
 const active=!!selected?.recording,root=$("vocal-editor");
 document.querySelector("main")?.classList.toggle("editing-vocal",active);
 if(active)keyboardPiano?.stop();
 if(!active){renderVocalEditor(root,null,{});if(soundInspectorOwner()==="vocal")renderSound();return;}
 const target=clipId=>{const entry=songUI?.getSelectedVocal();return entry?.clip.id===clipId?entry:null;};
 renderVocalEditor(root,selected,{
  onApply:(clipId,changes)=>{
   const entry=target(clipId);if(!entry)return;
   modifySong(()=>{
    if(Object.hasOwn(changes,"gain"))entry.clip.gain=changes.gain;
    const effects=Object.fromEntries(Object.entries(changes).filter(([key])=>key!=="gain"));
    if(Object.keys(effects).length)
     entry.clip.effects={...(entry.clip.effects||{}),...effects};
    if(Object.hasOwn(changes,"transpose")){
     const remaining=entry.recording.durationSeconds-entry.recording.trimSeconds-(entry.clip.trimStartSeconds??0)-(entry.clip.trimEndSeconds??0);
     entry.clip.lengthSteps=Math.max(1,Math.ceil(remaining/Math.pow(2,changes.transpose/12)*song.bpm*4/60));
    }
   });
  },
  onTrim:(clipId,value,edge="start")=>{
   const entry=target(clipId);if(!entry)return;
   const remaining=entry.recording.durationSeconds-entry.recording.trimSeconds;
   if(!Number.isFinite(value)||value<0||value>=remaining-.01){
    message("Trim must leave some audible recording.",true);return;
   }
   modifySong(()=>trimVocalClip(song,clipId,value,edge));
  },
  onDuplicate:clipId=>{
   if(!target(clipId))return;
   let copied=null;
   if(modifySong(()=>{copied=duplicateVocalClip(song,clipId);}))songUI.select(copied.id);
  },
  onUseInBeat:async clipId=>{
   const entry=target(clipId);if(!entry)return;
   const {clip,recording}=entry,remaining=recording.durationSeconds-recording.trimSeconds-(clip.trimStartSeconds??0)-(clip.trimEndSeconds??0);
   if(remaining>4){message("Beat samples support up to four seconds. Trim this phrase first.",true);return;}
   if(beat.instruments.length>=12){message("Maximum 12 instruments.",true);return;}
   try{
    // Compatible PCM WAV voices keep one canonical external asset in Song,
    // Beat, Undo and portable ZIP. WebM/MP4 or oversized files still convert.
    const reference=linkedVocalSample(recording,clip,getAsset(recording.id));
    let asset=reference?.asset,zone=reference?.zone;
    if(!reference){
     const decoded=await decodeVocalRecording(recording);
     const from=recording.trimSeconds+(clip.trimStartSeconds??0);
     const frames=Math.round(remaining*RECORDING_RATE);
     const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));
     const input=channels.map(()=>new Float32Array(frames));
     for(let n=0;n<frames;n++){
      const pos=(from+n/RECORDING_RATE)*decoded.sampleRate,lo=Math.floor(pos),hi=Math.min(decoded.length-1,lo+1),frac=pos-lo;
      if(lo<0||lo>=decoded.length)continue;
      for(let ch=0;ch<channels.length;ch++)input[ch][n]=channels[ch][lo]*(1-frac)+channels[ch][hi]*frac;
     }
     const wav=encodePcmWav(input);
     asset=makeSampleAsset("voice-sample-"+id(),recording.name.slice(0,60),"audio/wav",wav,
      "Excerpt from Song vocal "+recording.id);
     zone={assetId:asset.id,root:60};
    }
    const fx=vocalEffects(clip);
    const patch={type:"sample",presetId:"custom",zones:[zone],
     followPitch:false,oneShot:true,transpose:fx.transpose,gain:clip.gain,
     audioMode:"clip",stereoWidth:fx.stereoWidth,msBalance:fx.msBalance,delayTone:fx.delayTone,delayPingPong:fx.delayPingPong,eq:fx.eq,filterStages:fx.filterStages,delaySync:clip.effects?.delaySync,chain:fx.chain,attack:fx.attack,release:fx.release,pan:fx.pan,drive:fx.drive,
     delayMix:fx.delayMix,delayTime:fx.delayTime,delayFeedback:fx.delayFeedback,modulation:fx.modulation,automation:fx.automation,
     movement:fx.movement,bend:fx.bend};
    if(fx.filter)patch.filter=fx.filter;
    const ok=applySoundSelection(patch,recording.name.slice(0,60),"hit",[asset],
      {mode:"add",instrumentId:instrument().id,soundId:sound().id},null,{volume:1,gain:1});
    if(ok){
     songUI.select(null);message(reference?"Linked vocal to Beat without copying audio.":"Added a vocal excerpt to Beat.");

    }
   }catch(error){message("Could not use vocal in Beat: "+error.message,true);}
  },
  onBack:()=>songUI.select(null),
  onUndo:undo,onRedo:redo,bpm:song.bpm,song,
  onRename:(clipId,value)=>{if(target(clipId))modifySong(()=>renameVocalRecording(song,clipId,value));},
  onSelect:clipId=>songUI.select(clipId),onRecord:()=>$("song-record").click(),
  onMove:(clipId,step)=>{const entry=target(clipId);if(entry)modifySong(()=>{entry.clip.startStep=step;});},
  inspectorOpen:inspectorState!=="closed",wide:inspectorViewport.matches,canUndo:history.length>0,canRedo:future.length>0,
  onInspectorOpen:open=>setInspector(open?"expanded":"closed"),
  onSave:clipId=>openPresetSave(false,{kind:"vocal",clipId}),
  onBrowse:clipId=>openLibrary("replace",{kind:"vocal",clipId})
 });
}
function render() {
 repairSelection();
 syncInspector();
 $("note-mode").setAttribute("aria-pressed",String(editingNoteEffects));
 $("note-mode").textContent="✎";
 $("note-mode").setAttribute("aria-label",editingNoteEffects?"finish editing note effects":"edit note effects");
 $("note-mode").title=editingNoteEffects?"finish editing note effects":"edit note effects";
 beatWorkspace?.classList.toggle("editing-note-effects",editingNoteEffects);
 beatWorkspace.querySelector(".notes-section")?.classList.toggle("editing-note-effects",editingNoteEffects);
 $("title").value = beat.title;
 $("bpm").value = String(song&&songExpanded?song.bpm:beat.bpm);
 $("bars").value = String(beat.bars);
 songUI?.render();
 renderVocalWorkspace();
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


function syncNoteEffectsInspector(){
 const panel=$("note-effects-section");
 panel.setAttribute("aria-hidden",String(!editingNoteEffects));
 $("note-effects-empty").hidden=!editingNoteEffects||!$("note-expression").hidden;
}
function syncInspector(){
 syncEditorInspector(beatEditor,{open:inspectorState!=="closed",
  noteEffects:editingNoteEffects,wide:inspectorViewport.matches});
}
function setInspector(state){
 inspectorState=state;
 syncInspector();
 songUI?.syncInspector();
 syncVocalInspector($("vocal-editor"),{open:state!=="closed",wide:inspectorViewport.matches});
}
inspectorViewport.addEventListener("change",event=>{
 // Wide and narrow desktop layouts use the same Sound element and editor.
 setInspector(event.matches?"expanded":"closed");
});
$("sound-toggle").addEventListener("click",()=>{
 setInspector(inspectorState==="closed"?"expanded":"closed");
});
bindBeatSound("sound-close","click",()=>setInspector("closed"));
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
 if (pendingPlay) { stop(); return; }
 pendingPlay = true;
 const playingSong=!!(song&&songExpanded),generation=++playbackGeneration;
 setPlaybackButton(false,playingSong);
 try {
  const session = await play(() => playingSong?song:beat, {
   countIn,recording:captureOwner,onCountIn,getRevision:()=>songEditRevision,
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
 finally {
  // A stale Play completion must not clear a newer Play's pending state.
  if(generation===playbackGeneration){pendingPlay=false;if(!playback)setPlaybackButton(false,playingSong);}
 }
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
 try{$("voice-offset-ms").value=String(readRecordingAlignment());}
 catch{$("voice-offset-ms").value="0";saveRecordingAlignment(0);}
 const choice=$("voice-track"),selected=songUI?.getSelectedVocal();
 choice.replaceChildren();
 for(const track of song.tracks.filter(item=>item.kind==="vocal")){
  const option=document.createElement("option");option.value=track.id;option.textContent=track.name;
  choice.append(option);
 }
 const fresh=document.createElement("option");fresh.value="new";fresh.textContent="+ new voice track";choice.append(fresh);
 choice.value=selected?.track.id||song.tracks.find(item=>item.kind==="vocal")?.id||"new";
 voiceStatus("Play the Song and record your microphone from this bar.");
 showVocalState(!!vocalTake);
 if(!voiceDialog.open)voiceDialog.showModal();
});
$("voice-offset-ms").addEventListener("change",event=>{
 try{
  const ms=saveRecordingAlignment(event.target.value);
  event.target.value=String(ms);
  window.dispatchEvent(new Event("premidi-recording-alignment-change"));
 }catch(error){
  event.target.value=String(readRecordingAlignment());
  voiceStatus(error.message,true);
 }
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
 try{saveRecordingAlignment($("voice-offset-ms").value);}
 catch(error){voiceStatus(error.message,true);return;}
 const token=++voiceToken,originalId=song.id;
 const chosenBar=Math.max(1,Math.floor(Number($("voice-start-bar").value)||1));
 const requestedStep=songUI?.setStartStep((chosenBar-1)*16)??0;
 const countBars=Number($("voice-count-in").value);
 vocalRequest=true;
 $("voice-offset-ms").disabled=true;
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
  vocalStartStep=requestedStep;
  vocalTargetTrackId=$("voice-track").value==="new"?null:$("voice-track").value;
  vocalTake=prepared;
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
 if(song&&songExpanded)modifySong(()=>setSongTempo(song,next));
 else modify(()=>{beat.bpm=next;});
});
attachNumberScrub($("bars"));
$("bars").addEventListener("change", event => {
 const count=Number(event.target.value);
 if(!Number.isInteger(count)||count<1||count>MAX_BEAT_BARS){
  event.target.value=String(beat.bars);
  message("Beat length must be 1–64 bars.",true);
  return;
 }
 if(count===beat.bars)return;
 try{
  modify(()=>{
   resizeBeatBars(beat,count);
   selectedSlot.bar=Math.min(selectedSlot.bar,count-1);
  });
 }catch(error){
  event.target.value=String(beat.bars);
  message(error.message,true);
 }
});
$("add-instrument").addEventListener("click",()=>openLibrary("add"));
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
 if(presetSource?.kind==="vocal"){
  const selected=songUI?.getSelectedVocal();
  if(selected?.clip.id!==presetSource.clipId){message("Choose that vocal again before saving.",true);return false;}
  try{const item=presetFromProcessing(processingFromPatch({...vocalEffects(selected.clip),type:"sample"}),name);
   writeUserSounds([...savedSounds,item]);savedSounds.push(item);message("Saved "+name+" locally.");return true;
  }catch(error){message(error.message,true);return false;}
 }

 const freeLayer=presetSource?.kind==="freeform"?
  song?.tracks.find(track=>track.id===presetSource.trackId)?.freeform:null;
 const inst=presetSource?freeLayer?.instruments.find(item=>item.id===presetSource.instrumentId):instrument();
 const entry=presetSource?inst?.sounds.find(item=>item.id===presetSource.soundId):sound();
 if(!inst||!entry){message("That Sound was removed. Open Save preset again.",true);return false;}
 if(!name||name.length>60){message("Preset name must be 1–60 characters.",true);return false;}
 if(savedSounds.length>=100){message("Your sound library contains 100 presets.",true);return false;}
 try{
  const item=presetFromInstrument(inst,freeLayer??beat,{name,wholeRack,soundId:entry.id});
  await savePresetAssets(item.samples);
  writeUserSounds([...savedSounds,item]);savedSounds.push(item);
  message("Saved "+name+" locally.");
  return true;
 }catch(error){message("Could not save preset: "+error.message+". Export your beat to keep it.",true);return false;}
}
const presetDialog=$("save-preset-dialog"),presetForm=$("save-preset-form");
let presetRack=false,presetSaving=false,presetSource=null;
function openPresetSave(wholeRack=false,sourceOverride=null){
 if(sourceOverride?.kind==="vocal"){
  const selected=songUI?.getSelectedVocal();if(selected?.clip.id!==sourceOverride.clipId)return;
  presetSource=sourceOverride;presetRack=false;
  $("save-preset-title").textContent="save processing preset";
  $("save-preset-name").value=selected.recording.name+" variation";
  $("save-preset-confirm").disabled=false;presetDialog.showModal();$("save-preset-name").select();return;
 }

 const freeLayer=sourceOverride?.kind==="freeform"?
  song?.tracks.find(track=>track.id===sourceOverride.trackId)?.freeform:null;
 const inst=sourceOverride?freeLayer?.instruments.find(item=>item.id===sourceOverride.instrumentId):instrument();
 const entry=sourceOverride?inst?.sounds.find(item=>item.id===sourceOverride.soundId):sound();
 if(!inst||!entry){message("Choose a Sound before saving its preset.",true);return;}
 presetSource=sourceOverride; 
 presetRack=wholeRack;
 $("save-preset-title").textContent=wholeRack?"save rack preset":"save preset";
 $("save-preset-name").value=(wholeRack?inst.name:entry.name)+" variation";
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
bindBeatSound("hear-sound","click",()=>{
 const inst=instrument(),currentEntry=sound(inst);
 void auditionSoundInspector({
  instrument:inst,sound:sound(inst),context:beat,
  button:$("hear-sound"),previewPositions:rackPreviewPositions,
  auditionRequests:beatAuditionRequests,play:audition,duration:.6,
  isCurrent:()=>instrument().id===inst.id&&sound(inst).id===currentEntry.id,
  onError:error=>message("Could not preview sound: "+error.message,true)
 });
});
function allSounds(){return [...FACTORY_SOUND_CATALOG,...savedSounds];}
function openLibrary(mode,contextOverride=null) {
 closePicker();
 if(!contextOverride&&mode==="add"&&beat.instruments.length>=12)return;
 libraryMode=mode;libraryContext=contextOverride??currentContext(mode);
 libraryCategory="All";
 $("library-description").textContent=libraryContext.kind==="freeform"?
  mode==="add"?"new freeform instrument":mode==="replace-row"?
   "replace this freeform rack sound":"choose a sound or add a rack":
  mode==="add"?"new instrument":mode==="replace-row"?
   "replace this rack sound":"choose a sound or add a rack";
 renderLibrary();
 const dialog=$("instrument-dialog");
 if(!dialog.open)dialog.showModal();
}
const builtinCache=new Map();
async function resolveSamples(preset,selection=libraryContext) {
 await assetsReady;
 const ids=new Set(preset.sounds?preset.sounds.flatMap(sound=>sound.patch.type==="sample"?sound.patch.zones.map(zone=>zone.assetId):[]):
  preset.patch?.type==="sample"?preset.patch.zones.map(zone=>zone.assetId):preset.assets||[]);
 return Promise.all([...ids].map(async assetId=>{
  const freeformAssets=selection?.kind==="freeform"?
   song?.tracks.find(track=>track.id===selection.trackId)?.freeform?.samples||[]:[];
  const existing=(preset.samples||[]).find(asset=>asset.id===assetId)||
   freeformAssets.find(asset=>asset.id===assetId)||beat.samples.find(asset=>asset.id===assetId);
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
  if(context.kind==="vocal"||preset.processing){
   const source=preset.processing??processingFromPatch(preset.patch??(preset.assets?makeSamplerPatch(preset):makePatch(preset.id)));
   let ok=false;
   if(context.kind==="vocal"){
    const selected=songUI?.getSelectedVocal();if(selected?.clip.id!==context.clipId)throw Error("Vocal selection changed");
    ok=modifySong(()=>{selected.clip.effects=structuredClone(source);
     const remaining=selected.recording.durationSeconds-selected.recording.trimSeconds-(selected.clip.trimStartSeconds??0)-(selected.clip.trimEndSeconds??0);
     selected.clip.lengthSteps=Math.max(1,Math.ceil(remaining/2**((source.transpose??0)/12)*song.bpm*4/60));});
   }else if(context.kind==="freeform")ok=modifySong(()=>{
    const inst=song.tracks.find(t=>t.id===context.trackId)?.freeform?.instruments.find(i=>i.id===context.instrumentId);
    const entry=inst?.sounds.find(s=>s.id===context.soundId);if(!entry)throw Error("Sound selection changed");applyProcessingToPatch(entry.patch,source);
   });else ok=modify(()=>applyProcessingToPatch(sound().patch,source));
   if(ok){dialog.close();message("Loaded "+preset.name);}return;
  }
  const assets=await resolveSamples(preset,context);
  const patch=preset.sounds?patchCopy(preset.sounds[0].patch):getPreset(preset.id)?makePatch(preset.id):preset.patch?patchCopy(preset.patch):
   preset.assets?makeSamplerPatch(preset):makePatch(preset.id);
  // Example-derived patches retain their underlying factory identity, while
  // a selected saved variation must identify its own user preset in .premidi.
  if(preset.category==="Mine" || (!preset.patch && !preset.sounds))patch.presetId=preset.id;
  const trigger=presetTrigger(preset);
  const selected=context.kind==="freeform"?
   song?.tracks.find(track=>track.id===context.trackId)?.freeform?.instruments
    .find(item=>item.id===context.instrumentId):
   beat.instruments.find(item=>item.id===context.instrumentId);
  if(context.kind!=="freeform"&&context.mode!=="add"&&selected?.automation&&patch.type!=="synth"&&trigger==="pitched"&&!preset.sounds){
   message("Remove automation before replacing this instrument with a recording.",true);return;
  }
 const settings=(preset.sounds||preset.patch||preset.category==="Mine")?preset:null;
  let chosen=null;
  const ok=context.kind==="freeform"?modifySong(()=>{
   const layer=song?.tracks.find(track=>track.id===context.trackId)?.freeform;
   if(!layer)throw Error("The freeform lane was removed. Open the Sound library again.");
   chosen=applyFreeformPreset(layer,context,{
    name:preset.name,patch,trigger,assets,rackSounds:preset.sounds,settings,song
   });
  }):applySoundSelection(patch,preset.name,trigger,assets,context,preset.sounds,settings);
  if(ok) {
   dialog.close();
   if(chosen)songUI?.focusFreeformInstrument(context.trackId,chosen.instrumentId,chosen.soundId);
   const audioContext=context.kind==="freeform"?
    song?.tracks.find(track=>track.id===context.trackId)?.freeform:beat;
   if(playback&&audioContext)void primeSamples(audioContext)
    .catch(error=>message("Sample decode failed: "+error.message,true));
   message("Loaded "+preset.name);
  }
 }catch(error){message("Couldn't load "+preset.name+": "+error.message,true);}
}
async function auditionPreset(preset,previewControl=null) {
 if(libraryContext?.kind==="vocal"){
  const selected=songUI?.getSelectedVocal();if(!selected)return;
  const fx=preset.processing??processingFromPatch(preset.patch??(preset.assets?makeSamplerPatch(preset):makePatch(preset.id)));
  try{await auditionVocal({...selected,clip:{...selected.clip,effects:fx}},song.bpm);}catch(error){message(error.message,true);}return;
 }
 if(preset.processing){
  const inst=clone(instrument()),entry=inst.sounds.find(s=>s.id===sound().id)||inst.sounds[0];
  applyProcessingToPatch(entry.patch,preset.processing);
  try{await audition(inst,entry.referencePitch,beat,{soundId:entry.id,duration:.6});}catch(error){message(error.message,true);}return;
 }

 try {
  if(preset.sounds){
   const key="preset:"+preset.id;
   const choice=nextRackPreview(rackPreviewPositions,key,preset.sounds);
   const entry=choice.sound,request=(rackPreviewRequests.get(key)??0)+1;
   rackPreviewRequests.set(key,request);
   if(previewControl){
    previewControl.dataset.previewSoundId=entry.id;
    previewControl.textContent="▶ "+(choice.index+1)+"/"+choice.total;
    previewControl.title="Preview "+entry.name+" ("+(choice.index+1)+" of "+choice.total+")";
    previewControl.setAttribute("aria-label",previewControl.title);
   }
   // Load only the sampled row being auditioned, not an entire 11-row kit
   // for every click. A later click supersedes a still-loading preview.
   const samples=await resolveSamples({patch:entry.patch,samples:preset.samples});
   if(rackPreviewRequests.get(key)!==request || !$("instrument-dialog").open)return;
   const inst=makeInstrument(1,1,entry);
   inst.layout="rack";inst.volume=preset.volume??.7;
   await audition(inst,entry.referencePitch,{samples},{soundId:entry.id,duration:.6});
   return;
  }
  const patch=getPreset(preset.id)?makePatch(preset.id):preset.patch?patchCopy(preset.patch):
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
 const categories=["All","Guitars","Recorded","Drums","Textures","Bass","Lead","Keys","Pads","Winds","Percussion",...(savedSounds.length?["Mine"]:[])];
 for(const category of categories) {
  const control=button(category,()=>{libraryCategory=category;renderLibrary();},
   "library-filter"+(libraryCategory===category?" selected":""));
  control.setAttribute("aria-pressed",String(libraryCategory===category));
  filters.append(control);
 }
 if(!["freeform","vocal"].includes(libraryContext?.kind)&&["add","replace","replace-row"].includes(libraryMode)) {
  const record=button("● Record a sound",()=>openRecorder(libraryMode),"library-import library-record");
  const personal=button("＋ Import audio file",()=>$("sample-file").click(),"library-import");
  list.append(record,personal);
 }
 // Both entry points share a catalog. Only the explicitly row-scoped
 // Replace sound action excludes full racks.
 const matching=allSounds().filter(p=>
  (!p.processing||libraryMode!=="add")&&
  (libraryContext?.kind!=="vocal"||!p.sounds)&&
  (libraryMode!=="replace-row" || !p.sounds) &&
  (libraryCategory==="All" || p.category===libraryCategory ||
   (libraryCategory==="Drums" && p.category==="Mine" && !!p.sounds)));
 // A single sound appears before whole racks so rack choices are predictable.
 const grouped=[...matching.filter(p=>!p.sounds),...matching.filter(p=>p.sounds)];
 let rackHeading=false;
 for(const preset of grouped) {
  if(preset.sounds && !rackHeading){
   list.append(element("h3","preset racks","library-rack-heading"));
   rackHeading=true;
  }
  const card=element("div",undefined,"preset-card");
  card.dataset.presetId=preset.id;
  const info=element("div",undefined,"preset-information");
  info.append(element("strong",preset.name),element("span",preset.description));
  const actions=element("div",undefined,"preset-actions");
  const preview=button("▶",()=>{void auditionPreset(preset,preview);},"preset-preview");
  preview.title=preset.sounds?"Preview rack sounds one at a time":"Preview "+preset.name;
  preview.setAttribute("aria-label",preview.title);
  const freeLayer=libraryContext?.kind==="freeform"?
   song?.tracks.find(track=>track.id===libraryContext.trackId)?.freeform:null;
  const target=(freeLayer?.instruments||beat.instruments)
   .find(entry=>entry.id===libraryContext?.instrumentId);
  const willCreate=libraryMode==="add" || !!preset.sounds ||
   (libraryMode!=="replace-row" && target &&
    selectionOperation(target.layout,presetTrigger(preset),false).startsWith("create-"));
  const label=libraryMode==="replace-row"?"replace":preset.sounds?"add rack":
   willCreate?"add instrument":target?.layout==="rack"?"add sound":"use";
  const use=button(label,()=>{void chooseSound(preset);},"preset-choose");
  use.setAttribute("aria-label",label+" "+preset.name);
  const limit=freeLayer?64:12;
  const instrumentCount=freeLayer?.instruments.length??beat.instruments.length;
  use.disabled=!!willCreate && instrumentCount>=limit;
  if(use.disabled)use.title="maximum "+limit+" instruments";
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
bindBeatSound("remove-instrument","click",()=>removeInstrument(instrument().id));
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
function moveRackSound(instrumentId,soundId,offset){
 const inst=beat.instruments.find(item=>item.id===instrumentId);
 const index=inst?.sounds.findIndex(item=>item.id===soundId)??-1;
 if(!inst||inst.layout!=="rack"||index<0||index+offset<0||
  index+offset>=inst.sounds.length)return;
 modify(()=>{
  moveRackSoundRow(inst,soundId,offset);
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
bindBeatSound("move-sound-up","click",()=>moveRackSound(instrument().id,sound().id,-1));
bindBeatSound("move-sound-down","click",()=>moveRackSound(instrument().id,sound().id,1));
bindBeatSound("duplicate-sound","click",()=>duplicateRackSound(instrument().id,sound().id));
bindBeatSound("remove-sound","click",()=>removeRackSound(instrument().id,sound().id));
bindBeatSound("convert-rack","click",()=>{
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
bindBeatSound("convert-pitched","click",()=>{
 $("instrument-actions").open=false;
 extractSoundToPianoRoll(instrument().id,sound().id);
});
bindBeatSound("instrument-name","change", event => modify(() => instrument().name = event.target.value.trim() || "Instrument"));


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
 onSelectBeat:selectBeat,onChange:modifySong,onSelectionChange:renderVocalWorkspace,
 onError:error=>message(error,true),
 onFreeformBeatCreated:created=>message("Created \""+created.title+"\". Select + on a Beat Track to place it; your freeform notes are unchanged."),
 getFreeformScaleGuide:track=>scaleGuideFor({id:track.id,instruments:track.freeform?.instruments??[]}),
 setFreeformScaleGuide:(track,guide)=>setBeatScaleGuide({id:track.id,instruments:track.freeform?.instruments??[]},guide),
 onUndo:undo,onRedo:redo,getHistoryState:()=>({undo:history.length>0,redo:future.length>0}),
 getInspectorOpen:()=>inspectorState!=="closed",
 setInspectorOpen:open=>setInspector(open?"expanded":"closed"),
 getShowPianoKeys:()=>showPianoKeys,
 setShowPianoKeys:next=>{
  showPianoKeys=!!next;
  try{localStorage.setItem(PIANO_KEYS_PREF,showPianoKeys?"on":"off");}catch{}
 },
 onBrowseFreeform:selection=>openLibrary(selection.mode,{...selection,kind:"freeform"}),
 onSaveFreeform:selection=>openPresetSave(selection.wholeRack,{...selection,kind:"freeform"}),
 onFreeformActiveChange:active=>{
  const main=document.querySelector("main");
  main?.classList.toggle("editing-freeform",active);
  if(active)keyboardPiano?.stop();
  else{renderNotes();renderSound();}
  if(active)main?.classList.remove("editing-vocal");
 },
 onSeek:step=>{
  if(playback?.seek)void playback.seek(step).catch(error=>message('Native seek: '+String(error),true));
  if(voiceDialog.open&&!vocalRequest&&!vocalTake)
   $("voice-start-bar").value=String(Math.floor(step/16)+1);
 },
 onAddBeat:()=>{const next=create();next.bpm=song.bpm;addSongBeat(next,{inheritScale:true});},
 onImportBeat:()=>$("song-import-file").click()
});
initializeScaleControls();
keyboardPiano=installKeyboardPiano({
 toggle:$("qwerty-piano"),toolbar:beatWorkspace.querySelector(".piano-tools"),
 scroll:beatWorkspace.querySelector(".piano-scroll"),getInstrument:instrument,getBeat:()=>beat,
 playNote:auditionHeld
});
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
