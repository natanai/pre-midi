// Browser interaction and real Web Audio checks, with no npm dependencies.
// CHROME_BIN may point at a local Chromium executable.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {spawn} from "node:child_process";
import {strict as assert} from "node:assert";
const root=resolve(new URL("..",import.meta.url).pathname),pending=new Map();
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost"),pathname=decodeURIComponent(url.pathname);
  if(pending.has(pathname)){
   pending.get(pathname)({status:url.searchParams.get("status"),details:url.searchParams.get("details")});
   res.end("OK");return;
  }
  const file=resolve(root,"."+pathname);
  if(!file.startsWith(root+"/"))throw Error("Invalid path");
  const content=await readFile(file);
  res.writeHead(200,{"Content-Type":({".js":"text/javascript",".css":"text/css",".html":"text/html",".ogg":"audio/ogg",".wav":"audio/wav"})[extname(file)]||"application/octet-stream"});
  res.end(content);
 }catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const port=server.address().port,chrome=process.env.CHROME_BIN||"google-chrome";
async function reportedTest(file,endpoint,width=1440,height=900,microphone=false){
 let report,timer;
 const result=new Promise(resolve=>{report=resolve;});pending.set(endpoint,report);
 const child=spawn(chrome,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
  "--autoplay-policy=no-user-gesture-required","--disable-background-timer-throttling","--disable-renderer-backgrounding",
  ...(microphone?["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]:[]),
  "--window-size="+width+","+height,"--no-first-run","--user-data-dir=/tmp/premidi-"+file+"-"+width+"-"+process.pid,
  "http://127.0.0.1:"+port+"/tests/"+file+".html"],{stdio:"ignore"});
 try{
  const finished=await Promise.race([result,
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(file+" timed out")),45000);}),
   new Promise((_,reject)=>{child.on("error",reject);child.on("exit",code=>reject(Error(file+" browser exited: "+code)));})]);
  assert.equal(finished?.status,"PASS",file+" at "+width+": "+finished?.details);
  console.log("PASS",file,width+"x"+height,finished.details);
 }finally{clearTimeout(timer);pending.delete(endpoint);child.kill("SIGKILL");}
}
try{
 for(const [width,height] of [[1440,900],[1024,800],[780,900],[390,844]]){
  await reportedTest("layout-check","/__layout_result",width,height);
  await reportedTest("rack-check","/__rack_result",width,height);
 }
 await reportedTest("rack-audio-check","/__rack_audio_result");
 await reportedTest("audio-check","/__audio_result");
 await reportedTest("recording.browser","/__recorder_result",1440,900,true);
}finally{server.close();}
