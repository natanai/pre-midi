import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const revision='9634bedb5b5a2ca38c1ee7108a9358a4e233f14d';
const expected='ac7af4de748b7e26b777f37e01cee313a308a7296a3eb080e2906b320cc55c89';
const path=new URL('../native/vendor/miniaudio/miniaudio.h',import.meta.url);
const valid=bytes=>createHash('sha256').update(bytes).digest('hex')===expected;
try{if(valid(await readFile(path))){console.log('Pinned miniaudio 0.11.25 already verified');process.exit(0);}}catch{}
const response=await fetch(`https://raw.githubusercontent.com/mackron/miniaudio/${revision}/miniaudio.h`,{signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error('Could not fetch pinned miniaudio: '+response.status);
const bytes=Buffer.from(await response.arrayBuffer());if(!valid(bytes))throw Error('miniaudio SHA-256 mismatch');
await mkdir(new URL('../native/vendor/miniaudio/',import.meta.url),{recursive:true});await writeFile(path,bytes);
console.log('Verified miniaudio 0.11.25 at '+revision);
