// package.json is authoritative; keep Cargo's generated product metadata in step.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),{version}=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw Error('Invalid release version');
for(const [name,pattern]of [
 ['desktop/Cargo.toml',/(\[package\][\s\S]*?\r?\nversion\s*=\s*")[^"]+("\s*\r?\n)/],
 ['desktop/Cargo.lock',/(\[\[package\]\]\r?\nname = "pre-midi-desktop"\r?\nversion = ")[^"]+("\r?\n)/]
]){
 const path=new URL(name,root),source=await readFile(path,'utf8');
 if(!pattern.test(source))throw Error('Missing desktop version in '+name);
 await writeFile(path,source.replace(pattern,(_match,before,after)=>before+version+after));
}
console.log('Desktop metadata synchronized to',version);
