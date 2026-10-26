// Portable v8 Song documents; deliberately not wired into the v7 Beat editor.
// A Song is instruction-only JSON. Every referenced recording/sample remains
// an independent asset carried by a companion ZIP or application asset store.
import {validateSong} from "./songModel.js";
import {filename} from "./schema.js";
import {referencedSampleIds} from "./soundModel.js";
import {getAsset,putAsset,MAX_PACKAGE_BYTES} from "./assetRegistry.js";
import {inspectAudioBytes} from "./sampler.js";
import {recordingBytes,inspectRecordingBytes} from "./recordingAssets.js";
import {createZip,readZip} from "./zip.js";

export const MAX_SONG_DOCUMENT_BYTES=8_000_000;
const encoder=new TextEncoder();
const decoder=new TextDecoder("utf-8",{fatal:true});
const checked=song=>{
 const errors=validateSong(song);
 if(errors.length)throw Error(errors.join("\n"));
 return song;
};
const relevantAssets=song=>{
 const assets=new Map();
 for(const beat of song.beats){
  const needed=referencedSampleIds(beat.instruments);
  for(const asset of beat.samples){
   if(!needed.has(asset.id))continue;
   const previous=assets.get(asset.id);
   if(previous&&JSON.stringify(previous)!==JSON.stringify(asset))
    throw Error("Conflicting audio Asset identity.");
   assets.set(asset.id,asset);
  }
 }
 for(const recording of song.recordings||[]){
  if(assets.has(recording.id))throw Error("Recording and Beat sample IDs must not collide.");
  assets.set(recording.id,recording);
 }
 return [...assets.values()];
};
// Refuse to interpret a v7 Beat or unknown future format as a v8 Song.
export function parseSong(raw){
 if(typeof raw!=="string"||encoder.encode(raw).length>MAX_SONG_DOCUMENT_BYTES)
  throw Error("Song instructions exceed 8 MB.");
 return checked(JSON.parse(raw));
}
export function exportSongProject(song){
 checked(song);
 // Drop unused samples in the portable copy, never mutate editable Beats.
 const manifest=structuredClone(song);
 for(const beat of manifest.beats){
  const used=referencedSampleIds(beat.instruments);
  beat.samples=beat.samples.filter(asset=>used.has(asset.id));
 }
 const raw=encoder.encode(JSON.stringify(manifest));
 if(raw.length>MAX_SONG_DOCUMENT_BYTES)throw Error("Song instructions exceed 8 MB.");
 const assets=relevantAssets(manifest);
 if(!assets.length)return {
  name:filename(manifest,".premidi"),
  blob:new Blob([raw],{type:"application/json"})
 };
 const entries=[{path:filename(manifest,".premidi"),data:raw}];
 let size=raw.length;
 for(const asset of assets){
  const bytes=getAsset(asset.id);
  if(!bytes)throw Error("Missing "+asset.path+"; export requires its companion audio Asset.");
  if(song.recordings?.some(recording=>recording.id===asset.id))
   inspectRecordingBytes(bytes,asset.mime);
  else inspectAudioBytes(bytes,asset.mime);
  size+=bytes.length;
  if(size>MAX_PACKAGE_BYTES)throw Error("Portable Song exceeds the current 64 MB package limit.");
  entries.push({path:asset.path,data:bytes});
 }
 return {name:filename(manifest,".zip"),blob:createZip(entries)};
}
export async function importSongProject(file){
 if(!file||typeof file.name!=="string"||!file.name.trim()||!Number.isFinite(file.size)||
  file.size>MAX_PACKAGE_BYTES)throw Error("Invalid or oversized Song file.");
 const name=file.name.toLowerCase();
 if(name.endsWith(".premidi")){
  if(file.size>MAX_SONG_DOCUMENT_BYTES)throw Error("Song instructions exceed 8 MB.");
  const song=parseSong(await file.text());
  if(relevantAssets(song).length)throw Error("This Song references external Assets. Open its ZIP package.");
  return song;
 }
 if(!name.endsWith(".zip"))throw Error("Open a .premidi Song or its ZIP package.");
 const entries=await readZip(file);
 const manifests=[...entries].filter(([path])=>path.endsWith(".premidi"));
 if(manifests.length!==1)throw Error("Song package must contain exactly one .premidi.");
 const song=parseSong(decoder.decode(manifests[0][1]));
 const assets=relevantAssets(song);
 if(entries.size!==assets.length+1)throw Error("Song package has extra or missing Assets.");
 // Verify the entire archive before changing the global Asset registry.
 const incoming=[];
 for(const asset of assets){
  const bytes=entries.get(asset.path);
  if(!bytes)throw Error("Missing "+asset.path+" in Song package.");
  const longForm=song.recordings?.some(recording=>recording.id===asset.id);
  if(longForm)inspectRecordingBytes(bytes,asset.mime);
  else inspectAudioBytes(bytes,asset.mime);
  incoming.push([asset.id,bytes,!!longForm]);
 }
 for(const [id,bytes,longForm] of incoming)putAsset(id,bytes,{longForm});
 return song;
}
