import test from "node:test";
import assert from "node:assert/strict";
import {VocalSeekCache,vocalSeekEvents,prepareVocalSeek,scheduleVocalSeek} from "../src/hosts/web/vocal-seek.js";
import {VoiceSession} from "../src/hosts/web/voice-session.js";
import {vocalPlaybackSignature} from "../src/hosts/web/vocal-live-edit.js";

const buffer={duration:2,length:2000,numberOfChannels:1,sampleRate:1000};
const fixture=()=>({kind:"song",bpm:120,recordings:[{id:"r",name:"take",durationSeconds:2,trimSeconds:0}],tracks:[
 {id:"t",kind:"vocal",clips:[{id:"c",recordingId:"r",startStep:2,lengthSteps:16,gain:1,
  effects:{filter:{type:"lowpass",cutoff:1400,resonance:.7},delayMix:.5,delayTime:.2,delayFeedback:.3}}]}
]});
const request=()=>({...vocalSeekEvents(fixture(),6,new Map([["r",buffer]]))[0],sampleRate:48000,phase:0});
test("effectful seeks include a finished vocal's echo but exclude future and exhausted audio",()=>{
 const song=fixture(),decoded=new Map([["r",buffer]]);
 assert.equal(vocalSeekEvents(song,2,decoded).length,0);
 const echoes=vocalSeekEvents(song,19,decoded);
 assert.equal(echoes.length,1);assert.ok(echoes[0].elapsed>echoes[0].range.duration);
 assert.equal(vocalSeekEvents(song,100,decoded).length,0);
 song.tracks[0].clips[0].effects={};
 assert.equal(vocalSeekEvents(song,6,decoded).length,0);
});
test("continuation cache shares in-flight work, invalidates audible edits and bounds retained audio",async()=>{
 let renders=0,active=0,peak=0;
 const cache=new VocalSeekCache({maxBytes:16000,maxEntries:2,render:async entry=>{
  renders++;peak=Math.max(peak,++active);await Promise.resolve();active--;
  return {buffer,phase:entry.phase,duration:entry.range.duration,tail:entry.tail};
 }});
 const a=request(),one=cache.get(a),same=cache.get(a);
 assert.equal(one,same);await Promise.all([one,same]);assert.equal(renders,1);
 const renamed=structuredClone(a);renamed.buffer=buffer;renamed.event.recording.name="another name";
 await cache.get(renamed);assert.equal(renders,1);
 const changed=structuredClone(a);changed.buffer=buffer;changed.event.clip.gain=.4;
 await Promise.all([cache.get(changed),cache.get({...a,phase:1/48000})]);
 assert.equal(renders,3);assert.equal(peak,1);assert.ok(cache.bytes<=16000);assert.equal(cache.entries.size,2);
 await cache.get(a);assert.equal(renders,4,"Evicted audio is reconstructed from the editable source");
});
test("a cancelled seek never publishes its completed continuation",async()=>{
 let finish,current=true;
 const seekCache=new VocalSeekCache({render:()=>new Promise(resolve=>{finish=resolve;})});
 const pending=prepareVocalSeek(fixture(),6,new Map([["r",buffer]]),48000,{seekCache,isCurrent:()=>current});
 await Promise.resolve();current=false;finish({buffer,phase:0,duration:2,tail:1});
 await assert.rejects(pending,/cancelled/);
});
function context(){
 const param=()=>({value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}});
 const node=()=>({gain:param(),connect(){},disconnect(){},start(...args){this.started=args;},stop(){}});
 return {currentTime:0,sampleRate:1000,createGain:node,createDelay:()=>({...node(),delayTime:param()}),
  createBuffer:()=>({}),createBufferSource:node};
}
test("seek echoes do not occupy voice slots and vocal replacement preserves Beat echoes",()=>{
 const ctx=context(),session=new VoiceSession(ctx,{}, {maxVoices:1});
 const wet=scheduleVocalSeek(ctx,{}, {buffer,phase:0,elapsed:1.1,duration:1,clipId:"c"},.1,session);
 assert.equal(session.allocator.records.length,0);assert.ok(session.history.has(wet));
 const active=scheduleVocalSeek(ctx,{}, {buffer,phase:0,elapsed:.5,duration:1,clipId:"d"},.1,session);
 assert.equal(session.allocator.records.length,1);assert.ok(Math.abs(session.allocator.records[0].end-.6)<1e-12);
 const effects={delayMix:.3,delayTime:.2,delayFeedback:.3};
 const beatVoice={end:3,cancelled:false},vocalVoice={end:3,cancelled:false,vocalClipId:"v"};
 const beat=session.delay(effects,beatVoice),vocal=session.delay(effects,vocalVoice);
 assert.notEqual(beat,vocal);session.replaceVocalVoices(.3);
 assert.equal(session.buses.size,1);assert.equal([...session.buses.values()][0].input,beat);
 assert.ok(active.end<.31&&wet.end<.31);assert.equal(session.allocator.records[0].end,.3);
});
test("live vocal edits track audible data without restarting playback for a rename",()=>{
 const song=fixture(),signature=vocalPlaybackSignature(song);
 song.recordings[0].name="renamed";assert.equal(vocalPlaybackSignature(song),signature);
 song.tracks[0].clips[0].effects.filter.sweep=-2;
 assert.notEqual(vocalPlaybackSignature(song),signature);
});
