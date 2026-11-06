// Standalone Chrome interaction test for the expandable Song arranger.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {spawn} from "node:child_process";
import {strict as assert} from "node:assert";
const root=resolve(new URL("..",import.meta.url).pathname);
let receive=null;
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,"http://localhost"),path=decodeURIComponent(url.pathname);
  if(path==="/__song_result"){
   receive?.({status:url.searchParams.get("status"),details:url.searchParams.get("details")});
   response.end("OK");return;
  }
  const file=resolve(root,"."+path);
  if(!file.startsWith(root+"/"))throw Error("Invalid path");
  let content=await readFile(file);
  if(path==="/index.html"){
   const script='<script>window.__testBootErrors=[];window.addEventListener("error",e=>window.__testBootErrors.push(String(e.message||e.error)));window.addEventListener("unhandledrejection",e=>window.__testBootErrors.push(String(e.reason)));<\\/script>';
   content=Buffer.from(content.toString("utf8").replace("</head>",script+"</head>"));
  }
  response.writeHead(200,{"Content-Type":({".js":"text/javascript",".css":"text/css",".html":"text/html",".wav":"audio/wav"})[extname(file)]||"application/octet-stream"});
  response.end(content);
 }catch{response.writeHead(404);response.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
try{
 for(const [suite,width,height] of [
 ...["song-check","freeform-check"].flatMap(suite=>
  [[1440,900],[780,900]].map(([width,height])=>[suite,width,height])),
 ["automation-freeform-check",1440,900],
 ["layering-freeform-check",1440,900]
]){
  const port=server.address().port,chrome=process.env.CHROME_BIN||"google-chrome";
  const result=new Promise(resolve=>{receive=resolve;});
  const child=spawn(chrome,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
   "--autoplay-policy=no-user-gesture-required","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",
   "--window-size="+width+","+height,
   "--no-first-run","--user-data-dir=/tmp/premidi-song-"+width+"-"+process.pid,
   "http://127.0.0.1:"+port+"/tests/"+suite+".html"],{stdio:"ignore"});
  let timer;
  try{
   const done=await Promise.race([result,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(suite+" browser test timed out")),
      suite==="automation-freeform-check"?180000:65000);}),
    new Promise((_,reject)=>{child.once("error",reject);child.once("exit",code=>reject(Error("Chrome exited "+code)));})]);
   assert.equal(done?.status,"PASS",done?.details);
   console.log("PASS "+suite,width+"x"+height,done.details);
  }finally{
   clearTimeout(timer);receive=null;child.kill("SIGKILL");
  }
 }
}finally{server.close();}
