import {writeFile,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const cargo=await readFile(new URL('desktop/Cargo.toml',root),'utf8');
if(!cargo.includes('version = "'+pkg.version+'"'))throw Error('Desktop Cargo version must match package.json');
const publicKey=process.env.TAURI_UPDATER_PUBLIC_KEY||'',privateKey=process.env.TAURI_SIGNING_PRIVATE_KEY||'';
if(!!publicKey!==!!privateKey)throw Error('Configure both the update public key and private key, or neither for an unsigned preview');
const config={bundle:{createUpdaterArtifacts:!!publicKey},plugins:{updater:{pubkey:publicKey}}};
await writeFile(new URL('desktop/ci-config.json',root),JSON.stringify(config));
console.log(publicKey?'Update artifact signing enabled':'Unsigned preview: automatic installation is disabled');
