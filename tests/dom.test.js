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
 assert.match(html, /CHUNK <select/);
 assert.match(html, /NEW NOTE LENGTH/);
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
