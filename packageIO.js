// Portable, dependency-free ZIP package for composition + referenced audio.
// The .premidi manifest contains paths ONLY. Raw WAV/OGG/MP3 assets remain
// separate files, usable directly by a pre-programmed client's asset folder.
import {validate,parse,filename} from "./schema.js";
import {base64ToBytes,bytesToBase64,validateSampleAsset} from "./sampler.js";
const encoder=new TextEncoder(),decoder=new TextDecoder("utf-8",{fatal:true});
const EXT={"audio/wav":"wav","audio/ogg":"ogg","audio/mpeg":"mp3"};
const LIMIT=60_000_000;
const safePath=path=>typeof path==="string"&&/^assets\/[A-Za-z0-9_-]{1,128}\.(?:wav|ogg|mp3)$/.test(path);
const crcTable=Uint32Array.from({length:256},(_,n)=>{
 let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
export function crc32(bytes){
 let crc=0xffffffff;
 for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
}
function pack(entries){
 const parts=[],central=[];let offset=0;
 const u16=(v,n,o)=>v.setUint16(o,n,true),u32=(v,n,o)=>v.setUint32(o,n,true);
 for(const entry of entries){
  const name=encoder.encode(entry.name),data=entry.data;
  if(name.length>255||!data||data.length>LIMIT||offset+data.length>LIMIT)throw Error("Package is too large.");
  const buffer=new Uint8Array(30+name.length+data.length),v=new DataView(buffer.buffer);
  u32(v,0x04034b50,0);u16(v,20,4);u16(v,0x0800,6);u16(v,0,8);
  u32(v,crc32(data),14);u32(v,data.length,18);u32(v,data.length,22);u16(v,name.length,26);
  buffer.set(name,30);buffer.set(data,30+name.length);
  parts.push(buffer);
  const dir=new Uint8Array(46+name.length),d=new DataView(dir.buffer);
  u32(d,0x02014b50,0);u16(d,20,4);u16(d,20,6);u16(d,0x0800,8);u16(d,0,10);
  u32(d,crc32(data),16);u32(d,data.length,20);u32(d,data.length,24);
  u16(d,name.length,28);u32(d,offset,42);dir.set(name,46);
  central.push(dir);offset+=buffer.length;
 }
 const centralStart=offset;
 for(const part of central){parts.push(part);offset+=part.length;}
 const tail=new Uint8Array(22),e=new DataView(tail.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);
 e.setUint16(10,entries.length,true);e.setUint32(12,offset-centralStart,true);
 e.setUint32(16,centralStart,true);parts.push(tail);offset+=22;
 if(offset>LIMIT)throw Error("Package is too large.");
 const output=new Uint8Array(offset);let cursor=0;
 for(const part of parts){output.set(part,cursor);cursor+=part.length;}
 return output;
}
function unpack(bytes){
 if(bytes.length>LIMIT)throw Error("Package exceeds 60 MB.");
 const entries=new Map(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let cursor=0;
 while(cursor+4<=bytes.length&&view.getUint32(cursor,true)===0x04034b50){
  if(cursor+30>bytes.length)throw Error("Broken audio package.");
  const flags=view.getUint16(cursor+6,true),method=view.getUint16(cursor+8,true);
  const expected=view.getUint32(cursor+14,true),compressed=view.getUint32(cursor+18,true);
  const length=view.getUint16(cursor+26,true),extra=view.getUint16(cursor+28,true);
  if(flags&8||method!==0||entries.size>=200)throw Error("Unsupported ZIP compression or entry count.");
  const nameStart=cursor+30,nameEnd=nameStart+length,start=nameEnd+extra,end=start+compressed;
  if(end>bytes.length)throw Error("Truncated package.");
  const name=decoder.decode(bytes.subarray(nameStart,nameEnd));
  if(!safePath(name)&&!(name.endsWith(".premidi")&&!name.includes("/")&&name.length<=105))
   throw Error("Unexpected package entry: "+name);
  if(entries.has(name))throw Error("Duplicate package entry.");
  const data=bytes.slice(start,end);
  if(crc32(data)!==expected)throw Error("Package checksum mismatch: "+name);
  entries.set(name,data);cursor=end;
 }
 if(entries.size<1||view.getUint32(cursor,true)!==0x02014b50)throw Error("Not a pre-midi ZIP package.");
 return entries;
}
function assetName(asset,index){
 const stem=asset.id.replace(/[^A-Za-z0-9_-]/g,"_").slice(0,110)||"sample";
 return "assets/"+stem+"-"+index+"."+EXT[asset.mime];
}
export function exportPackage(score){
 const errors=validate(score);
 if(errors.length)throw Error(errors[0]);
 const scoreName=filename(score,".premidi");
 // Output only the sounds actually referenced by instruments; a deleted
 // sample must never bloat an exported composition.
 const referenced=new Set(score.instruments.filter(inst=>inst.patch?.type==="sample")
  .flatMap(inst=>inst.patch.zones.map(zone=>zone.assetId)));
 const missing=[...referenced].filter(id=>!score.samples.some(asset=>asset.id===id));
 if(missing.length)throw Error("Instrument references missing audio.");
 const assets=score.samples.filter(asset=>referenced.has(asset.id));
 const usedPaths=new Set();
 const manifest={...score,samples:assets.map((asset,i)=>{
  if(!asset.data)throw Error("Audio "+asset.name+" is unavailable. Open its full package first.");
  const path=assetName(asset,i);
  if(!safePath(path)||usedPaths.has(path))throw Error("Invalid package audio path.");
  usedPaths.add(path);
  const {data,...meta}=asset;
  return {...meta,path};
 })};
 const json=JSON.stringify(manifest,null,2);
 if(!assets.length)return {name:scoreName,blob:new Blob([json],{type:"application/json"}),manifest};
 const entries=[{name:scoreName,data:encoder.encode(json)},
  ...assets.map((asset,i)=>({name:manifest.samples[i].path,data:base64ToBytes(asset.data)}))];
 const output=pack(entries);
 return {name:filename(score,".zip"),blob:new Blob([output],{type:"application/zip"}),manifest};
}
export function importPackage(bytes){
 if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
 const entries=unpack(bytes);
 const mains=[...entries.keys()].filter(name=>name.endsWith(".premidi"));
 if(mains.length!==1)throw Error("Package must contain exactly one .premidi composition.");
 const raw=decoder.decode(entries.get(mains[0])),manifest=parse(raw);
 const hydrated={...manifest,samples:manifest.samples.map(asset=>{
  if(!safePath(asset.path)||!entries.has(asset.path))throw Error("Missing recorded asset: "+asset.path);
  const data=bytesToBase64(entries.get(asset.path));
  const value={...asset,data};
  const error=validateSampleAsset(value);
  if(error)throw Error(error);
  return value;
 })};
 const errors=validate(hydrated);
 if(errors.length)throw Error(errors[0]);
 return hydrated;
}
