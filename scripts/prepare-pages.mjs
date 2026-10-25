// Version the complete module graph, not just its entry point. A fresh HTML
// page must never combine newly deployed code with cached earlier modules.
import {readdir,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
export function versionPage(html,files,revision){
 if(!/^[a-f0-9]{8,64}$/i.test(revision))throw Error("Invalid build revision.");
 const token=revision.slice(0,12),imports={};
 for(const file of files){
  if(!/^[a-zA-Z0-9_-]+\.js$/.test(file))throw Error("Invalid module filename.");
  imports["./"+file]="./"+file+"?build="+token;
 }
 if(!imports["./studio.js"])throw Error("Studio entry point missing.");
 const map='<script type="importmap" id="premidi-modules">'+JSON.stringify({imports})+'</script>';
 return html.replace(/<script type="importmap" id="premidi-modules">[\s\S]*?<\/script>\n?/g,"")
  .replace("</head>",map+"\n</head>")
  .replace(/href="\.\/style\.css(?:\?build=[a-f0-9]+)?"/i,'href="./style.css?build='+token+'"')
  .replace(/src="\.\/studio\.js(?:\?build=[a-f0-9]+)?"/i,'src="./studio.js?build='+token+'"');
}
export async function preparePages(root,revision=process.env.GITHUB_SHA){
 const files=(await readdir(root)).filter(file=>file.endsWith(".js")).sort();
 if(!revision){
  const hash=createHash("sha256");
  for(const file of [...files,"style.css"])hash.update(await readFile(new URL(file,root)));
  revision=hash.digest("hex");
 }
 const path=new URL("index.html",root),html=await readFile(path,"utf8");
 await writeFile(path,versionPage(html,files,revision));
 console.log("Versioned",files.length,"modules and stylesheet for",revision.slice(0,12));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)
 await preparePages(new URL("../",import.meta.url));
