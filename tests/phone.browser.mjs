// Browser DOM/touch-pointer fixture; NOT an iOS Safari device qualification.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {spawn} from "node:child_process";
import {strict as assert} from "node:assert";
const projectRoot=resolve(new URL("..",import.meta.url).pathname);
const appRoot=resolve(process.env.PREMIDI_APP_ROOT||projectRoot);
let received=null;
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,"http://localhost"),path=decodeURIComponent(url.pathname);
  if(path==="/__phone_result"){
   received?.({status:url.searchParams.get("status"),details:url.searchParams.get("details")});
   response.end("OK");return;
  }
  const file=path==="/tests/phone-check.html"
   ?resolve(projectRoot,"tests/phone-check.html"):resolve(appRoot,"."+path);
  if(!(file.startsWith(appRoot+"/")||file===resolve(projectRoot,"tests/phone-check.html")))throw Error("Invalid path");
  const content=await readFile(file);
  response.writeHead(200,{"Content-Type":({".js":"text/javascript",".css":"text/css",".html":"text/html",".png":"image/png",".webmanifest":"application/manifest+json",".svg":"image/svg+xml"})[extname(file)]||"application/octet-stream"});
  response.end(content);
 }catch{response.writeHead(404);response.end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
try{
 const port=server.address().port,chrome=process.env.CHROME_BIN||"google-chrome";
 const result=new Promise(resolve=>{received=resolve;});
 const child=spawn(chrome,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
  "--autoplay-policy=no-user-gesture-required","--window-size=420,900","--no-first-run",
  "--user-data-dir=/tmp/premidi-phone-"+process.pid,
  "http://127.0.0.1:"+port+"/tests/phone-check.html"],{stdio:"ignore"});
 let timer;
 try{
  const done=await Promise.race([result,
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Phone browser fixture timed out")),45000);}),
   new Promise((_,reject)=>{child.once("error",reject);child.once("exit",code=>reject(Error("Chrome exited "+code)));})]);
  assert.equal(done?.status,"PASS",done?.details);
  console.log("PASS phone composer in Chrome:",done.details);
 }finally{clearTimeout(timer);received=null;child.kill("SIGKILL");}
}finally{server.close();}
