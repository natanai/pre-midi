import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url),read=p=>readFileSync(new URL(p,root),"utf8");

test("the Song timeline is a separate layer before the unchanged Beat editor",()=>{
 const html=read("index.html"),css=read("style.css");
 for(const id of ["song-expand","song-panel","song-title","song-scroll","song-tracks",
  "song-timeline-footer","song-earlier","song-later","song-visible-bars","song-add-beat","song-beat-choice","song-new-beat","song-import-beat","song-add-track","song-clip-start",
  "song-clip-length","song-clip-remove","song-import-file","song-collapse"]){
  assert.ok(html.includes('id="'+id+'"'),"Missing Song control "+id);
 }
 assert.ok(html.indexOf('id="song-panel"')<html.indexOf('class="beat-header"'));
 assert.ok(html.indexOf('class="beat-header"')<html.indexOf('class="work"'));
 assert.match(css,/\.song-beat-clip/);
 assert.match(css,/\.song-clip-grip/);
 assert.match(css,/\.song-track-label/);
 assert.match(css,/\.song-beat-choice/);
 assert.ok(html.indexOf('id="song-add-beat"')>html.indexOf('id="song-tracks"'),"Add Beat belongs underneath Tracks");
 assert.doesNotMatch(html,/<button id="song-import-beat"[^>]*>Open/i);
 assert.match(html,/<button id="song-import-beat"[^>]*>Add \.premidi/);
});
test("Song Clip manipulation is live and keyboard accessible",()=>{
 const ui=read("songUI.js"),studio=read("studio.js");
 assert.match(ui,/setPointerCapture/);
 assert.match(ui,/ArrowUp/);
 assert.match(ui,/ArrowLeft/);
 assert.match(ui,/lengthSteps/);
 assert.match(ui,/startStep/);
 assert.match(ui,/song-track-open/);
 assert.match(ui,/viewportBars/);
 assert.match(ui,/timelinePages\+\+/);
 assert.match(ui,/song-beat-choice/);
 assert.match(studio,/selectBeat/);
 assert.match(studio,/addSongBeat/);
 assert.match(studio,/modifySong/);
 assert.match(studio,/currentDocument\(\)/);
 assert.match(studio,/parseDocument\(raw\)/);
});
test("native Song render events preserve layered Beat identities and offsets",async()=>{
 const {create}=await import("../schema.js"),{createSong,addSongTrack,addBeatClip}=await import("../songModel.js");
 const {renderEvents}=await import("../audio.js");
 const beat=create(),inst=beat.instruments[0];
 inst.chunks[0].notes.push({id:"held",pitch:69,start:2,duration:4,velocity:.8});
 const song=createSong(beat),lane=addSongTrack(song,"beat");
 addBeatClip(song,lane.id,beat.id,1,16);
 const events=renderEvents(song);
 assert.equal(events.length,2);
 assert.deepEqual(events.map(x=>x.at),[2,3].map(x=>x*60/song.bpm/4));
 assert.ok(events.every(x=>x.beat.id===beat.id&&x.note.id==="held"&&x.duration===60/song.bpm));
});
test("Song edits and Beat edits are covered by one undo history",()=>{
 const studio=read("studio.js");
 assert.match(studio,/snapshot\(currentDocument\(\)\)/);
 assert.match(studio,/restoreDocument\(history\.pop\(\)\)/);
 assert.match(studio,/restoreDocument\(future\.pop\(\)\)/);
});

test("Open and Add .premidi have separate project semantics",()=>{
 const studio=read("studio.js"),html=read("index.html");
 const open=studio.slice(studio.indexOf('$("file").addEventListener("change"'),studio.indexOf('$("export").addEventListener("click"'));
 assert.match(open,/resetTo\(next\)/);
 assert.doesNotMatch(open,/addSongBeat/,"Open must replace, not add to the current Song");
 assert.match(studio,/\$\("song-import-file"\)\.addEventListener\("change"/);
 assert.match(html,/<button id="import" type="button">Open \.premidi<\/button>/);
});

test("Song navigation lives above the native horizontal scrollbar",()=>{
 const html=read("index.html"),ui=read("songUI.js");
 assert.ok(html.indexOf('id="song-tracks"')<html.indexOf('id="song-timeline-footer"'));
 assert.ok(html.indexOf('id="song-timeline-footer"')<html.indexOf('id="song-beat-choice"'));
 assert.match(ui,/footer\.style\.width=totalWidth/);
 assert.match(ui,/updateVisibleBars\(\)/);
 assert.match(ui,/viewport\.scrollBy/);
});
test("one Export dialog supports both document scopes and formats",()=>{
 const html=read("index.html"),studio=read("studio.js");
 assert.match(html,/<button id="export"[^>]*>Export<\/button>/);
 assert.doesNotMatch(html,/id="wav"/);
 for(const value of ["beat","song"])assert.ok(html.includes('name="export-scope" value="'+value+'"'));
 for(const value of ["premidi","wav"])assert.ok(html.includes('name="export-format" value="'+value+'"'));
 assert.match(studio,/exportScope\("song"\)\.disabled=!song/);
 assert.match(studio,/exportFormat\("premidi"\)\.checked=true/);
 assert.match(studio,/scope==="song"\?song:beat/);
 assert.match(studio,/scope==="song"\?exportSongProject\(source\):exportProject\(source\)/);
 assert.match(studio,/await wav\(source\)/);
});
test("transport follows expanded Song or currently selected Beat",()=>{
 const studio=read("studio.js");
 assert.match(studio,/playingSong=!!\(song&&songExpanded\)/);
 assert.match(studio,/play\(\(\) => playingSong\?song:beat/);
 assert.match(studio,/if\(playback\|\|pendingPlay\)stop\(\)/);
 assert.match(studio,/setPlaybackButton\(true,playingSong\)/);
});

test("Song records vocals above Beats and keeps their bytes external",()=>{
 const html=read("index.html"),studio=read("studio.js"),ui=read("songUI.js");
 for(const id of ["song-record","song-vocal-level","song-vocal-level-field"])
  assert.ok(html.includes('id="'+id+'"'),"Missing vocal control "+id);
 assert.match(studio,/prepareSongTake\(\)/);
 assert.match(studio,/makeRecordingAsset/);
 assert.match(studio,/addVocalTake\(song,asset,\{startStep:vocalStartStep,trackId:vocalTargetTrackId\}\)/);
 assert.match(ui,/song-vocal-clip/);
 assert.match(ui,/track\.kind==="vocal"/);
 const model=read("songModel.js");
 assert.match(model,/Vocal Tracks must precede Beat Tracks/);
 assert.match(read("songIO.js"),/inspectRecordingBytes/);
});

test("Voice setup is explicit and recording starts at the selected Song bar",()=>{
 const html=read("index.html"),studio=read("studio.js"),ui=read("songUI.js"),audio=read("audio.js");
 assert.match(html, /id="song-record"[^>]*>● voice<\/button>/);
 for(const id of ["voice-dialog","voice-start","voice-start-bar","voice-count-in","voice-status","voice-close"])
  assert.ok(html.includes('id="'+id+'"'),"Missing voice dialog control "+id);
 assert.match(html,/play \+ record/);
 assert.match(studio,/voiceDialog\.showModal\(\)/);
 assert.match(studio,/await songCountIn\(/);
 assert.match(studio,/startStep:requestedStep/);
 assert.match(studio,/addVocalTake\(song,asset,\{startStep:vocalStartStep,trackId:vocalTargetTrackId\}\)/);
 assert.match(ui,/getStartStep:selectedStart/);
 assert.match(ui,/ruler\.addEventListener\("click"/);
 assert.match(audio,/startStep=0/);
 assert.match(audio,/scheduled=start/);
});

test("voice clips share Song placement controls and empty legacy lanes stay removable",()=>{
 const ui=read("songUI.js"),css=read("style.css");
 assert.match(ui,/enableVocalDrag\(block,clip\)/);
 assert.match(ui,/block\.setPointerCapture\(pointerId\)/);
 assert.match(ui,/clip\.startStep=next/);
 assert.match(ui,/event\.shiftKey\?1:4/);
 assert.match(ui,/\$\("song-beat-start-field"\)\.hidden=false/);
 assert.match(ui,/removeSongClip\(getSong\(\),item\.clip\.id\)/);
 assert.match(ui,/removeEmptyVocalTrack\(song,track\.id\)/);
 assert.match(css,/\.song-vocal-clip\s*\{[^}]*touch-action:none/s);
});

test("selecting a Song vocal reuses the Beat workspace with sample effect dials",()=>{
 const studio=read("studio.js"),ui=read("songUI.js"),html=read("index.html");
 const editor=read("vocalEditor.js"),model=read("songModel.js"),native=read("src/hosts/native/sample-plan.js");
 for(const id of ["vocal-editor","song-vocal-step","voice-track"])
  assert.ok(html.includes('id="'+id+'"'),"Missing shared vocal editor control "+id);
 assert.match(studio,/renderVocalWorkspace\(\)/);
 assert.match(studio,/songUI\?\.getSelectedVocal\(\)/);
 assert.match(ui,/onSelectionChange/);
 assert.match(model,/trimVocalClip/);
 assert.match(editor,/renderAudioToneControls/);
 assert.match(editor,/renderAudioMovementControls/);
 assert.match(editor,/renderAudioArticulationControls/);
 assert.match(editor,/illustrateSoundPanel/);
 assert.match(studio,/onApply:\(clipId,changes\)=>/);
 assert.match(editor,/sample & articulation/);
 assert.match(editor,/pitch & movement/);
 assert.match(editor,/tone · filter & distortion/);
 assert.match(editor,/trim to sound/);
 assert.match(native,/vocalEffects\(clip\)/);
 assert.match(read("style.css"),/main\.editing-vocal > \.work\{display:none\}/);
});

test("attached freeform lanes retain parent ownership and offer direct Song-time note editing",()=>{
 const songUI=read("songUI.js"),freeform=read("freeformUI.js"),css=read("freeform.css"),html=read("index.html");
 assert.match(songUI,/freeformUI\.renderAttached\(track,width\)/);
 assert.match(songUI,/unpackBeatClip\(getSong\(\),clip\.id\)/);
 assert.match(songUI,/song-unpack-action/);
 assert.match(songUI,/song-freeform-row/);
 assert.match(freeform,/ensureFreeform\(chosen\)/);
 assert.match(freeform,/addFreeformNote\(/);
 assert.match(freeform,/moveFreeformPassage\(/);
 assert.match(freeform,/addFreeformChunkPlacement\(/);
 assert.match(css,/\.song-freeform-label/);
 assert.match(css,/main\.editing-freeform/);
 assert.match(html,/href="\.\/freeform\.css"/);
});

test("freeform selections create independent reusable Beats without auto-placing Clips",()=>{
 const model=read("freeformModel.js"),ui=read("freeformUI.js"),
  songUI=read("songUI.js"),studio=read("studio.js");
 assert.match(model,/export function createBeatFromFreeformSelection/);
 assert.match(ui,/createBeatFromFreeformSelection\(song,current\.id/);
 assert.match(ui,/made=addBeat\(song,beat\)/);
 assert.match(ui,/onBeatCreated\(made\)/);
 assert.match(songUI,/onSelectBeat\(created\.id\)/);
 assert.match(studio,/onFreeformBeatCreated/);
 assert.doesNotMatch(ui,/addBeatClip\(/);
});

test("freeform Beat selection highlights the Song lane at absolute Song time",()=>{
 const ui=read("freeformUI.js"),css=read("freeform.css");
 assert.match(ui,/function paintSelectionRange\(\)/);
 assert.match(ui,/selectionStartStep\/BAR_STEPS\*SONG_BAR_PIXELS/);
 assert.match(ui,/selectionLengthSteps\/BAR_STEPS\*SONG_BAR_PIXELS/);
 assert.match(css,/\.song-freeform-selected-range/);
});

test("freeform sound follows the Song scrubber while Beat navigation stays independent",()=>{
 const ui=read("freeformUI.js"),model=read("freeformModel.js"),
  songUI=read("songUI.js"),css=read("freeform.css");
 assert.match(model,/export function soundingFreeformPitches/);
 assert.match(ui,/soundingFreeformPitches\(layer\(\),inst\?\.id,playStep\)/);
 assert.match(ui,/seekSongStep\(target\)/);
 assert.match(ui,/seekToStep\(step\)/);
 assert.match(ui,/playStep>=viewStep\(\)\+VIEW_BARS\*BAR_STEPS/);
 assert.match(songUI,/freeformUI\.seekToStep\(seekStep\)/);
 assert.match(css,/\.freeform-key\.sounding/);
});

test("freeform Sound editor reuses canonical controls instead of duplicating effects definitions",()=>{
 const ui=read("freeformUI.js"),shared=read("freeformSoundUI.js"),
  inspector=read("soundInspector.js"),css=read("freeform.css");
 assert.match(ui,/installFreeformSoundUI/);
 assert.match(ui,/soundUI\.render\(inspector\)/);
 assert.match(ui,/syncEditorInspector\(editor,/);
 assert.match(shared,/renderSoundInspectorCore\(\{/);
 assert.match(inspector,/renderPatchEditor\(modulesRoot/);
 assert.match(inspector,/renderSamplerEditor\(modulesRoot/);
 assert.match(inspector,/createSignalDisplay\(scopeRoot/);
 assert.match(shared,/assignSoundEdit\(sound\.patch,path,value\)/);
 assert.match(shared,/auditionSoundInspector\(\{/);
 assert.match(shared,/play:audition/);
 assert.match(inspector,/nextRackPreview\(previewPositions/);
 assert.match(shared,/makeSampleAsset\(/);
 assert.match(shared,/referencedSampleIds\(layer\.instruments\)/);
 assert.doesNotMatch(shared,/freeform-sound-summary|freeform-sound-details/);
 assert.doesNotMatch(shared,/new AudioContext\(/);
});

test("freeform note-to-Chunk conversion retains source-phase cutoff movement alongside its shared editor",()=>{
 const source=read("freeformUI.js");
 assert.match(source,/const basic=structuredClone\(note\)/);
 assert.match(source,/delete basic\.passageId/);
 assert.match(source,/cutoff over time · source phase/);
 assert.match(source,/illustrateSoundPanel\(visualDetails,"automation"/);
 assert.doesNotMatch(source,/delete basic\.automation/);
});

test("attached freeform Rack offers Sound-row reordering through Song undo",()=>{
 const editor=read("freeformSoundUI.js"),entities=read("entityActions.js");
 assert.match(editor,/moveRackSoundRow\(inst,sound\.id,-1\)/);
 assert.match(editor,/moveRackSoundRow\(inst,sound\.id,1\)/);
 assert.match(editor,/get\("move-sound-up"\)\.disabled=index<=0/);
 assert.match(editor,/get\("move-sound-down"\)\.disabled=index>=ctx\.inst\.sounds\.length-1/);
 assert.match(entities,/export function moveRackSoundRow/);
 assert.match(editor,/mutateSelected\(\(\{inst,sound\}\)=>/);
});


test("Beat and Song-time freeform share canonical Instrument cards",()=>{
 const beat=read("studio.js"),freeform=read("freeformUI.js"),
  card=read("editorInstrumentCard.js");
 assert.match(beat,/createInstrumentCard\(inst,\{/);
 assert.match(freeform,/createInstrumentCard\(resolveFreeformInstrument\(song,option\),\{/);
 assert.match(card,/card\.setAttribute\("aria-pressed",String\(selected\)\)/);
 assert.match(card,/instrument\.sounds\.length\+" sounds"/);
 assert.doesNotMatch(freeform,/const picker=el\("select"\)/);
 assert.match(beat,/createInstrumentActionMenu\(\{label:"Actions for "/);
 assert.match(freeform,/activeEntry\?\.append\(createInstrumentActionMenu\(\{/);
 assert.match(card,/export function createInstrumentActionMenu/);
 assert.match(card,/menu\.open=false/);
 assert.match(card,/button\.disabled=!!action\.disabled/);
 assert.doesNotMatch(freeform,/const menu=el\("details","freeform-instrument-menu"\)/);
});
test("Instrument action menu preserves Beat-linked ownership and explicit empty-track actions",()=>{
 const freeform=read("freeformUI.js"),shared=read("editorInstrumentCard.js");
 assert.match(freeform,/if\(!linked\)\{/);
 for(const cls of ["freeform-instrument-rename","freeform-instrument-copy",
  "freeform-instrument-up","freeform-instrument-down","freeform-instrument-remove"])
  assert.ok(freeform.includes(cls),"Missing action "+cls);
 assert.match(shared,/action\.className\|\|""/);
 assert.match(shared,/menu\.className=/);
 assert.match(freeform,/danger:true/);
});

test("freeform and Beat edit the same note expression surface without an inset scroll trap",()=>{
 const beat=read("studio.js"),freeform=read("freeformUI.js"),
  styles=read("freeform.css"),shared=read("expressionUI.js");
 assert.match(beat,/renderNoteExpression\(/);
 assert.match(freeform,/renderNoteExpression\(expression,note,/);
 assert.match(freeform,/note\.duration\*60\/\(getSong\(\)\?\.bpm\?\?120\)\/4/);
 assert.match(freeform,/bend=>changeNote\(note\.id,\{bend\}\)/);
 assert.match(freeform,/velocity=>changeNote\(note\.id,\{velocity\}\)/);
 assert.match(freeform,/renderNoteFields\(effects,selected\)/);
 assert.match(freeform,/keysToggle\.hidden=inst\.layout==="rack"/);
 assert.match(freeform,/qwertyToggle\.hidden=inst\.layout==="rack"/);
 assert.match(shared,/onLevelChange\?\.\(noteLevel\)/);
 assert.match(styles,/\.freeform-note-details\{/);
 assert.doesNotMatch(styles,/max-height:160px;overflow-y:auto/);
});
