import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
const terminology=JSON.parse(read("docs/terminology.json"));

test("canonical names and ownership relationships are unambiguous",()=>{
 const ids=terminology.entities.map(entity=>entity.id);
 assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(ids.slice().sort(),["asset","beat","chunk","clip","instrument","rack","recording","song","sound","track"].sort());
 for(const entity of terminology.entities){
  assert.equal(entity.code,entity.id);
  assert.ok(entity.definition.length>20);
  for(const parent of entity.parents)assert.ok(ids.includes(parent),entity.id+" has unknown parent "+parent);
 }
 assert.deepEqual(terminology.entities.find(x=>x.id==="clip").variants,["beat","vocal"]);
});
test("Beat maker public labels do not call Beats compositions",()=>{
 const html=read("index.html"),schema=read("schema.js");
 assert.match(html,/BEAT <input id="title"/);
 assert.match(html,/aria-label="Beat title"/);
 assert.doesNotMatch(html,/COMPOSITION|Composition title|Composition timeline|Example compositions/);
 assert.match(schema,/Untitled beat/);
 assert.doesNotMatch(schema,/Untitled composition|Composition needs|Composition exceeds/);
});
test("Beat-local timeline names never masquerade as Song timing",()=>{
 const arrangement=read("arrangement.js");
 assert.doesNotMatch(arrangement,/\bscore\b|songStep|shared song/);
 assert.match(arrangement,/beatStep/);
});
