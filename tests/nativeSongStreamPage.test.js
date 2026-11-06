import test from "node:test";
import assert from "node:assert/strict";
import {create,upgradeBeatFeatures} from "../schema.js";
import {createSong} from "../songModel.js";
import {makePatch} from "../synth.js";
import {renderEventsInWindow} from "../audio.js";
import {nativePageDescriptorCursor} from "../src/hosts/native/onset-pages.js";
import {nativeFrameAt} from "../src/hosts/native/page-plan.js";
import {
 nativeSongDelayRecipes,prepareNativeSongStreamPage,createNativeSongPagePublisher
} from "../src/hosts/native/song-stream-page.js";

function fixture(length=96){
 const beat=create(),instrument=beat.instruments[0],chunk=instrument.chunks[0];
 instrument.timeline[0]=chunk.id;
 chunk.notes=[
  {id:"stream-note-one",pitch:64,start:0,duration:19,velocity:.7},
  {id:"stream-note-two",pitch:67,start:3,duration:2,velocity:.6}
 ];
 instrument.sounds[0].patch=makePatch("touch-keys");
 upgradeBeatFeatures(beat);
 const song=createSong(beat);
 song.tracks[0].clips[0].lengthSteps=length;
 return song;
}
const renderWindow=(song,start,end,options)=>renderEventsInWindow(song,start,end,options);
const emptyAssets=async ids=>{
 assert.equal(ids.size,0);
 return new Map();
};

test("late native Song packets are frame-relative and never change the authored source",async()=>{
 const song=fixture(9000),source=JSON.stringify(song),rate=44100;
 const startStep=6144,revision=7;
 const cursor=nativePageDescriptorCursor(song,{
  owner:23,revision,sampleRate:rate,startStep,maxSteps:128,maxOnsets:128,
  getRevision:()=>revision
 });
 const page=cursor.next();
 assert.ok(page.onsetCount>0);
 assert.ok(page.descriptor.startFrame>rate*600);
 const actual=await prepareNativeSongStreamPage(song,page,{
  sampleRate:rate,info:{sampleRate:rate,generation:1},
  renderWindow,loadAssets:emptyAssets,getRevision:()=>revision
 });
 assert.equal(actual.events,page.onsetCount);
 assert.equal(actual.descriptor.prepared,false);
 assert.equal(actual.descriptor.resources,0);
 assert.equal(actual.packet[0],0x50);
 assert.equal(new DataView(actual.packet.buffer).getUint32(4,true),page.onsetCount);
 assert.equal(nativeFrameAt(startStep*60/song.bpm/4,rate),page.descriptor.startFrame);
 assert.equal(JSON.stringify(song),source);
});

test("native shared Song delay catalog preserves the exact synth and vocal packet precision",()=>{
 const song=fixture(48),patch=song.beats[0].instruments[0].sounds[0].patch;
 patch.effects={...patch.effects,delayMix:.35,delayTime:.073137,delayFeedback:.31};
 song.tracks.push({kind:"vocal",clips:[{effects:{
  delayMix:.55,delayTime:.127137,delayFeedback:.41
 }}]});
 const actual=nativeSongDelayRecipes(song);
 assert.deepEqual(actual,[
  {mix:.35,time:Math.fround(.073137),feedback:Math.fround(.31)},
  {mix:.55,time:.127137,feedback:.41}
 ]);
 assert.notEqual(actual[0].time,actual[1].time);
 const original=JSON.stringify(song);
 const second=song.beats[0].instruments[0].sounds[0];
 song.beats[0].instruments[0].sounds=Array.from({length:34},(_,i)=>({
  ...second,id:"duplicate-"+i,patch:{
   ...second.patch,effects:{...second.patch.effects,delayMix:.5,delayTime:.05+i*.01}
  }
 }));
 assert.throws(()=>nativeSongDelayRecipes(song),/32 shared delay-bus/);
 assert.notEqual(JSON.stringify(song),original);
});

test("JS native Song publisher retries backpressure without advancing the authored page",async()=>{
 const song=fixture(80),snapshot=JSON.stringify(song),calls=[];
 let stalled=false;
 const publisher=createNativeSongPagePublisher(song,{
  owner:11,revision:3,sampleRate:48000,
  info:{sampleRate:48000,generation:1},renderWindow,loadAssets:emptyAssets,
  maxSteps:16,maxOnsets:32,
  request:async request=>{
   assert.equal(request.action,"stream_page");
   calls.push(request);
   if(request.sequence===2&&!stalled){
    stalled=true;return {accepted:false,stream:{ackSequence:0}};
   }
   return {accepted:true,stream:{ackSequence:request.sequence-1}};
  }
 });
 const visited=[];
 for(let i=0;i<12&&!publisher.finished;i++){
  const value=await publisher.publishNext();
  visited.push(value);
 }
 assert.equal(publisher.finished,true);
 assert.deepEqual(calls.map(x=>x.sequence),[1,2,2,3,4,5]);
 assert.deepEqual(calls[1],calls[2],"Backpressure retries exactly the same packet and frame interval");
 assert.ok(visited[1].backpressure);
 assert.equal(publisher.acceptedSequence,5);
 assert.equal(JSON.stringify(song),snapshot);
 assert.deepEqual(await publisher.publishNext(),{accepted:false,finished:true});
});

test("native Song publication fails closed on revisions, missing assets and malformed acknowledgments",async()=>{
 const song=fixture(48);
 let revision=5,requests=0;
 const publisher=createNativeSongPagePublisher(song,{
  owner:20,revision,sampleRate:44100,info:{sampleRate:44100,generation:1},
  renderWindow,loadAssets:emptyAssets,maxSteps:16,
  getRevision:()=>revision,
  request:async request=>{requests++;return {accepted:true};}
 });
 assert.equal((await publisher.publishNext()).sequence,1);
 revision++;
 await assert.rejects(publisher.publishNext(),/changed during page preparation/);
 assert.equal(requests,1);
 await assert.rejects(publisher.publishNext(),/changed during page preparation/);
 const missing=createNativeSongPagePublisher(song,{
  owner:20,revision:10,sampleRate:44100,info:{sampleRate:44100,generation:1},
  renderWindow,loadAssets:async()=>{throw Error("Audio asset could not be decoded");},
  request:async()=>{requests++;return {accepted:true};}
 });
 await assert.rejects(missing.publishNext(),/Audio asset could not be decoded/);
 await assert.rejects(missing.publishNext(),/Audio asset could not be decoded/);
 assert.equal(requests,1,"An unprepared page must never reach native transport");
 const malformed=createNativeSongPagePublisher(song,{
  owner:21,revision:12,sampleRate:44100,info:{sampleRate:44100,generation:1},
  renderWindow,loadAssets:emptyAssets,
  request:async()=>({ackSequence:1})
 });
 await assert.rejects(malformed.publishNext(),/no publication acknowledgment/);
 await assert.rejects(malformed.publishNext(),/no publication acknowledgment/);
});

test("stale revisions after asynchronous asset preparation cannot publish a packet",async()=>{
 const song=fixture(32);
 let revision=1,requests=0;
 const publisher=createNativeSongPagePublisher(song,{
  owner:9,revision,sampleRate:48000,info:{sampleRate:48000,generation:1},
  renderWindow,getRevision:()=>revision,
  loadAssets:async()=>{revision=2;return new Map();},
  request:async()=>{requests++;return {accepted:true};}
 });
 await assert.rejects(publisher.publishNext(),/changed during page preparation/);
 assert.equal(requests,0);
});
