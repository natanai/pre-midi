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
function harness({experimental=true}={}){
 const calls=[],status={sampleRate:48000,generation:1,deviceLost:false};
 let owner=0,revision=0,ackSequence=0,fault=0,streamState=1,backpressureOnce=false;
 const localStorage=globalThis.localStorage,__TAURI__=globalThis.__TAURI__;
 globalThis.localStorage={getItem:key=>key==="premidi-native-song-streaming"?(experimental?"experimental":null):
  key==="premidi-audio-backend"?"native":null};
 globalThis.__TAURI__={core:{invoke:async(_,{request})=>{
  calls.push(request);
  switch(request.action){
   case "status":return {...status,owner,stream:{}};
   case "begin":return {owner:++owner};
   case "stream_begin":revision=request.revision;return {...status,owner};
   case "stream_delay":return {state:0};
   case "stream_page":
    if(backpressureOnce&&request.sequence===4&&ackSequence===1)
     return {accepted:false,stream:{ackSequence}};
    return {accepted:true,stream:{ackSequence}};
   case "stream_start":streamState=1;return {...status,owner};
   case "stream_status":return {...status,owner,stream:{
    state:streamState,fault,ackSequence,positionSeconds:ackSequence*8
   }};
   case "stream_stop":
    if(revision===0)throw Error("Native Song page owner or revision is stale");
    streamState=0;revision=0;return {...status,owner};
   case "control":
    if(request.command===1)revision=0;
    return {...status,owner};
   default:throw Error("Unexpected native action "+request.action);
  }
 }}};
 return {calls,setAck:value=>{ackSequence=value;},setFault:value=>{fault=value;},
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
  assert.equal(handle.diagnostics.liveEdits,false);
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
  assert.equal(mock.calls.filter(x=>x.action==="stream_stop").length,1);
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

test("unqualified stream seek/edit/loop/capture fail visibly instead of keeping stale audio",async()=>{
 const mock=harness();let handle,stops=0,revision=4;
 try{
  const song=songFixture(200);
  await assert.rejects(play(song,{loop:true}),/supports playback from the start/);
  await assert.rejects(play(song,{startStep:3}),/supports playback from the start/);
  await assert.rejects(play(song,{countIn:1}),/supports playback from the start/);
  await assert.rejects(play(song,{recording:1}),/supports playback from the start/);
  assert.equal(mock.calls.length,0,"Unsupported playback must fail before any device operation");
  handle=await play(song,{getRevision:()=>revision,onStop:()=>{stops++;}});
  await assert.rejects(handle.refresh(),/live editing is not yet qualified/);
  assert.equal(stops,1);
  assert.equal(mock.calls.at(-1).action,"stream_stop");
  const other=await play(song,{getRevision:()=>revision,onStop:()=>{stops++;}});
  handle=other;
  revision=5;
  await other.poll();
  assert.equal(stops,2,"Changing Song revision must stop the old stream");
 }finally{await handle?.stop();mock.cleanup();}
});

test("native page callback faults and dynamic loop changes stop the opt-in player",async()=>{
 const mock=harness();let handle,stops=0,loop=false;
 try{
  handle=await play(songFixture(180),{loop:()=>loop,onStop:()=>{stops++;}});
  mock.setFault(3);
  await handle.poll();
  assert.equal(stops,1);
  mock.setFault(0);
  handle=await play(songFixture(180),{loop:()=>loop,onStop:()=>{stops++;}});
  loop=true;
  await handle.poll();
  assert.equal(stops,2);
  assert.equal(mock.calls.filter(x=>x.action==="stream_stop").length,2);
 }finally{await handle?.stop();mock.cleanup();}
});

test("studio global native cancel followed by stream handle stop is idempotent",async()=>{
 const mock=harness();let handle,stops=0;
 try{
  handle=await play(songFixture(96),{onStop:()=>{stops++;}});
  await cancelNativeTransport();
  await assert.doesNotReject(handle.stop());
  assert.equal(stops,1);
  assert.equal(mock.calls.filter(x=>x.action==="control"&&x.command===1).length,1);
  assert.equal(mock.calls.filter(x=>x.action==="stream_stop").length,1);
 }finally{await handle?.stop();mock.cleanup();}
});

test("normal native Song playback remains bounded without explicit experimental opt-in",async()=>{
 const mock=harness({experimental:false});
 try{
  await assert.rejects(play(songFixture(6000),{loop:false}),/10-minute playback\/render limit/);
  assert.equal(mock.calls.length,0);
 }finally{mock.cleanup();}
});
