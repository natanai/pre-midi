import {execFileSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

const root=fileURLToPath(new URL("../",import.meta.url));
const working=await mkdtemp(join(tmpdir(),"premidi-page-mailbox-"));
const binary=join(working,"page-mailbox-check"+(process.platform==="win32"?".exe":""));
try{
 const args=["-std=c++17","-O2","-Wall","-Wextra","-Werror","-pedantic",
  join(root,"native/page-mailbox-test.cpp"),"-pthread","-o",binary];
 execFileSync(process.env.CXX||"g++",args,{stdio:"pipe",timeout:90000});
 const output=execFileSync(binary,[],{encoding:"utf8",timeout:90000});
 const report=JSON.parse(output);
 assert.equal(report.qualified,true);
 assert.equal(report.spscPages,400);
 assert.equal(report.allocations,0);
 assert.equal(report.legacyLimitsUnchanged,true);
 console.log("Native page mailbox: "+JSON.stringify(report));
}finally{
 await rm(working,{recursive:true,force:true});
}
