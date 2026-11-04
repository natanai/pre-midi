import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../release/',import.meta.url),root=new URL('../',import.meta.url);
const {version}=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const portableOnly=process.argv.includes('--windows-portable-only');
if(portableOnly&&!version.includes('-')&&process.env.ALLOW_STABLE_RELEASE!=='true')throw Error('Stable portable releases require explicit qualification and ALLOW_STABLE_RELEASE=true');
const tag='v'+version,files=await readdir(dir),artifacts=[];
for(const name of files.filter(name=>/^artifacts-.*\.json$/.test(name)))artifacts.push(...JSON.parse(await readFile(new URL(name,dir),'utf8')));
const requiredArtifacts=portableOnly?[['windows','x86_64','portable']]:[['windows','x86_64','installer'],['windows','x86_64','portable'],['darwin','x86_64','installer'],['darwin','aarch64','installer'],['linux','x86_64','portable'],['linux','x86_64','package']];
for(const [platform,arch,kind] of requiredArtifacts){
 if(artifacts.filter(a=>a.platform===platform&&a.arch===arch&&a.kind===kind).length!==1)throw Error('Incomplete release: '+[platform,arch,kind].join('/'));
}
if(portableOnly&&(artifacts.length!==1||files.some(name=>!/^artifacts-.*\.json$/.test(name)&&![artifacts[0].name,artifacts[0].name+'.sig'].includes(name))))throw Error('Portable release must contain only its ZIP and optional signature');
for(const a of artifacts){
 if(!/^[a-zA-Z0-9_.-]+$/.test(a.name))throw Error('Invalid release asset');
 const bytes=await readFile(new URL(a.name,dir));
 if(bytes.length!==a.size||createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw Error('Release checksum mismatch: '+a.name);
}
const platforms={};
for(const a of artifacts.filter(a=>a.signature)){
 const kind=a.platform==='windows'&&a.kind==='installer'?'nsis':
  a.platform==='linux'&&a.kind==='portable'?'appimage':
  a.platform==='darwin'&&a.kind==='updater'?'app':null;
 if(!kind)continue;
 platforms[[a.platform,a.arch,kind].join('-')]={url:`https://github.com/natanai/pre-midi/releases/download/${tag}/${a.name}`,signature:a.signature};
}
const required=['windows-x86_64-nsis','darwin-x86_64-app','darwin-aarch64-app','linux-x86_64-appimage'];
const signed=required.every(target=>platforms[target]);
if(Object.keys(platforms).length&&!signed && !portableOnly)throw Error('Refusing a partially signed update release');
if(portableOnly&&artifacts[0].signature){
 const a=artifacts[0];
 const signatureFile=(await readFile(new URL(a.name+'.sig',dir),'utf8')).trim();
 if(signatureFile!==a.signature)throw Error('Portable signature does not match signed artifact');
 platforms['windows-x86_64-portable']={url:`https://github.com/natanai/pre-midi/releases/download/${tag}/${a.name}`,signature:a.signature};
}
const notes=await readFile(new URL('docs/desktop-release-notes.md',root),'utf8');
if(signed||(portableOnly&&!!artifacts[0].signature))await writeFile(new URL('desktop-updates.json',dir),JSON.stringify({version,notes,pub_date:new Date().toISOString(),platforms},null,2)+'\n');
await writeFile(new URL('desktop-release.json',dir),JSON.stringify({version,tag,commit:process.env.GITHUB_SHA,channel:version.includes('-')?'preview':'stable',distribution:portableOnly?(version.includes('-')?'windows-portable-preview':'windows-portable-stable'):'full-desktop',signedUpdates:signed||(portableOnly&&!!artifacts[0].signature),artifacts},null,2)+'\n');
const names=(await readdir(dir)).filter(name=>!name.startsWith('artifacts-')&&!name.endsWith('.md')).sort();
const checksums=[];for(const name of names){const bytes=await readFile(new URL(name,dir));checksums.push(createHash('sha256').update(bytes).digest('hex')+'  '+name);}
await writeFile(new URL('SHA256SUMS.txt',dir),checksums.join('\n')+'\n');
await writeFile(new URL('release-notes.md',dir),notes+'\n\n'+(portableOnly?(artifacts[0].signature?'Signed Windows portable ZIP: Settings can verify and install updates with startup rollback; data/, projects/ and exports/ are preserved.':'Unsigned manual-update ZIP: automatic installation is disabled. Close the app and replace only application files; preserve data/, projects/ and exports/.'):signed?'Update packages are signed using the configured Tauri update key.':'Automatic installation is disabled in this unsigned preview because an update trust key has not been provisioned.')+'\n');
console.log('Validated',portableOnly?'Windows portable preview':'complete platform set','for',tag,'signed updates:',signed);
