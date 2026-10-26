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
 assert.match(studio,/\(isPlaying\?"stop ":"play "\)\+\(playingSong\?"song":"beat"\)/);
});
