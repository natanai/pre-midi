import {referencedSampleIds} from "./soundModel.js";
// Compact, plain .premidi Beat instructions with separate audio files in one portable ZIP.
import {parse,filename,validate} from "./schema.js";
import {createZip,readZip} from "./zip.js";
import {getAsset,putAsset,MAX_PACKAGE_BYTES} from "./assetRegistry.js";
import {inspectAudioBytes,MAX_BEAT_BYTES} from "./sampler.js";
const text=new TextEncoder();
export function exportProject(beat){
 const issues=validate(beat);
 if(issues.length)throw Error(issues.join("\n"));
 // Unused recordings must not bloat either the music instructions or ZIP.
 // Preserve every zone on every sampled instrument, including zones an author
 // might use later, but exclude sources orphaned by removed instruments.
 const referenced=referencedSampleIds(beat.instruments);
 const manifest={...beat,samples:beat.samples.filter(asset=>referenced.has(asset.id))};
 const raw=text.encode(JSON.stringify(manifest));
 if(raw.length>MAX_BEAT_BYTES)throw Error("Beat instructions exceed 1 MB.");
 if(!manifest.samples.length)return {
  name:filename(beat,".premidi"),blob:new Blob([raw],{type:"application/json"})
 };
 const entries=[{path:filename(beat,".premidi"),data:raw}];
 let total=raw.length;
 for(const asset of manifest.samples){
  const bytes=getAsset(asset.id);
  if(!bytes)throw Error("Missing "+asset.path+". Export needs its companion WAV/OGG recording.");
  inspectAudioBytes(bytes,asset.mime);
  total+=bytes.length;
  if(total>MAX_PACKAGE_BYTES)throw Error("Audio assets exceed 64 MB.");
  entries.push({path:asset.path,data:bytes});
 }
 return {name:filename(beat,".zip"),blob:createZip(entries)};
}
export async function importProject(file){
 if(!file||file.size>MAX_PACKAGE_BYTES)throw Error("Music package exceeds 64 MB.");
 if(file.name.toLowerCase().endsWith(".zip")){
  const entries=await readZip(file);
  const manifests=[...entries].filter(([name])=>name.endsWith(".premidi"));
  if(manifests.length!==1)throw Error("Package needs exactly one .premidi.");
  const beat=parse(new TextDecoder("utf-8",{fatal:true}).decode(manifests[0][1]));
  if(entries.size!==beat.samples.length+1)throw Error("ZIP assets don't match the beat.");
  const payloads=[];
  for(const asset of beat.samples){
   const bytes=entries.get(asset.path);
   if(!bytes)throw Error("Missing "+asset.path+" in music ZIP.");
   inspectAudioBytes(bytes,asset.mime);
   payloads.push([asset.id,bytes]);
  }
  for(const [id,bytes] of payloads)putAsset(id,bytes);
  return beat;
 }
 if(!file.name.toLowerCase().endsWith(".premidi"))throw Error("Open .premidi or .zip.");
 if(file.size>MAX_BEAT_BYTES)throw Error("Beat instructions exceed 1 MB.");
 const beat=parse(await file.text());
 if(beat.samples.length)throw Error("This beat needs recordings. Open its .zip package instead.");
 return beat;
}
