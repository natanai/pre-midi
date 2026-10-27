import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const script=new URL('../scripts/publish-desktop.mjs',import.meta.url);
const fixtures=[['windows','x86_64','installer'],['windows','x86_64','portable'],['darwin','x86_64','installer'],['darwin','aarch64','installer'],['linux','x86_64','portable'],['linux','x86_64','package']];
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'premidi-release-')),artifacts=[];
 for(const [platform,arch,kind]of fixtures){
  const name=[platform,arch,kind].join('-')+'.bin',bytes=Buffer.from(name);
  await writeFile(join(dir,name),bytes);
  artifacts.push({name,platform,arch,kind,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),signature:null});
 }
 await writeFile(join(dir,'artifacts-test.json'),JSON.stringify(artifacts));
 return {dir,artifacts};
}
const run=dir=>execFileSync(process.execPath,[fileURLToPath(script),dir],{cwd:root,stdio:'pipe'});
test('release aggregate refuses a missing platform and creates no update manifest',async()=>{
 const {dir,artifacts}=await setup();
 try{
  artifacts.pop();await writeFile(join(dir,'artifacts-test.json'),JSON.stringify(artifacts));
  assert.throws(()=>run(dir),error=>error.stderr.toString().includes('Incomplete release'));
  await assert.rejects(readFile(join(dir,'desktop-updates.json')),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('release aggregate refuses a corrupted package before publication',async()=>{
 const {dir,artifacts}=await setup();
 try{
  await writeFile(join(dir,artifacts[0].name),'tampered payload');
  assert.throws(()=>run(dir),error=>error.stderr.toString().includes('checksum mismatch'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('complete unsigned preview has checksums and explicitly disables automatic installation',async()=>{
 const {dir}=await setup();
 try{
  run(dir);const report=JSON.parse(await readFile(join(dir,'desktop-release.json'),'utf8'));
  assert.equal(report.signedUpdates,false);assert.equal(report.artifacts.length,6);
  await assert.rejects(readFile(join(dir,'desktop-updates.json')),{code:'ENOENT'});
  const sums=await readFile(join(dir,'SHA256SUMS.txt'),'utf8');assert.equal(sums.trim().split('\n').length,7);
 }finally{await rm(dir,{recursive:true,force:true});}
});
