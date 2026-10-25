// Runs without npm dependencies using the Chrome preinstalled on GitHub Actions runners.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { strict as assert } from "node:assert";

const root=resolve(new URL("..",import.meta.url).pathname);
let resolveAudio;
const audioResult=new Promise(resolve=>{resolveAudio=resolve;});
const server=createServer(async (req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  if(pathname==="/__audio_result") {
   const url=new URL(req.url,"http://localhost");
   resolveAudio({status:url.searchParams.get("status"),details:url.searchParams.get("details")});
   res.writeHead(200,{"Content-Type":"text/plain"});res.end("OK");return;
  }
  const file=resolve(root,"."+pathname);
  if(!file.startsWith(root+"/"))throw new Error("Invalid path");
  const content=await readFile(file);
  res.writeHead(200,{"Content-Type":({".js":"text/javascript",".css":"text/css",".html":"text/html"})[extname(file)]||"application/octet-stream"});
  res.end(content);
 } catch {res.writeHead(404);res.end("Not found");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
try {
 const port=server.address().port;
 const chrome=process.env.CHROME_BIN||"google-chrome";
 for(const [width,height] of [[1440,900],[1024,800],[780,900],[390,844]]){
  const url="http://127.0.0.1:"+port+"/tests/layout-check.html";
  const args=[
   "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
   "--hide-scrollbars","--window-size="+width+","+height,"--virtual-time-budget=3000",
   "--dump-dom",url
  ];
  const {stdout:dom}=await execFileAsync(chrome,args,{encoding:"utf8",timeout:30000,maxBuffer:10_000_000});
  const result=dom.match(/<html[^>]+data-layout="([^"]+)"/);
  const details=dom.match(/<pre id="result" hidden="">([^<]+)<\/pre>/);
  assert.equal(result?.[1],"PASS","Responsive layout failed at "+width+"x"+height+": "+(details?.[1]||dom.slice(-600)));
  console.log("PASS browser layout",width+"x"+height,details?.[1]||"");
 }
 const audioUrl="http://127.0.0.1:"+port+"/tests/audio-check.html";
 const child=spawn(chrome,[
  "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
  "--disable-background-timer-throttling","--disable-renderer-backgrounding",
  "--no-first-run","--user-data-dir=/tmp/premidi-audio-"+process.pid,
  audioUrl
 ],{stdio:"ignore"});
 try {
  const finished=await Promise.race([
   audioResult,
   new Promise((_,reject)=>setTimeout(()=>reject(Error("Browser audio rendering timed out")),60000)),
   new Promise((_,reject)=>child.on("error",reject))
  ]);
  assert.equal(finished?.status,"PASS","Synthesizer browser render failed: "+finished?.details);
  console.log("PASS original instrument WAV render",finished.details);
 } finally {child.kill("SIGKILL");}
}finally{server.close();}
