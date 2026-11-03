import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("factory audio remains in a stable cache while the offline editor shell is revisioned",()=>{
 const sw=read("phone/sw.js"),build=read("scripts/prepare-pages.mjs");
 assert.ok(sw.includes('const CACHE="pre-midi-phone-"+VERSION;'));
 assert.match(sw,/const FACTORY_CACHE="pre-midi-factory-audio-v1";/);
 assert.match(sw,/name\.startsWith\("pre-midi-phone-"\)/);
 assert.match(sw,/caches\.open\(factorySet\.has\(lookup\)\?FACTORY_CACHE:CACHE\)/);
 assert.match(sw,/caches\.open\(FACTORY_CACHE\),total=factoryUrls\.length/);
 assert.ok(!build.includes('"samples",...modules]'),
  "No bulk audio download during initial service worker install.");
 assert.match(build,/__FACTORY_SAMPLES__/);
});
