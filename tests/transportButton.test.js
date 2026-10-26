import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("there is only one play/stop transport control",()=>{
 const html=read("index.html");
 const studio=read("studio.js");
 assert.match(html,/<button id="play"[^>]*>▶ play<\/button>/);
 assert.doesNotMatch(html,/<button id="stop"\b/);
 assert.doesNotMatch(studio,/\$\("stop"\)\.addEventListener/);
});

test("stop is a square icon, not a roman numeral that lowercases to ii",()=>{
 const studio=read("studio.js");
 assert.match(studio,/control\.textContent=isPlaying\?"■ stop":"▶ play"/);
 assert.doesNotMatch(studio,/Ⅱ|ⅱ/);
 assert.match(studio,/setPlaybackButton\(true,playingSong\)/);
 assert.match(studio,/setPlaybackButton\(false\)/);
 assert.match(studio,/if \(playback\) \{ stop\(\); return; \}/);
});
