// Prototype default: syntax-check edited JavaScript, not every historical suite.
import {execFileSync,spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).split("\n").filter(Boolean);
const args=process.argv.slice(2),all=args.includes("--all");
let files=args.filter(arg=>arg!=="--all");
if(!files.length){
 if(all)files=git(["ls-files"]);
 else{
  files=[...git(["diff","--name-only","--diff-filter=ACMR","HEAD"]),
   ...git(["ls-files","--others","--exclude-standard"])];
  if(!files.length){
   try{files=git(["diff","--name-only","--diff-filter=ACMR","HEAD^","HEAD"]);}
   catch{files=git(["ls-files"]);}
  }
 }
}
files=[...new Set(files)].filter(file=>/\.(?:m?js)$/.test(file)&&existsSync(resolve(root,file)));
for(const file of files){
 const result=spawnSync(process.execPath,["--check",file],{cwd:root,stdio:"inherit"});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
console.log("Syntax checked "+files.length+" "+(all?"tracked":"edited")+" JavaScript files");
