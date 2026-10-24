// Runs without npm dependencies using the Chrome preinstalled on GitHub Actions runners.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";

const root=resolve(new URL("..",import.meta.url).pathname);
const server=createServer(async (req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
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
  const dom=execFileSync(chrome,args,{encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]});
  const result=dom.match(/<html[^>]+data-layout="([^"]+)"/);
  const details=dom.match(/<pre id="result" hidden="">([^<]+)<\/pre>/);
  assert.equal(result?.[1],"PASS","Responsive layout failed at "+width+"x"+height+": "+(details?.[1]||dom.slice(-600)));
  console.log("PASS browser layout",width+"x"+height,details?.[1]||"");
 }
}finally{server.close();}
