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
  const content=await readFile(file);
  response.writeHead(200,{"Content-Type":({".js":"text/javascript",".css":"text/css",".html":"text/html",".wav":"audio/wav"})[extname(file)]||"application/octet-stream"});
  response.end(content);
 }catch{response.writeHead(404);response.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
try{
 for(const [width,height] of [[1440,900],[390,844]]){
  const port=server.address().port,chrome=process.env.CHROME_BIN||"google-chrome";
  const result=new Promise(resolve=>{receive=resolve;});
  const child=spawn(chrome,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
   "--autoplay-policy=no-user-gesture-required","--window-size="+width+","+height,
   "--no-first-run","--user-data-dir=/tmp/premidi-song-"+width+"-"+process.pid,
   "http://127.0.0.1:"+port+"/tests/song-check.html"],{stdio:"ignore"});
  let timer;
  try{
   const done=await Promise.race([result,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Song browser test timed out")),45000);}),
    new Promise((_,reject)=>{child.once("error",reject);child.once("exit",code=>reject(Error("Chrome exited "+code)));})]);
   assert.equal(done?.status,"PASS",done?.details);
   console.log("PASS Song UI",width+"x"+height,done.details);
  }finally{
   clearTimeout(timer);receive=null;child.kill("SIGKILL");
  }
 }
}finally{server.close();}
