import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir,platform,arch} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'premidi-capture-'));
try{
 const binary=join(temp,'capture-check'),flags=['-std=c++17','-O2','-ffp-contract=off','-Wall','-Wextra','-Werror','-pedantic'];
 execFileSync(process.env.CXX||'g++',[...flags,join(root,'native/capture-test.cpp'),'-o',binary],{stdio:'pipe',encoding:'utf8'});
 const result=JSON.parse(execFileSync(binary,[],{encoding:'utf8',timeout:90000}));
 await writeFile(new URL('../benchmarks/native-capture.latest.json',import.meta.url),JSON.stringify({...result,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),os:platform(),architecture:arch(),rates:[8000,44100,48000,96000,192000],blocks:[1,17,128,511,8192],flags,physicalDeviceQualification:'pending',tests:['exact callback count-in and capture start frame','calibrated input trim and tail','fixed-duration standalone capture','pause and manual stop','no C++ callback allocations']},null,2)+'\n');
 console.log('PASS native capture: '+result.cases+' deterministic cases; physical hardware pending');
}finally{await rm(temp,{recursive:true,force:true});}
