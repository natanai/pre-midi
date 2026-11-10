import test from "node:test";
import assert from "node:assert/strict";
import {create,upgradeBeatFeatures} from "../schema.js";
import {createSong} from "../songModel.js";
import {makePatch} from "../synth.js";
import {play,cancelNativeTransport} from "../audio.js";

function songFixture(length=6000){
 const beat=create(),instrument=beat.instruments[0],chunk=instrument.chunks[0];
 instrument.timeline[0]=chunk.id;
 instrument.sounds[0].patch=makePatch("touch-keys");
 chunk.notes=[{id:"song-stream-direct",pitch:60,start:0,duration:4,velocity:.8}];
 upgradeBeatFeatures(beat);
 const song=createSong(beat);
 song.tracks[0].clips[0].lengthSteps=length;
 return song;
}
async function responds(promise){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Transport intent waited for reconstruction')),1000);})]);}finally{clearTimeout(timer);}
}
function harness({experimental=true}={}){
 const calls=[],status={sampleRate:48000,generation:1,deviceLost:false};
 let owner=0,revision=0,ackSequence=0,fault=0,streamState=1,backpressureOnce=false;
 const revisions=new Map();let positionFrame=0,advanceGate=null;
 const localStorage=globalThis.localStorage,__TAURI__=globalThis.__TAURI__;
 globalThis.localStorage={getItem:key=>key==="premidi-native-song-streaming"?(experimental?"experimental":null):
  key==="premidi-audio-backend"?"native":null};
 globalThis.__TAURI__={core:{invoke:async(_,{request})=>{
  calls.push(request);
  switch(request.action){
   case "status":return {...status,owner,stream:{}};
   case "begin":return {owner:++owner};
   case "stream_begin":revisions.set(request.revision,{frame:0,ack:0});return {...status,owner};
   case "stream_effects":return {state:0};
   case "stream_page":
    if(backpressureOnce&&request.sequence===4&&ackSequence===1)
     return {accepted:false,stream:{ackSequence}};
    return {accepted:true,stream:{ackSequence}};
   case "stream_advance":{
    if(advanceGate){const gate=advanceGate;advanceGate=null;gate.enter();await gate.wait;}
    const entry=revisions.get(request.revision);entry.frame=request.frame;
    entry.ack=Math.max(1,calls.filter(r=>r.action==="stream_page"&&r.revision===request.revision&&r.start_frame<request.frame).length);
    return {...status,owner};
   }
   case "stream_start":revision=request.revision;positionFrame=revisions.get(revision).frame;ackSequence=revisions.get(revision).ack;streamState=request.hold?2:1;return {...status,owner};
   case "stream_status":return {...status,owner,stream:{
    state:streamState,fault,ackSequence,positionFrame,positionSeconds:positionFrame/48000
   }};
   case "stream_stop":
    if(revision===0)throw Error("Native Song page owner or revision is stale");
    if(request.revision===revision){streamState=0;revision=0;}revisions.delete(request.revision);return {...status,owner};
   case "control":
    if(request.command===1)revision=0;
    return {...status,owner};
   default:throw Error("Unexpected native action "+request.action);
  }
 }}};
 return {calls,holdAdvance:()=>{let enter,release;const entered=new Promise(resolve=>enter=resolve),wait=new Promise(resolve=>release=resolve);advanceGate={enter,wait};return {entered,release};},setAck:value=>{ackSequence=value;positionFrame=value*8*48000;},setFault:value=>{fault=value;},
  setState:value=>{streamState=value;},backpressure:()=>{backpressureOnce=true;},
  cleanup:()=>{if(localStorage===undefined)delete globalThis.localStorage;
   else globalThis.localStorage=localStorage;
   if(__TAURI__===undefined)delete globalThis.__TAURI__;
   else globalThis.__TAURI__=__TAURI__;}};
}

test("explicit native developer opt-in plays a long source-linked Song via Rust stream actions, never Web Audio",async()=>{
 const mock=harness(),song=songFixture(6000),source=JSON.stringify(song);
 let starts=0,stops=0,handle;
 try{
  handle=await play(song,{onStart:info=>{
   starts++;assert.equal(info.backend,"native-cpp");assert.equal(info.streaming,true);
  },onStop:()=>{stops++;}});
  assert.equal(starts,1);
  assert.equal(handle.diagnostics.streaming,true);
  assert.equal(handle.diagnostics.liveEdits,true);
  assert.ok(mock.calls.some(x=>x.action==="stream_begin"));
  const pages=mock.calls.filter(x=>x.action==="stream_page");
  assert.deepEqual(pages.map(x=>x.sequence),[1,2,3]);
  assert.equal(pages[0].start_frame,0);
  assert.ok(pages[1].end_frame>pages[0].end_frame);
  assert.ok(mock.calls.some(x=>x.action==="stream_start"));
  assert.ok(!mock.calls.some(x=>x.action==="play"),"Never route through bounded legacy Session");
  await handle.pause();assert.equal(handle.paused,true);
  await handle.resume();assert.equal(handle.paused,false);
  await handle.stop();assert.equal(stops,1);
  assert.equal(mock.calls.filter(x=>x.action==="control"&&x.command===1).length,1);
  assert.equal(JSON.stringify(song),source);
 }finally{await handle?.stop();mock.cleanup();}
});

test("real JS stream status ACK advances lookahead and preserves the pending packet across backpressure",async()=>{
 const mock=harness();mock.backpressure();
 let handle;
 try{
  handle=await play(songFixture(480),{});
  mock.setAck(1);
  await handle.poll();
  const first=mock.calls.filter(x=>x.action==="stream_page"&&x.sequence===4);
  assert.equal(first.length,1);
  mock.setAck(1);
  await handle.poll();
  assert.equal(mock.calls.filter(x=>x.action==="stream_page"&&x.sequence===4).length,1,
   "Do not spin a large payload into an unchanged callback ACK");
  mock.setAck(2);
  await handle.poll();
  const retry=mock.calls.filter(x=>x.action==="stream_page"&&x.sequence===4);
  assert.deepEqual(retry[0],retry[1]);
  assert.ok(mock.calls.some(x=>x.action==="stream_page"&&x.sequence===5));
 }finally{await handle?.stop();mock.cleanup();}
});

test("stream seek reconstructs source history and live edits replace a revision while retaining pause",async()=>{
 const mock=harness();let handle,revision=4,stops=0;
 try{
  const song=songFixture(200),original=JSON.stringify(song);
  handle=await play(song,{getRevision:()=>revision,onStop:()=>stops++});
  await handle.seek(80);
  const warm=mock.calls.filter(r=>r.action==='stream_advance');
  assert.equal(warm.at(-1).frame,80*.125*48000);
  assert.ok(warm.length>=2,'Reconstruct through multiple bounded pages');
  await handle.pause();
  const next=structuredClone(song);next.bpm=100;revision++;
  await handle.update(next);
  assert.equal(handle.paused,true);
  const promote=mock.calls.filter(r=>r.action==='stream_start').at(-1);
  assert.equal(promote.hold,true);assert.ok(promote.revision>1);
  assert.equal(stops,0);assert.equal(JSON.stringify(song),original);
  await handle.resume();await handle.stop();assert.equal(stops,1);
 }finally{await handle?.stop();mock.cleanup();}
});

test("stream count-in and synchronized recording reach the native start request",async()=>{
 const mock=harness();let handle;
 try{
  handle=await play(songFixture(400),{startStep:12,countIn:2,recording:9});
  const start=mock.calls.find(r=>r.action==='stream_start');
  assert.equal(start.count_in,2);assert.equal(start.recording,9);
  assert.equal(start.bpm,120);assert.ok(start.seconds>0);
  assert.equal(mock.calls.filter(r=>r.action==='stream_advance').at(-1).frame,12*.125*48000);
 }finally{await handle?.stop();mock.cleanup();}
});

test("native page callback faults stop playback; loop changes prepare a replacement",async()=>{
 const mock=harness();let handle,stops=0,loop=false;
 try{
  handle=await play(songFixture(180),{loop:()=>loop,onStop:()=>stops++});
  mock.setFault(3);await handle.poll();assert.equal(stops,1);
  mock.setFault(0);
  handle=await play(songFixture(180),{loop:()=>loop,onStop:()=>stops++});
  loop=true;await handle.poll();assert.equal(stops,1);
  const pages=mock.calls.filter(r=>r.action==='stream_page');
  assert.ok(pages.some(r=>r.revision===2&&!r.last));
  await handle.stop();assert.equal(stops,2);
 }finally{await handle?.stop();mock.cleanup();}
});

test("studio global native cancel followed by stream handle stop is idempotent",async()=>{
 const mock=harness();let handle,stops=0;
 try{
  handle=await play(songFixture(96),{onStop:()=>{stops++;}});
  await cancelNativeTransport();
  await assert.doesNotReject(handle.stop());
  assert.equal(stops,1);
  assert.equal(mock.calls.filter(x=>x.action==="control"&&x.command===1).length,2);
  assert.equal(mock.calls.filter(x=>x.action==="stream_stop").length,0);
 }finally{await handle?.stop();mock.cleanup();}
});

test("normal native Song playback remains bounded without explicit experimental opt-in",async()=>{
 const mock=harness({experimental:false});
 try{
  await assert.rejects(play(songFixture(6000),{loop:false}),/10-minute playback\/render limit/);
  assert.equal(mock.calls.length,0);
 }finally{mock.cleanup();}
});


test('old revision keeps feeding while a replacement is reconstructed, and newer edits cancel only the candidate',async()=>{
 const mock=harness();let handle,stops=0;
 try{
  const song=songFixture(400);handle=await play(song,{onStop:()=>stops++});mock.setAck(1);
  const gate=mock.holdAdvance(),changed=structuredClone(song);changed.title='first edit';
  const edit=handle.update(changed);const cancelled=assert.rejects(edit,/cancelled/);
  await gate.entered;await handle.poll();
  assert.ok(mock.calls.some(r=>r.action==='stream_page'&&r.revision===1&&r.sequence===4),'Old immutable revision can refill during preparation');
  const latest=structuredClone(song);latest.title='latest edit';const replacement=handle.update(latest);
  gate.release();await cancelled;await replacement;
  assert.equal(stops,0);assert.equal(mock.calls.filter(r=>r.action==='stream_start').at(-1).revision,3);
 }finally{await handle?.stop();mock.cleanup();}
});
test('stream pause/resume reaches the bridge during seek reconstruction and the published revision stays held',async()=>{
 const mock=harness();let handle,gate;
 try{
  handle=await play(songFixture(400),{});
  gate=mock.holdAdvance();const seek=handle.seek(80);await gate.entered;
  await responds(handle.pause());assert.equal(handle.paused,true);
  await handle.resume();assert.equal(handle.paused,false);
  await handle.pause();assert.equal(handle.paused,true);
  assert.deepEqual(mock.calls.filter(c=>c.action==='control').map(c=>c.command),[2,3,2]);
  gate.release();await seek;
  assert.equal(mock.calls.filter(c=>c.action==='stream_start').at(-1).hold,true);
 }finally{gate?.release();await handle?.stop();mock.cleanup();}
});
