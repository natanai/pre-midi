import {referencedSampleIds} from "./soundModel.js";
// Compact, plain .premidi Beat instructions with separate audio files in one portable ZIP.
import {parse,filename,validate} from "./schema.js";
import {createZip,readZip} from "./zip.js";
import {getAsset,putAsset,MAX_PACKAGE_BYTES} from "./assetRegistry.js";
import {inspectAudioBytes,MAX_SCORE_BYTES} from "./sampler.js";
const text=new TextEncoder();
export function exportProject(score){
 const issues=validate(score);
 if(issues.length)throw Error(issues.join("\n"));
 // Unused recordings must not bloat either the music instructions or ZIP.
 // Preserve every zone on every sampled instrument, including zones an author
 // might use later, but exclude sources orphaned by removed instruments.
 const referenced=referencedSampleIds(score.instruments);
 const manifest={...score,samples:score.samples.filter(asset=>referenced.has(asset.id))};
 const raw=text.encode(JSON.stringify(manifest));
 if(raw.length>MAX_SCORE_BYTES)throw Error("Beat instructions exceed 1 MB.");
 if(!manifest.samples.length)return {
  name:filename(score,".premidi"),blob:new Blob([raw],{type:"application/json"})
 };
 const entries=[{path:filename(score,".premidi"),data:raw}];
 let total=raw.length;
 for(const asset of manifest.samples){
  const bytes=getAsset(asset.id);
  if(!bytes)throw Error("Missing "+asset.path+". Export needs its companion WAV/OGG recording.");
  inspectAudioBytes(bytes,asset.mime);
  total+=bytes.length;
  if(total>MAX_PACKAGE_BYTES)throw Error("Audio assets exceed 64 MB.");
  entries.push({path:asset.path,data:bytes});
 }
 return {name:filename(score,".zip"),blob:createZip(entries)};
}
export async function importProject(file){
 if(!file||file.size>MAX_PACKAGE_BYTES)throw Error("Music package exceeds 64 MB.");
 if(file.name.toLowerCase().endsWith(".zip")){
  const entries=await readZip(file);
  const scores=[...entries].filter(([name])=>name.endsWith(".premidi"));
  if(scores.length!==1)throw Error("Package needs exactly one .premidi.");
  const score=parse(new TextDecoder("utf-8",{fatal:true}).decode(scores[0][1]));
  if(entries.size!==score.samples.length+1)throw Error("ZIP assets don't match the beat.");
  const payloads=[];
  for(const asset of score.samples){
   const bytes=entries.get(asset.path);
   if(!bytes)throw Error("Missing "+asset.path+" in music ZIP.");
   inspectAudioBytes(bytes,asset.mime);
   payloads.push([asset.id,bytes]);
  }
  for(const [id,bytes] of payloads)putAsset(id,bytes);
  return score;
 }
 if(!file.name.toLowerCase().endsWith(".premidi"))throw Error("Open .premidi or .zip.");
 if(file.size>MAX_SCORE_BYTES)throw Error("Beat instructions exceed 1 MB.");
 const score=parse(await file.text());
 if(score.samples.length)throw Error("This beat needs recordings. Open its .zip package instead.");
 return score;
}
