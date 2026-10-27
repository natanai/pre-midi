// Publish only the studio's dependency closure, verified samples, and notices.
// Tests, development scripts, source documentation, and working plans stay in Git,
// never in the GitHub Pages artifact.
import {readdir,readFile,writeFile,copyFile,mkdir,rm} from "node:fs/promises";
import {createHash} from "node:crypto";
import {posix} from "node:path";
import {pathToFileURL} from "node:url";
import {SAMPLE_ASSETS} from "../samples.js";

const entry="studio.js";
const dependencyPattern=/(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+\.js)["']/g;
const safeModule=file=>/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.js$/.test(file);
export async function runtimeModules(root){
 const found=new Set(),pending=[entry];
 while(pending.length){
  const file=pending.pop();
  if(found.has(file))continue;
  if(!safeModule(file))
   throw Error("Unsafe runtime module: "+file);
  const source=await readFile(new URL(file,root),"utf8");
  found.add(file);
  for(const [,relative] of source.matchAll(dependencyPattern)){
   const dependency=posix.normalize(posix.join(posix.dirname(file),relative));
   if(!safeModule(dependency))
    throw Error("Unsafe module dependency: "+relative);
   if(!found.has(dependency))pending.push(dependency);
  }
 }
 return [...found].sort();
}
export function versionPage(html,files,revision){
 if(!/^[a-f0-9]{8,64}$/i.test(revision))throw Error("Invalid build revision.");
 const token=revision.slice(0,12),imports={};
 for(const file of files){
  if(!safeModule(file))throw Error("Invalid module filename.");
  imports["./"+file]="./"+file+"?build="+token;
 }
 if(!imports["./studio.js"])throw Error("Studio entry point missing.");
 const map='<script type="importmap" id="premidi-modules">'+JSON.stringify({imports})+'</script>';
 return html.replace(/<script type="importmap" id="premidi-modules">[\s\S]*?<\/script>\n?/g,"")
  .replace("</head>",map+"\n</head>")
  .replace(/href="\.\/style\.css(?:\?build=[a-f0-9]+)?"/i,'href="./style.css?build='+token+'"')
  .replace(/href="\.\/studioAlignment\.css(?:\?build=[a-f0-9]+)?"/i,'href="./studioAlignment.css?build='+token+'"')
  .replace(/src="\.\/studio\.js(?:\?build=[a-f0-9]+)?"/i,'src="./studio.js?build='+token+'"');
}
export async function preparePages(root,revision=process.env.GITHUB_SHA,output=new URL("dist/",root)){
 const modules=await runtimeModules(root);
 if(!revision){
  const hash=createHash("sha256");
  for(const file of [...modules,"style.css","studioAlignment.css"])hash.update(await readFile(new URL(file,root)));
  revision=hash.digest("hex");
 }
 const html=versionPage(await readFile(new URL("index.html",root),"utf8"),modules,revision);
 await rm(output,{recursive:true,force:true});
 await mkdir(output,{recursive:true});
 await writeFile(new URL("index.html",output),html);
 for(const file of [...modules,"style.css","studioAlignment.css","THIRD_PARTY_NOTICES.md"]){
  await mkdir(new URL("./",new URL(file,output)),{recursive:true});
  await copyFile(new URL(file,root),new URL(file,output));
 }
 const samples=new URL("samples/",output);
 await mkdir(samples,{recursive:true});
 const required=new Set(SAMPLE_ASSETS.map(asset=>asset.id+"."+(asset.mime==="audio/ogg"?"ogg":"wav")));
 for(const filename of required)
  await copyFile(new URL("samples/"+filename,root),new URL(filename,samples));
 const listed=await readdir(output);
 const allowed=new Set([...modules.map(file=>file.split("/")[0]),"index.html","style.css","studioAlignment.css","THIRD_PARTY_NOTICES.md","samples"]);
 if(listed.some(name=>!allowed.has(name)))
  throw Error("Unexpected files in published artifact.");
 console.log("Staged",modules.length,"runtime modules and",required.size,"verified samples; no tests or development files.");
 return {modules,samples:required.size,output};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)
 await preparePages(new URL("../",import.meta.url));
