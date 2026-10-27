// Dependency-free Chromium runner. Future backend runners can reuse the PCM metrics.
import {createServer} from "node:http";
import {readFile,writeFile,mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve,extname,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn,execFileSync} from "node:child_process";
import {tmpdir,cpus,platform,arch,release} from "node:os";
import {createHash} from "node:crypto";
import {compareReference} from "../tests/audio-quality/metrics.js";
import {runtimeModules} from "./prepare-pages.mjs";
const root=fileURLToPath(new URL("../",import.meta.url)),args=process.argv.slice(2);
let suite="quality",out,requireClean=false;
for(let i=0;i<args.length;i++){
 if(args[i]==="--out")out=args[++i];
 else if(args[i]==="--suite")suite=args[++i];
 else if(args[i]==="--require-clean")requireClean=true;
 else throw Error("Usage: audio-benchmark.mjs [--suite quality|voices|musical] [--out path.json] [--require-clean]");
}
if(!["quality","voices","musical"].includes(suite))throw Error("Unknown audio suite");
const workingTreeDirty=execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim().length>0;
if(requireClean&&workingTreeDirty)throw Error("Reference qualification requires a clean committed working tree");
const output=resolve(root,out||"benchmarks/"+(suite==="voices"?"voice-lifecycle":suite==="musical"?"musical-parity":"audio-quality")+".latest.json");
const page=suite==="voices"?"voice-render.html":suite==="musical"?"parity-render.html":"render.html";
let referenceRoot=null;
if(suite==="musical"){
 const manifest=JSON.parse(await readFile(resolve(root,"tests/audio-quality/musical-fixtures.json"),"utf8"));
 referenceRoot=await mkdtemp(resolve(tmpdir(),"premidi-reference-"));
 const archive=execFileSync("git",["archive","--format=tar",manifest.referenceCommit],{cwd:root,maxBuffer:16*1024*1024});
 execFileSync("tar",["-xf","-","-C",referenceRoot],{input:archive});
}
const profile=await mkdtemp(resolve(tmpdir(),"premidi-quality-"));
let receive;const result=new Promise(done=>{receive=done;});
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,"http://127.0.0.1");
  if(url.pathname==="/__audio_benchmark"&&request.method==="POST"){
   let content="";for await(const chunk of request){content+=chunk;if(content.length>4_000_000)throw Error("Report too large");}
   receive(JSON.parse(content));response.end("OK");return;
  }
  const reference=referenceRoot&&url.pathname.startsWith("/reference/");
  const servedRoot=reference?referenceRoot:root;
  const path=resolve(servedRoot,"."+decodeURIComponent(reference?url.pathname.slice(10):url.pathname));
  if(!path.startsWith(servedRoot))throw Error("Invalid path");
  const bytes=await readFile(path);
  response.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".json":"application/json"})[extname(path)]||"application/octet-stream"});response.end(bytes);
 }catch(error){response.writeHead(400);response.end(String(error.message));}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const chrome=process.env.CHROME_BIN||"google-chrome";
const child=spawn(chrome,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--no-first-run",
 "--autoplay-policy=no-user-gesture-required","--disable-background-timer-throttling","--disable-renderer-backgrounding",
 "--user-data-dir="+profile,"http://127.0.0.1:"+server.address().port+"/tests/audio-quality/"+page],{stdio:"ignore"});
let timer;
try{
 const report=await Promise.race([result,
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Audio benchmark timed out after 180 seconds")),180000);}),
  new Promise((_,reject)=>{child.once("error",reject);child.once("exit",code=>reject(Error("Chromium exited "+code)));})]);
 if(!report.error&&suite==="quality"){
  const reference=JSON.parse(await readFile(resolve(root,"tests/audio-quality/reference.json"),"utf8"));
  report.referenceComparison=compareReference(report.results,reference);
  report.failures.push(...report.referenceComparison.failures);
  report.summary.failed=report.failures.length;
  report.summary.status=report.failures.length?"fail":"pass";
 }
 const files=[...await runtimeModules(new URL("../",import.meta.url)),"tests/audio-quality/metrics.js","tests/audio-quality/fixtures.js","tests/audio-quality/suite.js","tests/audio-quality/policy.json","tests/audio-quality/reference.json",...(suite==="voices"?["tests/audio-quality/voice-suite.js","tests/audio-quality/capture-worklet.js"]:suite==="musical"?["tests/audio-quality/musical-fixtures.json","tests/audio-quality/parity-render.html"]:[])].sort();
 const hash=createHash("sha256");for(const file of files){hash.update(file+"\0");hash.update(await readFile(resolve(root,file)));}
 let tag=null;try{tag=execFileSync("git",["describe","--tags","--exact-match"],{cwd:root,encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
 let commit=null;try{commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();}catch{}
 Object.assign(report,{measuredAt:new Date().toISOString(),source:{commit,tag,baseCommit:commit,workingTreeDirty,runtimeAndFixtureSha256:hash.digest("hex")},
  host:{os:platform(),release:release(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,node:process.version},
  policy:JSON.parse(await readFile(resolve(root,"tests/audio-quality/policy.json"),"utf8"))});
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({output,summary:report.summary,error:report.error,failures:report.failures}));
 if(report.error||report.summary?.status!=="pass")process.exitCode=1;
}finally{
 clearTimeout(timer);child.kill("SIGKILL");server.closeAllConnections();server.close();
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 if(referenceRoot)await rm(referenceRoot,{recursive:true,force:true});
}
