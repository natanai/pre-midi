import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,posix} from "node:path";
import {pathToFileURL} from "node:url";
import {SAMPLE_ASSETS} from "../samples.js";
import {versionPage,runtimeModules,preparePages} from "../scripts/prepare-pages.mjs";
test("the deployed page versions every transitive module and its stylesheet together",async()=>{
 const root=new URL("../",import.meta.url),files=await runtimeModules(root);
 const html=versionPage(readFileSync(new URL("index.html",root),"utf8"),files,"abcd1234abcd1234");
 const map=JSON.parse(html.match(/id="premidi-modules">(.*?)<\/script>/)[1]).imports;
 assert.match(html,/src="\.\/studio\.js\?build=abcd1234abcd"/);
 assert.match(html,/href="\.\/style\.css\?build=abcd1234abcd"/);
 assert.ok(html.indexOf('type="importmap"')<html.indexOf('type="module"'));
 for(const file of files){
  assert.equal(map["./"+file],"./"+file+"?build=abcd1234abcd");
  const source=readFileSync(new URL(file,root),"utf8");
  for(const [,path] of source.matchAll(/(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+\.js)["']/g))
   assert.ok(map["./"+posix.normalize(posix.join(posix.dirname(file),path))],"Unversioned dependency: "+file+" → "+path);
 }
 assert.equal(versionPage(html,files,"abcd1234abcd1234"),html);
});

test("studio favicon uses pre-programmed artwork and is referenced by the page",()=>{
 const root=new URL("../",import.meta.url);
 const html=readFileSync(new URL("index.html",root),"utf8");
 const favicon=readFileSync(new URL("favicon.svg",root),"utf8");
 assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg">/);
 assert.match(favicon,/<rect width="512" height="512" fill="#000"\/>/);
 assert.match(favicon,/<rect x="156" y="156" width="200" height="200" fill="none" stroke="#fff" stroke-width="6"\/>/);
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
  for(const [,dep] of source.matchAll(/(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+\.js)["']/g))
   assert.ok(modules.includes(posix.normalize(posix.join(posix.dirname(file),dep))),"Missing runtime dependency: "+file+" -> "+dep);
 }
});
test("deployment stages runtime files instead of the repository checkout",()=>{
 const root=new URL("../",import.meta.url);
 const workflow=readFileSync(new URL(".github/workflows/pages.yml",root),"utf8");
 assert.ok(workflow.includes("path: ./dist"));
 assert.ok(!workflow.includes("path: .\n"));
 const build=readFileSync(new URL("scripts/prepare-pages.mjs",root),"utf8");
 assert.ok(build.includes("THIRD_PARTY_NOTICES.md"));
 assert.ok(build.includes('"favicon.svg"'));
 assert.ok(build.includes("SAMPLE_ASSETS"));
 assert.ok(build.includes("await rm(output,"));
});

test("Pages stages nested DSP modules and both stylesheets without development files",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"premidi-build-")),root=pathToFileURL(dir+"/");
 try{
  await mkdir(new URL("src/dsp/",root),{recursive:true});
  await mkdir(new URL("samples/",root));
  const files={"studio.js":'import {value} from "./src/dsp/value.js";',
   "src/dsp/value.js":'export const value=1;',"style.css":"body{}","studioAlignment.css":".row{}",
   "phone/index.html":'<head><link rel="stylesheet" href="./phone.css"></head>',"phone/phone.css":"body{}",
   "THIRD_PARTY_NOTICES.md":"notices","favicon.svg":'<svg xmlns="http://www.w3.org/2000/svg"></svg>',"index.html":'<head></head><script type="module" src="./studio.js"></script>'};
  for(const [file,content] of Object.entries(files))await writeFile(new URL(file,root),content);
  for(const asset of SAMPLE_ASSETS)await writeFile(new URL("samples/"+asset.id+(asset.mime==="audio/ogg"?".ogg":".wav"),root),"fixture");
  await preparePages(root,"abcdef123456");
  assert.equal(await readFile(new URL("dist/src/dsp/value.js",root),"utf8"),files["src/dsp/value.js"]);
  assert.equal(await readFile(new URL("dist/studioAlignment.css",root),"utf8"),files["studioAlignment.css"]);
  assert.equal(await readFile(new URL("dist/favicon.svg",root),"utf8"),files["favicon.svg"]);
  assert.equal(await readFile(new URL("dist/phone/phone.css",root),"utf8"),files["phone/phone.css"]);
  assert.match(await readFile(new URL("dist/phone/index.html",root),"utf8"),/phone.css\?build=abcdef123456/);
  const html=await readFile(new URL("dist/index.html",root),"utf8");
  assert.ok(html.includes('./src/dsp/value.js?build=abcdef123456'));
  await writeFile(new URL("src/dsp/value.js",root),'import "../../../outside.js";');
  await assert.rejects(runtimeModules(root),/Unsafe module dependency/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
