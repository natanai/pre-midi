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
 assert.match(html, /Chunk <select/);
 assert.match(html, /New notes <select/);
 assert.doesNotMatch(html, /<h2>Tracks<\/h2>|Pattern|Arrangement/);
});
test("note end grip, pointer resizing, and live scheduler are connected", () => {
 const css=readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 assert.match(css,/\.note\.end::after/);
 assert.match(studio,/setPointerCapture/);
 assert.match(studio,/resizeNote\(chunk/);
 assert.match(studio,/play\(\(\) => score/);
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
 for(const id of ["chunk","chunk-name","add-chunk","duplicate-chunk","delete-chunk","length"]) {
  assert.ok(notes.includes('id="'+id+'"'),"Missing note control "+id);
 }
 assert.match(css,/\.notes-toolbar\s*\{[^}]*flex-wrap:wrap/);
 assert.match(html,/class="sound-control-group sound-identity-controls"/);
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
