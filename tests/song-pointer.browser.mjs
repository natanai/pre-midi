// Real browser Pointer Events through CDP, including capture, hold and cancellation.
// This is test-only code; no dependency or browser protocol enters the studio build.
import {mkdtemp,readFile,rm,mkdir,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import assert from "node:assert/strict";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=12000){
 const end=Date.now()+timeout;
 while(Date.now()<end){const value=await read();if(value)return value;await pause(30);}
 throw Error("Timed out: "+label);
}
async function connect(url){
 const socket=new WebSocket(url),pending=new Map();let serial=0;
 await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
 socket.addEventListener("message",event=>{
  const message=JSON.parse(event.data),request=pending.get(message.id);
  if(!request)return;pending.delete(message.id);clearTimeout(request.timer);
  if(message.error)request.reject(Error(JSON.stringify(message.error)));else request.resolve(message.result);
 });
 return {close:()=>socket.close(),send(method,params={}){
  const id=++serial;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout: "+method));},15000);
   pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
 }};
}
export async function runSongPointerChecks({origin,chrome}){
 for(const width of [1440,780]){
  const profile=await mkdtemp(join(tmpdir(),"premidi-pointer-"));
  const child=spawn(chrome,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
   "--autoplay-policy=no-user-gesture-required","--no-first-run","--remote-debugging-port=0",
   "--window-size="+width+",900","--user-data-dir="+profile,origin+"/tests/song-pointer-check.html"],{stdio:"ignore"});
  let client;
  try{
   let launchError;child.once("error",error=>{launchError=error;});
   const port=await until(async()=>{
    if(launchError)throw launchError;
    try{return (await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0];}catch{return null;}
   },"Chrome debugger");
   const target=await until(async()=>{
    const tabs=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
    return tabs.find(tab=>tab.type==="page"&&tab.url.startsWith(origin));
   },"gesture fixture tab");
   client=await connect(target.webSocketDebuggerUrl);
   const evaluate=async expression=>{
    const result=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
   };
   const doc="document.getElementById('studio')?.contentDocument";
   const value=expr=>evaluate("(()=>{const d="+doc+";return "+expr+"})()");
   await until(()=>value("!!d?.querySelector('.song-beat-clip')&&!!d.querySelector('.instrument-card')"),"Song editor");
   const ids=await evaluate("({trackId:gestureFixture.trackId,otherTrackId:gestureFixture.otherTrackId,clipId:gestureFixture.clipId})");
   const clip=".song-beat-clip[data-clip-id='"+ids.clipId+"']";
   const own=".song-freeform-row[data-parent-track-id='"+ids.trackId+"']";
   const other=".song-freeform-row[data-parent-track-id='"+ids.otherTrackId+"']";
   const rect=selector=>value("(()=>{const e=d.querySelector("+JSON.stringify(selector)+");if(!e)throw Error('Missing '+"+JSON.stringify(selector)+");const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})()");
   const mouse=(type,x,y)=>client.send("Input.dispatchMouseEvent",{type,x,y,button:"left",buttons:type==="mouseReleased"?0:1,clickCount:1});
   const key=async key=>{
    await client.send("Input.dispatchKeyEvent",{type:"keyDown",key,code:key,windowsVirtualKeyCode:27});
    await client.send("Input.dispatchKeyEvent",{type:"keyUp",key,code:key,windowsVirtualKeyCode:27});
   };
   const read=()=>evaluate("gestureFixture.read()");
   const source=song=>song.tracks.find(t=>t.id===ids.trackId);
   const saved=async(predicate,label)=>until(async()=>{const song=await read();return predicate(song)&&song;},label);
   const songBar=()=>value("Number(d.querySelector('#song-ruler').getAttribute('aria-valuenow'))");
   const noHint=()=>value("!d.querySelector('.song-drop-hint:not([hidden])')&&!d.querySelector('.song-freeform-drop-preview:not([hidden])')");
   await evaluate(doc+".querySelector("+JSON.stringify(own+" .song-freeform-toggle")+").click()");
   // Click, direct marker dragging and cancellation all use the same bar grid.
   let ruler=await rect("#song-ruler");
   await mouse("mousePressed",ruler.x+105+2*54+10,ruler.cy);
   assert.equal(await songBar(),3,"Scrubber updates before release");
   await mouse("mouseMoved",ruler.x+105+6*54+10,ruler.cy);
   assert.equal(await songBar(),7,"Captured horizontal drag follows pointer");
   assert.equal(await value("d.querySelector('.freeform-ruler-ticks span').textContent"),"7","The freeform viewport follows the held Song scrubber");
   await mouse("mouseReleased",ruler.x+105+6*54+10,ruler.cy);
   assert.equal(await songBar(),7,"Release does not jump to the old click position");
   let cursor=await rect("#song-cursor");
   await mouse("mousePressed",cursor.cx,cursor.cy);
   await mouse("mouseMoved",cursor.cx+2*54,cursor.cy);
   assert.equal(await songBar(),9,"The marker itself is a draggable hit target");
   await mouse("mouseReleased",cursor.cx+2*54,cursor.cy);
   await mouse("mousePressed",ruler.x+105+10*54+10,ruler.cy);
   await key("Escape");
   await mouse("mouseReleased",ruler.x+105+10*54+10,ruler.cy);
   assert.equal(await songBar(),9,"Escape restores the prior Song start");
   assert.equal(await value("d.querySelector('#song-ruler').classList.contains('scrubbing')"),false);
   // Real Pointer Events cancellation also restores the original start.
   await client.send("Emulation.setTouchEmulationEnabled",{enabled:true});
   await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:ruler.x+105+9*54+10,y:ruler.cy}]});
   await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:ruler.x+105+10*54+10,y:ruler.cy}]});
   assert.equal(await songBar(),11,"Dragged scrubber can reach rendered bars beyond the last Clip");
   await client.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});
   assert.equal(await songBar(),9,"pointercancel restores the pre-drag Song start");
   await client.send("Emulation.setTouchEmulationEnabled",{enabled:false});
   // Scrolled coordinates and rendered empty bars remain seekable.
   const scroll=await rect("#song-scroll");
   await client.send("Input.dispatchMouseEvent",{type:"mouseWheel",x:scroll.cx,y:ruler.cy,deltaX:216,deltaY:0});
   await until(()=>value("d.querySelector('#song-scroll').scrollLeft>0"),"horizontal Song scroll");
   ruler=await rect("#song-ruler");
   const x=scroll.x+105+40,expected=Math.floor((x-ruler.x-105)/54)+1;
   await mouse("mousePressed",x,ruler.cy);await mouse("mouseReleased",x,ruler.cy);
   assert.equal(await songBar(),expected,"Scrub geometry includes horizontal scrolling");
   await client.send("Input.dispatchMouseEvent",{type:"mouseWheel",x:scroll.cx,y:ruler.cy,deltaX:-2000,deltaY:0});
   await until(()=>value("d.querySelector('#song-scroll').scrollLeft===0"),"restore scroll");
   // Hold is discoverable without a popup, vertical reflow or an edit.
   let box=await rect(clip),lane=await rect(own);
   await mouse("mousePressed",box.x+30,box.cy);await pause(230);
   assert.equal(await value("d.querySelector("+JSON.stringify(clip)+").classList.contains('pointer-held')"),true);
   assert.equal(await value("d.querySelector("+JSON.stringify(own)+").classList.contains('drop-available')"),true);
   assert.equal((await rect(own)).height,lane.height,"Hold never expands the dormant drop tab");
   assert.equal(await noHint(),true,"A hold alone never shows the drop popup");
   await mouse("mouseReleased",box.x+30,box.cy);
   assert.equal(await value("d.querySelector("+JSON.stringify(clip)+").getAttribute('aria-pressed')"),"true","A stationary hold still selects normally");
   // A normal lateral move stays quiet and commits once on release.
   box=await rect(clip);
   await mouse("mousePressed",box.x+30,box.cy);
   await mouse("mouseMoved",box.x+30+54,box.cy);
   assert.equal(await noHint(),true,"Horizontal dragging has no freeform popup or placement ghost");
   assert.equal(source(await read()).clips[0].startStep,16,"Preview never writes the model");
   await mouse("mouseReleased",box.x+30+54,box.cy);
   await saved(s=>source(s).clips[0].startStep===32,"horizontal move commit");
   // Resizing keeps its existing priority and never becomes a freeform drop.
   const grip=await rect(clip+" .song-clip-grip");
   await mouse("mousePressed",grip.cx,grip.cy);await mouse("mouseMoved",grip.cx+54,grip.cy);
   assert.equal(await noHint(),true,"End-grip resizing has no drop preview");
   await mouse("mouseReleased",grip.cx+54,grip.cy);
   await saved(s=>source(s).clips[0].lengthSteps===80,"Clip resize commit");
   // The drop preview gives the exact new bar; Escape removes it without editing.
   box=await rect(clip);lane=await rect(own);
   await mouse("mousePressed",box.x+30,box.cy);
   await mouse("mouseMoved",box.x+30+54,lane.cy);
   assert.match(await value("d.querySelector('.song-drop-hint').textContent"),/release to make freeform · bar 4/);
   assert.equal(await value("d.querySelector('.song-freeform-drop-preview').dataset.startStep"),"48");
   await key("Escape");await mouse("mouseReleased",box.x+30+54,lane.cy);
   assert.equal(source(await read()).clips[0].startStep,32);
   assert.equal(await value("d.querySelectorAll('.song-freeform-drop-preview,.song-drop-hint').length"),0);
   // A foreign attached lane is never a valid conversion destination.
   box=await rect(clip);const foreign=await rect(other);
   await mouse("mousePressed",box.x+30,box.cy);await mouse("mouseMoved",box.x+30,foreign.cy);
   assert.match(await value("d.querySelector('.song-drop-hint').textContent"),/attached freeform lane/);
   await mouse("mouseReleased",box.x+30,foreign.cy);
   assert.equal(source(await read()).clips[0].startStep,32,"Wrong-lane drop cancels cleanly");
   // Move + unpack is one transaction and agrees with its pre-release ghost.
   box=await rect(clip);lane=await rect(own);
   await mouse("mousePressed",box.x+30,box.cy);await mouse("mouseMoved",box.x+30+108,lane.cy);
   assert.equal(await value("d.querySelector('.song-freeform-drop-preview').dataset.startStep"),"64");
   assert.equal(source(await read()).clips[0].startStep,32);
   if(process.env.PREMIDI_POINTER_SCREENSHOTS==="1"){
    const output=new URL("../desktop/test-results/",import.meta.url);
    await mkdir(output,{recursive:true});
    const screenshot=await client.send("Page.captureScreenshot",{format:"png"});
    await writeFile(new URL("song-drop-preview-"+width+".png",output),Buffer.from(screenshot.data,"base64"));
   }
   await mouse("mouseReleased",box.x+30+108,lane.cy);
   const converted=await saved(s=>source(s).clips.length===0,"freeform drop commit");
   assert.equal(source(converted).freeform.passages[0].startStep,64);
   assert.equal(source(converted).freeform.instruments[0].notes[0].start,66,"Converted notes match the previewed horizontal position");
   assert.equal(converted.beats[0].instruments[0].chunks[0].notes[0].start,2,"The source Beat stays reusable");
   assert.equal(await value("d.querySelectorAll('.song-freeform-drop-preview,.song-drop-hint').length"),0);
   await evaluate(doc+".getElementById('freeform-undo').click()");
   const undone=await saved(s=>source(s).clips.length===1,"undo conversion");
   assert.equal(source(undone).clips[0].startStep,32,"One undo restores the pre-drag start");
   assert.equal(source(undone).clips[0].lengthSteps,80);
   await evaluate(doc+".getElementById('redo').click()");
   await saved(s=>source(s).freeform?.passages[0]?.startStep===64,"redo conversion");
   console.log("PASS song-pointer-check",width+"x900","real scrubber/hold/move/resize/drop/cancel and atomic undo");
  }finally{
   client?.close();child.kill("SIGKILL");
   await new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once("exit",resolve));
   await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
 }
}
