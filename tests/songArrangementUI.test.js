import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url),read=p=>readFileSync(new URL(p,root),"utf8");

test("the Song timeline is a separate layer before the unchanged Beat editor",()=>{
 const html=read("index.html"),css=read("style.css");
 for(const id of ["song-expand","song-panel","song-title","song-scroll","song-tracks",
  "song-add-beat","song-import-beat","song-add-track","song-clip-start",
  "song-clip-length","song-clip-remove","song-import-file","song-collapse"]){
  assert.ok(html.includes('id="'+id+'"'),"Missing Song control "+id);
 }
 assert.ok(html.indexOf('id="song-panel"')<html.indexOf('class="beat-header"'));
 assert.ok(html.indexOf('class="beat-header"')<html.indexOf('class="work"'));
 assert.match(css,/\.song-beat-clip/);
 assert.match(css,/\.song-clip-grip/);
 assert.match(css,/\.song-track-label/);
});
test("Song Clip manipulation is live and keyboard accessible",()=>{
 const ui=read("songUI.js"),studio=read("studio.js");
 assert.match(ui,/setPointerCapture/);
 assert.match(ui,/ArrowUp/);
 assert.match(ui,/ArrowLeft/);
 assert.match(ui,/lengthSteps/);
 assert.match(ui,/startStep/);
 assert.match(studio,/selectBeat/);
 assert.match(studio,/addSongBeat/);
 assert.match(studio,/modifySong/);
 assert.match(studio,/currentDocument\(\)/);
 assert.match(studio,/parseDocument\(raw\)/);
});
test("native Song events feed the shared playback and WAV paths",()=>{
 const audio=read("audio.js");
 assert.match(audio,/eventsAtSongStep\(current,step\)/);
 assert.match(audio,/eventsAtSongStep\(song,step\)/);
 assert.match(audio,/event\.beat\|\|current/);
 assert.match(audio,/wavSong\(beat\)/);
});
test("Song edits and Beat edits are covered by one undo history",()=>{
 const studio=read("studio.js");
 assert.match(studio,/snapshot\(currentDocument\(\)\)/);
 assert.match(studio,/restoreDocument\(history\.pop\(\)\)/);
 assert.match(studio,/restoreDocument\(future\.pop\(\)\)/);
});
