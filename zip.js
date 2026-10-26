// ZIP STORE reader/writer. A package contains exactly one .premidi JSON beat
// and companion assets/*.wav|ogg|mp3, with no external ZIP dependency.
// Files are uncompressed by design; WAV is an intentional standalone deliverable.
const encode=new TextEncoder(),decode=new TextDecoder("utf-8",{fatal:true});
const MAX_ZIP_SIZE=64_000_000;
const MAX_ENTRIES=170;
function crc32(data){
 let crc=0xffffffff;
 for(const value of data){
  crc^=value;
  for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function u16(view,offset,x){view.setUint16(offset,x,true);}
function u32(view,offset,x){view.setUint32(offset,x>>>0,true);}
function checkedName(path){
 if(typeof path!=="string"||path.length>240||
  !/^(?:[a-zA-Z0-9_-]+\.premidi|assets\/[a-zA-Z0-9_-]+\.(?:wav|ogg|mp3|webm|mp4))$/.test(path))
  throw Error("Unsafe or unexpected file in music package: "+path);
 return path;
}
export function createZip(entries){
 if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_ENTRIES)
  throw Error("Invalid music package file count.");
 const local=[],central=[];let offset=0;
 const seen=new Set();
 for(const entry of entries){
  const name=checkedName(entry.path);
  if(seen.has(name))throw Error("Duplicate packaged asset: "+name);
  seen.add(name);
  const filename=encode.encode(name),data=entry.data instanceof Uint8Array?entry.data:
   entry.data instanceof ArrayBuffer?new Uint8Array(entry.data):encode.encode(String(entry.data));
  if(data.byteLength>MAX_ZIP_SIZE)throw Error("Music package asset is too large.");
  const crc=crc32(data);
  const l=new Uint8Array(30+filename.length),lv=new DataView(l.buffer);
  u32(lv,0,0x04034b50);u16(lv,4,20);u16(lv,6,0x800);u16(lv,8,0);
  u32(lv,14,crc);u32(lv,18,data.length);u32(lv,22,data.length);
  u16(lv,26,filename.length);l.set(filename,30);
  const c=new Uint8Array(46+filename.length),cv=new DataView(c.buffer);
  u32(cv,0,0x02014b50);u16(cv,4,20);u16(cv,6,20);u16(cv,8,0x800);
  u16(cv,10,0);u32(cv,16,crc);u32(cv,20,data.length);u32(cv,24,data.length);
  u16(cv,28,filename.length);u32(cv,42,offset);c.set(filename,46);
  local.push(l,data);central.push(c);offset+=l.length+data.length;
  if(offset>MAX_ZIP_SIZE)throw Error("Music package exceeds 64 MB.");
 }
 const centralSize=central.reduce((sum,x)=>sum+x.length,0),trailer=new Uint8Array(22),v=new DataView(trailer.buffer);
 u32(v,0,0x06054b50);u16(v,8,central.length);u16(v,10,central.length);
 u32(v,12,centralSize);u32(v,16,offset);
 const size=offset+centralSize+trailer.length;
 if(size>MAX_ZIP_SIZE)throw Error("Music package exceeds 64 MB.");
 return new Blob([...local,...central,trailer],{type:"application/zip"});
}
export async function readZip(blob){
 if(!blob||blob.size>MAX_ZIP_SIZE)throw Error("Music package exceeds 64 MB.");
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
 if(bytes.length<22)throw Error("Invalid ZIP package.");
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 }
 if(end<0)throw Error("ZIP file has no central directory.");
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),at=view.getUint32(end+16,true);
 if(count<1||count>MAX_ENTRIES||at+size>end||view.getUint16(end+8,true)!==count)
  throw Error("Invalid ZIP entry table.");
 const entries=new Map();let cursor=at;
 for(let i=0;i<count;i++){
  if(cursor+46>bytes.length||view.getUint32(cursor,true)!==0x02014b50)
   throw Error("Invalid ZIP central file header.");
  const method=view.getUint16(cursor+10,true),
   checksum=view.getUint32(cursor+16,true),
   packed=view.getUint32(cursor+20,true),
   actual=view.getUint32(cursor+24,true),
   filenameLength=view.getUint16(cursor+28,true),
   extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),
   localOffset=view.getUint32(cursor+42,true);
  if(method!==0||packed!==actual||actual>MAX_ZIP_SIZE||cursor+46+filenameLength+extra+comment>bytes.length)
   throw Error("Only uncompressed music packages are supported.");
  const name=checkedName(decode.decode(bytes.subarray(cursor+46,cursor+46+filenameLength)));
  if(entries.has(name))throw Error("Duplicate file in package.");
  if(localOffset+30>bytes.length||view.getUint32(localOffset,true)!==0x04034b50)
   throw Error("Invalid ZIP local file header.");
  const start=localOffset+30+view.getUint16(localOffset+26,true)+view.getUint16(localOffset+28,true);
  if(start+actual>bytes.length)throw Error("Truncated ZIP audio data.");
  const data=bytes.slice(start,start+actual);
  if(crc32(data)!==checksum)throw Error("ZIP sample checksum mismatch.");
  entries.set(name,data);
  cursor+=46+filenameLength+extra+comment;
 }
 if(cursor!==at+size)throw Error("Invalid ZIP central directory length.");
 return entries;
}
