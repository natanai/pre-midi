import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {versionPage} from "../scripts/prepare-pages.mjs";
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
