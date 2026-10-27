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
async function setup(entries=fixtures){
 const dir=await mkdtemp(join(tmpdir(),'premidi-release-')),artifacts=[];
 for(const [platform,arch,kind]of entries){
  const name=[platform,arch,kind].join('-')+'.bin',bytes=Buffer.from(name);
  await writeFile(join(dir,name),bytes);
  artifacts.push({name,platform,arch,kind,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),signature:null});
 }
 await writeFile(join(dir,'artifacts-test.json'),JSON.stringify(artifacts));
 return {dir,artifacts};
}
const run=dir=>execFileSync(process.execPath,[fileURLToPath(script),dir],{cwd:root,stdio:'pipe'});
const runPortable=dir=>execFileSync(process.execPath,[fileURLToPath(script),dir,'--windows-portable-only'],{cwd:root,stdio:'pipe'});
test('portable preview publishes one Windows ZIP with checksums and no update installer',async()=>{
 const {dir}=await setup([['windows','x86_64','portable']]);
 try{
  runPortable(dir);const report=JSON.parse(await readFile(join(dir,'desktop-release.json'),'utf8'));
  assert.equal(report.distribution,'windows-portable-preview');assert.equal(report.artifacts.length,1);assert.equal(report.signedUpdates,false);
  assert.equal((await readFile(join(dir,'SHA256SUMS.txt'),'utf8')).trim().split('\n').length,2);
  await assert.rejects(readFile(join(dir,'desktop-updates.json')),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('portable preview refuses installer or other platform assets',async()=>{
 const {dir}=await setup();
 try{assert.throws(()=>runPortable(dir),error=>error.stderr.toString().includes('only the Windows portable ZIP'));}
 finally{await rm(dir,{recursive:true,force:true});}
});
test('portable preview refuses a missing or corrupt Windows package',async()=>{
 const {dir,artifacts}=await setup([['windows','x86_64','portable']]);
 try{
  await writeFile(join(dir,artifacts[0].name),'corrupt');
  assert.throws(()=>runPortable(dir),error=>error.stderr.toString().includes('checksum mismatch'));
  await writeFile(join(dir,'artifacts-test.json'),'[]');
  assert.throws(()=>runPortable(dir),error=>error.stderr.toString().includes('Incomplete release'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
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

test('signed manifest selects the AppImage even when a DEB also has a signature',async()=>{
 const {dir,artifacts}=await setup();
 try{
  for(const artifact of artifacts){
   if(artifact.platform==='windows'&&artifact.kind==='installer')artifact.signature='windows-signature';
   if(artifact.platform==='linux')artifact.signature=artifact.kind==='portable'?'appimage-signature':'deb-signature';
  }
  for(const arch of ['x86_64','aarch64']){
   const name='mac-'+arch+'.app.tar.gz',bytes=Buffer.from(name);
   await writeFile(join(dir,name),bytes);
   artifacts.push({name,platform:'darwin',arch,kind:'updater',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),signature:'mac-signature'});
  }
  await writeFile(join(dir,'artifacts-test.json'),JSON.stringify(artifacts));run(dir);
  const manifest=JSON.parse(await readFile(join(dir,'desktop-updates.json'),'utf8'));
  assert.equal(manifest.platforms['linux-x86_64-appimage'].signature,'appimage-signature');
  assert.equal(Object.keys(manifest.platforms).length,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
