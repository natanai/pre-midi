import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const active=[
 "studio.js","arrangement.js","audio.js","entityActions.js","examples.js",
 "sampler.js","storage.js","packageIO.js","schema.js","pianoPlayhead.js",
 "instrumentUI.js","zip.js","index.html"
];
test("Beat domain in active source has no legacy composition or score nouns",()=>{
 for(const path of active){
  const content=readFileSync(new URL(path,root),"utf8");
  assert.doesNotMatch(content,/\b(?:score|composition)\b/i,path);
  assert.doesNotMatch(content,/FromScore|songStep|shared song/i,path);
 }
});
test("Beat header is not disguised as a Song section",()=>{
 const html=readFileSync(new URL("index.html",root),"utf8");
 const css=readFileSync(new URL("style.css",root),"utf8");
 assert.match(html,/class="beat-header"/);
 assert.match(css,/\.beat-header/);
 assert.doesNotMatch(html,/class="song"/);
});
