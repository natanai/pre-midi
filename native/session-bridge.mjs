// Qualification adapter. Decoding uses the same Rust library as the desktop
// control worker; C++ Session owns/plays all resulting PCM without Web Audio.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeNativeSession} from '../src/hosts/native/session.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export function inlineNativeSession(plans,rate,assets){
 const base=encodeNativeSession(plans,rate),chunks=[];
 const u32=value=>{const b=Buffer.alloc(4);b.writeUInt32LE(value);return b;};
 chunks.push(u32(0x32534d50),u32(assets.length));
 for(const asset of assets){chunks.push(u32(asset.rate),u32(asset.channels),u32(asset.frames),Buffer.from(asset.pcm.buffer,asset.pcm.byteOffset,asset.pcm.byteLength));}
 chunks.push(Buffer.from(base.subarray(4)));return Buffer.concat(chunks);
}
export async function buildNativeSessionRenderer(){
 const directory=await mkdtemp(join(tmpdir(),'premidi-session-')),binary=join(directory,'session-render');let serial=0;
 try{
  execFileSync(process.env.CXX||'g++',['-std=c++17','-O2','-ffp-contract=off','-Wall','-Wextra','-Werror','-pedantic',join(root,'native/session-render.cpp'),'-o',binary]);
  execFileSync(process.env.CARGO||'cargo',['build','--release','--locked','--manifest-path',join(root,'native/decoder/Cargo.toml'),'--example','decode'],{stdio:'pipe',timeout:180000});
  const decoder=process.env.PREMIDI_DECODER_BIN||join(process.env.CARGO_TARGET_DIR||join(root,'native/decoder/target'),'release/examples/decode'+(process.platform==='win32'?'.exe':''));
  const run=(args,input,maxBuffer=512*1024*1024)=>{const r=spawnSync(binary,args.map(String),{input,maxBuffer,timeout:180000});if(r.status!==0)throw Error(r.stderr?.toString()||String(r.error)||'Native session failed');return r.stdout;};
  return {
   async decode(bytes,extension,rate){
    if(!['wav','mp3','ogg','webm','mp4'].includes(extension)||bytes.length>48_000_000)throw Error('Invalid native asset request');
    const source=join(directory,'asset-'+(++serial)+'.'+extension),target=source+'.f32';await writeFile(source,bytes);
    const info=execFileSync(decoder,[source,target],{encoding:'utf8',timeout:60000}).trim().split(/\s+/).map(Number),pcm=await readFile(target),header=Buffer.alloc(12);
    header.writeUInt32LE(info[0],0);header.writeUInt32LE(info[1],4);header.writeUInt32LE(info[2]/info[1],8);
    return run(['--asset',rate],Buffer.concat([header,pcm]));
   },
   render({plans,assets,sampleRate,frames,cycle,seek=0,loop=false,block=128}){
    const prepared=assets.map(asset=>({...asset,pcm:new Float32Array(asset.pcm)}));
    return run([sampleRate,cycle,seek,Number(loop),frames,block,'none'],inlineNativeSession(plans,sampleRate,prepared));
   },
   renderPacket(data,{sampleRate,frames,cycle,seek=0,loop=false,block=128}){return run([sampleRate,cycle,seek,Number(loop),frames,block,'none'],data);},
   dispose:()=>rm(directory,{recursive:true,force:true})
  };
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
