// Reproducibly stage verified CC0 samples in GitHub Pages artifact.
// The repository stores provenance/IDs; the published site stores the bytes.
// The native game file embeds the selected bytes and needs neither host afterward.
import { SAMPLE_ASSETS,rawUrl } from "../samples.js";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const dest=resolve("samples");
await mkdir(dest,{recursive:true});
function shaOf(bytes){
 return createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
}
// Limit parallel raw.githubusercontent.com requests to avoid API/network throttling.
const remaining=[...SAMPLE_ASSETS];
await Promise.all(Array.from({length:8},async()=>{
 while(remaining.length){
 const asset=remaining.shift();
 const ext=asset.mime==="audio/ogg"?"ogg":"wav";
 const filename=resolve(dest,asset.id+"."+ext);
 let bytes;
 try {bytes=await readFile(filename);}catch{}
 if(!bytes||shaOf(bytes)!==asset.sha){
  const response=await fetch(rawUrl(asset));
  if(!response.ok)throw Error("Cannot fetch CC0 "+asset.id+": HTTP "+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
  if(shaOf(bytes)!==asset.sha)throw Error("Upstream sample checksum mismatch: "+asset.id);
  await writeFile(filename,bytes);
 }
 console.log(asset.id,bytes.length,asset.license);
 }
}));
