import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("dedicated phone entry starts before desktop styles",()=>{
 const desktop=file("index.html"),phone=file("phone/index.html");
 assert.ok(desktop.indexOf('location.replace(new URL("./phone/", location.href))')>0);
 assert.ok(desktop.indexOf('location.replace(new URL("./phone/", location.href))')<desktop.indexOf('href="./style.css"'));
 assert.match(phone,/href="\.\/phone.css"/);
 assert.doesNotMatch(phone,/studio\.js|style\.css|studioAlignment\.css|id="piano"/);
 assert.match(phone,/src="\.\/main\.js"/);
 assert.match(phone,/id="piano-grid"/);
 assert.match(phone,/id="instrument-picker"/);
 assert.match(phone,/data-workspace="notes"/);
 assert.match(file("phone/main.js"),/createStudioSession\(/);
 assert.doesNotMatch(file("phone/main.js"),/from ["\x27]\.\.\/studio\.js/);
});
test("phone CSS overrides are absent from desktop sheets",()=>{
 for(const p of ["style.css","studioAlignment.css"])
  assert.doesNotMatch(file(p),/@media\s*\(\s*max-width:\s*(?:340|520|570|640|650)px\s*\)/);
 assert.match(file("style.css"),/@media \(min-width:601px\) and \(max-width:1099px\)/);
});
