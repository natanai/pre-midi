import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {versionPage,runtimeModules} from "../scripts/prepare-pages.mjs";
test("the deployed page versions every transitive module and its stylesheet together",()=>{
 const root=new URL("../",import.meta.url),files=readdirSync(root).filter(file=>file.endsWith(".js"));
 const html=versionPage(readFileSync(new URL("index.html",root),"utf8"),files,"abcd1234abcd1234");
 const map=JSON.parse(html.match(/id="premidi-modules">(.*?)<\/script>/)[1]).imports;
 assert.match(html,/src="\.\/studio\.js\?build=abcd1234abcd"/);
 assert.match(html,/href="\.\/style\.css\?build=abcd1234abcd"/);
 assert.ok(html.indexOf('type="importmap"')<html.indexOf('type="module"'));
 for(const file of files){
  assert.equal(map["./"+file],"./"+file+"?build=abcd1234abcd");
  const source=readFileSync(new URL(file,root),"utf8");
  for(const [,path] of source.matchAll(/(?:from\s*|import\s*)["'](\.\/[^"']+\.js)["']/g))
   assert.ok(map[path],"Unversioned dependency: "+file+" → "+path);
 }
 assert.equal(versionPage(html,files,"abcd1234abcd1234"),html);
});

test("minimal website build includes the entire runtime import graph",async()=>{
 const root=new URL("../",import.meta.url);
 const modules=await runtimeModules(root);
 assert.ok(modules.includes("studio.js"));
 assert.ok(modules.includes("songModel.js"));
 assert.ok(modules.includes("songRecorder.js"));
 assert.ok(modules.includes("synthMatch.js"));
 assert.equal(modules.length,new Set(modules).size);
 for(const file of modules){
  const source=readFileSync(new URL(file,root),"utf8");
  for(const [,dep] of source.matchAll(/(?:from\s*|import\s*)["'](\.\/[^"']+\.js)["']/g))
   assert.ok(modules.includes(dep.slice(2)),"Missing runtime dependency: "+file+" -> "+dep);
 }
});
test("deployment stages runtime files instead of the repository checkout",()=>{
 const root=new URL("../",import.meta.url);
 const workflow=readFileSync(new URL(".github/workflows/pages.yml",root),"utf8");
 assert.ok(workflow.includes("path: ./dist"));
 assert.ok(!workflow.includes("path: .\n"));
 const build=readFileSync(new URL("scripts/prepare-pages.mjs",root),"utf8");
 assert.ok(build.includes("THIRD_PARTY_NOTICES.md"));
 assert.ok(build.includes("SAMPLE_ASSETS"));
 assert.ok(build.includes("await rm(output,"));
});
