// Reproducibly stage verified CC0 samples in GitHub Pages artifact.
// The repository stores provenance/IDs; the published site stores the bytes.
// Portable music bundles contain selected audio as separate assets, not embedded JSON.
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
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchSample(asset){
 const url=rawUrl(asset);
 for(let attempt=0;attempt<5;attempt++){
  let response;
  try{response=await fetch(url);}
  catch(error){
   if(attempt===4)throw Error("Cannot fetch CC0 "+asset.id+": "+error.message);
   await pause(500*2**attempt);
   continue;
  }
  if(response.ok)return Buffer.from(await response.arrayBuffer());
  if(attempt===4||![408,429,500,502,503,504].includes(response.status))
   throw Error("Cannot fetch CC0 "+asset.id+": HTTP "+response.status);
  await pause(500*2**attempt);
 }
 throw Error("Cannot fetch CC0 "+asset.id);
}
await Promise.all(Array.from({length:4},async()=>{
 while(remaining.length){
 const asset=remaining.shift();
 const ext=asset.mime==="audio/ogg"?"ogg":"wav";
 const filename=resolve(dest,asset.id+"."+ext);
 let bytes;
 try {bytes=await readFile(filename);}catch{}
 if(!bytes||shaOf(bytes)!==asset.sha){
  bytes=await fetchSample(asset);
  if(shaOf(bytes)!==asset.sha)throw Error("Upstream sample checksum mismatch: "+asset.id);
  await writeFile(filename,bytes);
 }
 console.log(asset.id,bytes.length,asset.license);
 }
}));
