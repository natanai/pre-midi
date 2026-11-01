import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("all studio controls exist in the real HTML page", () => {
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const ids=[...studio.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]);
 for(const id of new Set(ids))assert.ok(html.includes('id="'+id+'"'),"Missing control #"+id);
});
test("the UI uses instruments, timeline and chunks without deprecated wording", () => {
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(html, /<h2>Instruments<\/h2>/);
 assert.match(html, /<h2>Timeline<\/h2>/);
 assert.match(html, /class="chunk-name-field">chunk <input id="chunk-name"/);
 assert.match(html, /<button id="chunk" type="button" aria-label="choose chunk"/);
 assert.match(html, /id="chunk-menu"/);
 assert.doesNotMatch(html, /id="velocity"|id="length"/);
 assert.doesNotMatch(html, /<h2>Tracks<\/h2>|Pattern|Arrangement/);
});
test("note end grip, pointer resizing, and live scheduler are connected", () => {
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 assert.match(css,/\.note\.end::after/);
 assert.match(studio,/setPointerCapture/);
 assert.match(studio,/resizeNote\(chunk/);
 assert.match(studio,/play\(\(\) => playingSong\?song:beat/);
 const editRoutine = studio.slice(studio.indexOf("function modify("),studio.indexOf("function resetTo("));
 assert.doesNotMatch(editRoutine,/stop\(\)/);
});

test("instrument creation is a full-width action, not a cramped header control", () => {
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const sidebar=html.slice(html.indexOf('<aside class="instrument-pane"'),html.indexOf("</aside>"));
 assert.match(sidebar,/class="heading"><h2>Instruments<\/h2><\/div>/);
 assert.match(sidebar,/<button id="add-instrument" class="add-instrument-action"/);
 assert.ok(sidebar.indexOf('id="add-instrument"')>sidebar.indexOf('</div>'),"The Add Instrument action must follow the heading");
 assert.match(css,/\.work\s*\{[^}]*grid-template-columns:clamp\(248px,20vw,280px\)/);
 assert.match(css,/\.add-instrument-action\s*\{[^}]*width:calc\(100% - 28px\)/);
 assert.match(css,/\.add-instrument-action\s*\{[^}]*white-space:normal/);
});
test("note and sound controls have distinct, wrapping groups", () => {
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const notes=html.slice(html.indexOf('<section class="notes-section"'),html.indexOf('</section>',html.indexOf('<section class="notes-section"')));
 assert.ok(notes.indexOf('class="notes-toolbar"')>notes.indexOf('class="notes-heading"'));
 for(const id of ["chunk","chunk-menu","chunk-name","delete-chunk"]) {
  assert.ok(notes.includes('id="'+id+'"'),"Missing note control "+id);
 }
 assert.match(css,/\.notes-toolbar\s*\{[^}]*flex-wrap:wrap/);
 assert.match(html,/class="sound-primary-controls"/);
 assert.match(html,/id="synth-editor"/);
 assert.match(html,/id="instrument-dialog"/);
 assert.match(html,/id="change-sound"/);
 assert.match(html,/id="save-sound"/);
 assert.match(css,/@media \(max-width:860px\)/);
 assert.match(css,/@media \(max-width:570px\)/);
});

test("instrument presets have one owner and the full synth editor is reachable",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const editor=readFileSync(new URL("../instrumentUI.js",import.meta.url),"utf8");
 assert.match(html,/id="add-instrument"/);
 assert.match(studio,/openLibrary\("add"\)/);
 assert.match(studio,/openLibrary\("replace"\)/);
 assert.match(studio,/renderPatchEditor\(/);
 assert.match(editor,/Oscillator 1/);
 assert.match(editor,/Envelope/);
 assert.match(editor,/Filter & noise/);
 assert.match(editor,/Movement/);
 assert.match(editor,/Effects/);
 assert.doesNotMatch(html,/id="waveform"/);
});

test("guitar dynamics and reachable low-string notes are exposed in the original editor",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 assert.doesNotMatch(html,/id="velocity"|id="length"/);
 assert.match(studio,/velocity:DEFAULT_NOTE_LEVEL/);
 assert.match(studio,/duplicateChunk\(chunk.id\)/);
 assert.match(studio,/createChunk\(\)/);
 assert.match(studio,/pitch >= 36/);
});

test("an opened Sound inspector exposes full controls without a compact mode",()=>{
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.doesNotMatch(studio,/inspector-compact|setInspector\("compact"\)/);
 assert.doesNotMatch(css,/inspector-compact/);
 assert.doesNotMatch(html,/id="sound-expand"/);
});

test("chunk menu duplicates exactly the chosen row and has one new-chunk action at its bottom",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 assert.match(html,/id="chunk-menu" class="chunk-menu"/);
 assert.doesNotMatch(html,/id="add-chunk"|id="duplicate-chunk"/);
 assert.match(studio,/duplicateChunk\(chunk.id\)/);
 assert.match(studio,/duplicate\.setAttribute\("aria-label","duplicate "\+chunk.name\)/);
 assert.ok(studio.indexOf('menu.append(row);')<studio.indexOf('menu.append(add);'));
 assert.match(studio,/duplicate\.disabled=inst\.chunks\.length>=32/);
 assert.match(css,/\.chunk-menu-new \{/);
});
test("note level belongs to the selected note effects inspector for piano and racks",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const expression=readFileSync(new URL("../expressionUI.js",import.meta.url),"utf8");
 assert.doesNotMatch(html,/id="velocity"|id="length"|>strength </);
 assert.match(studio,/velocity:DEFAULT_NOTE_LEVEL/g);
 assert.match(expression,/make\("span","note level"\)/);
 assert.match(expression,/levelInput\.addEventListener\("change",\(\)=>onLevelChange\?\./);
 assert.match(studio,/entry\.patch\.bend,level=>\{/);
 assert.match(studio,/sound\(\)\.patch\.bend,level=>\{/);
 assert.match(studio,/velocity:level,bend:target\.bend/);
 assert.match(studio,/velocity:level,bend:note\.bend/);
 assert.match(studio,/duration:1,velocity:DEFAULT_NOTE_LEVEL/);
});

test("compact note and Sound header keeps history accessible and Sound rightmost",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const header=html.slice(html.indexOf('class="heading notes-heading"'),html.indexOf('<div class="notes-toolbar">'));
 const note=header.indexOf('id="note-mode"');
 const undo=header.indexOf('id="undo"');
 const redo=header.indexOf('id="redo"');
 const sound=header.indexOf('id="sound-toggle"');
 assert.ok(note>=0&&note<undo&&undo<redo&&redo<sound,"Sound must be the last control");
 assert.ok(header.includes('<h2>notes</h2><button id="note-mode"'));
 for(const [id,symbol] of [["note-mode","✎"],["undo","↶"],["redo","↷"],["sound-toggle","♫"]]){
  assert.match(header,new RegExp('id="'+id+'"[^>]*>'+symbol+'</button>'));
  assert.match(header,new RegExp('id="'+id+'"[^>]*aria-label="'));
 }
 assert.ok(studio.includes('$("undo").addEventListener("click", undo)'));
 assert.ok(studio.includes('$("redo").addEventListener("click", redo)'));
 assert.ok(studio.includes('$("sound-toggle").textContent="♫"'));
 assert.ok(studio.includes('$("note-mode").textContent="✎"'));
 assert.match(css,/\.history-actions button::before,\.history-actions button::after \{content:none\}/);
});
test("Sound heading does not duplicate its editable instrument name",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const sound=html.slice(html.indexOf('id="sound-section"'),html.indexOf('id="note-effects-section"'));
 assert.ok(sound.includes('<h2>sound</h2>'));
 assert.ok(sound.includes('class="sound-heading"'));
 assert.ok(sound.includes('<input id="instrument-name" maxlength="60" aria-label="Instrument name"'));
 assert.ok(sound.includes('id="sound-name"'));
 assert.ok(!sound.includes('id="edit-instrument-note"'));
 assert.ok(!studio.includes('$("edit-instrument-note")'));
 assert.ok(studio.includes('$("sound-section").setAttribute("aria-label"'));
});

test("primary instrument controls replace redundant lower fields",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const synth=readFileSync(new URL("../instrumentUI.js",import.meta.url),"utf8");
 const sampler=readFileSync(new URL("../samplerUI.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 assert.match(html,/class="sound-primary-controls"/);
 for(const id of ["instrument-volume-dial","primary-brightness-dial","primary-attack-dial","primary-release-dial"])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.indexOf('id="sound-visualizer"')<html.indexOf('id="synth-editor"'));
 assert.match(html,/class="sound-entity-menu"/);
 assert.match(html,/id="remove-instrument"/);
 assert.ok(!html.includes('class="sound-control-group sound-identity-controls"'));
 assert.match(css,/\.visual-sound-panel/);
 assert.match(studio,/PRIMARY_SYNTH_FIELDS/);
 assert.match(studio,/createSignalDisplay\(\$\("sound-visualizer"\),patch,beat,signal\(inst\),inst.volume\*entry.gain,entry.referencePitch,inst.automation\)/);
 assert.ok(!synth.includes('{name:"Sound",open:true'));
 assert.ok(!sampler.includes('["cutoff","Cutoff",50,14000,1,"hz",true]'));
 assert.ok(!sampler.includes('["attack","Attack",0,2,.005,"seconds"]'));
});

test("Notes pencil suppresses generic heading brackets rather than stacking them into the toolbar",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 assert.match(html,/id="note-mode"[^>]*>✎<\/button>/);
 assert.match(css,/\.heading button::before \{content:"\["/);
 assert.match(css,/#note-mode::before,#note-mode::after \{content:none\}/);
});

test("sound layout conversion actions live only in the contextual ellipsis menu",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const menuStart=html.indexOf('id="instrument-actions"');
 const menuEnd=html.indexOf('</details>',menuStart);
 assert.ok(menuStart>=0&&menuEnd>menuStart);
 const menu=html.slice(menuStart,menuEnd);
 assert.match(menu,/<button id="convert-rack" type="button">convert to rack<\/button>/);
 assert.match(menu,/<button id="convert-pitched" type="button" hidden>convert to piano roll<\/button>/);
 assert.match(menu,/id="remove-instrument"/);
 assert.equal((html.match(/id="convert-rack"/g)||[]).length,1);
 assert.equal((html.match(/id="convert-pitched"/g)||[]).length,1);
 assert.doesNotMatch(html,/class="layout-actions"/);
 assert.match(studio,/\$\("convert-rack"\)\.hidden=inst.layout==="rack"/);
 assert.match(studio,/\$\("convert-pitched"\)\.hidden=inst.layout!=="rack"/);
 assert.match(studio,/\$\("convert-rack"\)\.disabled=!!inst.automation\|\|!canConvertToRack\(inst\)/);
 assert.match(studio,/\$\("convert-pitched"\)\.disabled=!canMoveRackSoundToPianoRoll\(/);
 assert.match(studio,/\$\("instrument-actions"\)\.open=false/);
 assert.match(css,/\.sound-entity-menu-content button\.danger \{color:var\(--signal-pink\)\}/);
 assert.match(css,/\.sound-entity-menu-content button\[hidden\] \{display:none\}/);
});
