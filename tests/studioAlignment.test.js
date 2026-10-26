import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=source("index.html");
const css=source("studioAlignment.css");
const studio=source("studio.js");

test("transport position is independent from the loop switch",()=>{
 assert.match(html,/href="\.\/studioAlignment\.css"/);
 assert.match(html,/class="transport-playback"/);
 assert.match(html,/class="transport-field transport-loop"/);
 assert.match(html,/class="loop-box"><input id="loop"/);
 assert.match(html,/class="transport-position"/);
 assert.match(html,/bar : beat/);
 assert.match(html,/<output id="position"[^>]*>1:1<\/output>/);
 assert.doesNotMatch(html,/<output id="position"[^>]*>1\.1<\/output>/);
 assert.match(studio,/setAttribute\("aria-label","bar "/);
 assert.match(studio,/setAttribute\("aria-label","bar 1, beat 1"\)/);
});

test("sound actions own a deliberate row with no orphan synth subtitle",()=>{
 const start=html.indexOf('class="heading sound-section-heading"');
 const end=html.indexOf('class="controls"',start);
 assert.ok(start>0&&end>start);
 const sound=html.slice(start,end);
 assert.match(sound,/class="sound-window-actions"/);
 assert.match(sound,/class="sound-actions"/);
 assert.doesNotMatch(sound,/patch-info|patch-label|scope-description/);
 assert.match(css,/\.sound-section > \.sound-actions/);
 assert.match(css,/\.sound-section-heading/);
});

test("notes controls align to one baseline and wrap instead of spreading out",()=>{
 assert.match(css,/\.notes-toolbar \{align-items:flex-end;justify-content:flex-start/);
 assert.match(css,/\.chunk-actions \{align-items:flex-end;align-self:flex-end/);
 assert.match(css,/\.note-length-control \{margin-left:0\}/);
 assert.doesNotMatch(css,/\.chunk-actions \{[^}]*height:34px/);
 assert.match(css,/@media\(max-width:570px\)/);
});
