// Run locally by the maintainer after `npm ci` and `gh auth login`.
// Private material goes to gh's stdin and a private backup, never command args or logs.
import {mkdtemp,readFile,mkdir,copyFile,chmod,rm,access} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const repo='natanai/pre-midi';
function run(command,args,input){
 const r=spawnSync(command,args,{input,encoding:'utf8',shell:false});
 if(r.error||r.status!==0)throw Error(command+' failed; check that it is installed and authenticated for repository secrets');
 return r.stdout;
}
run('gh',['auth','status']);
const backup=join(process.env.LOCALAPPDATA||join(homedir(),'.config'),'pre-midi-maintainer','update.key');
try{await access(backup);throw Error('A signing backup already exists at '+backup+'; reuse the existing key instead of replacing it.');}catch(e){if(e.code!=='ENOENT')throw e;}
const temporary=await mkdtemp(join(tmpdir(),'premidi-signing-'));
try{
 const privateFile=join(temporary,'update.key');
 const cli=fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js',import.meta.url));
 run(process.execPath,[cli,'signer','generate','--ci','--password','','--write-keys',privateFile]);
 const privateKey=await readFile(privateFile,'utf8'),publicKey=(await readFile(privateFile+'.pub','utf8')).trim();
 await mkdir(dirname(backup),{recursive:true,mode:0o700});
 await copyFile(privateFile,backup);await chmod(backup,0o600);
 run('gh',['secret','set','TAURI_SIGNING_PRIVATE_KEY','--repo',repo],privateKey);
 run('gh',['variable','set','TAURI_UPDATER_PUBLIC_KEY','--repo',repo,'--body',publicKey]);
 console.log('Update signing configured. Keep the private backup safe:',backup);
 console.log('Build a new preview to embed the public key; existing previews without it must be replaced manually once.');
}finally{await rm(temporary,{recursive:true,force:true});}
