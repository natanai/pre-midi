import test from "node:test";
import assert from "node:assert/strict";
import {
 RECORDING_ALIGNMENT_KEY,MAX_RECORDING_ALIGNMENT_MS,
 recordingAlignmentMs,readRecordingAlignment,saveRecordingAlignment,browserRecordingLeadIn
} from "../recordingAlignment.js";
import {prepareSongTake} from "../songRecorder.js";

test("manual capture alignment uses one persisted, bounded preference",()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 assert.equal(MAX_RECORDING_ALIGNMENT_MS,500);
 assert.equal(readRecordingAlignment(storage),0);
 assert.equal(saveRecordingAlignment("40.05",storage),40.1);
 assert.equal(storage.getItem(RECORDING_ALIGNMENT_KEY),"40.1");
 assert.equal(readRecordingAlignment(storage),40.1);
 assert.equal(recordingAlignmentMs(0),0);
 assert.equal(recordingAlignmentMs(500),500);
 for(const invalid of [-.1,500.1,"invalid","Infinity",Infinity,NaN])
  assert.throws(()=>recordingAlignmentMs(invalid),/0 and 500/);
});
test("browser alignment corrects leading capture time without changing Song clock",()=>{
 assert.ok(Math.abs(browserRecordingLeadIn(.58,.5,35)-.115)<1e-10);
 assert.equal(browserRecordingLeadIn(3,4,0),0,"late calls cannot produce negative trim");
 assert.equal(browserRecordingLeadIn(3,4,120),.12);
 assert.throws(()=>browserRecordingLeadIn(NaN,4,0),/clock/);
});
test("MediaRecorder snapshots alignment before permission and preserves original audio bytes",async()=>{
 const globals=["navigator","MediaRecorder","localStorage","performance","__TAURI__"];
 const previous=Object.fromEntries(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const redefine=(name,value)=>Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
 let clock=0,stops=0,permission=0;
 const state=new Map([[RECORDING_ALIGNMENT_KEY,"75"]]);
 class TestRecorder{
  static isTypeSupported(){return true;}
  constructor(stream,options){this.state="inactive";this.mimeType=options.mimeType;}
  start(){this.state="recording";}
  stop(){
   this.state="inactive";
   this.ondataavailable?.({data:new Blob([new Uint8Array(64).fill(0x31)],{type:this.mimeType})});
   this.onstop?.();
  }
 }
 try{
  redefine("__TAURI__",undefined);
  redefine("localStorage",{getItem:key=>state.get(key)??null,setItem:(key,value)=>state.set(key,value)});
  redefine("navigator",{mediaDevices:{getUserMedia:async()=>{
   permission++;return {getTracks:()=>[{stop(){stops++;}}]};
  }}});
  redefine("MediaRecorder",TestRecorder);
  redefine("performance",{now:()=>clock});
  const take=await prepareSongTake();
  assert.equal(permission,1);
  // Mutating the setting after permission is granted cannot retime this take.
  state.set(RECORDING_ALIGNMENT_KEY,"200");
  take.begin({startTime:1.05,context:{currentTime:1},onLimit:()=>{}});
  clock=1000;
  const result=await take.finish();
  assert.ok(Math.abs(result.trimSeconds-.125)<1e-9);
  assert.equal(result.durationSeconds,1);
  assert.equal(result.bytes.length,64,"Recorded bytes remain unchanged");
  assert.equal(stops,1);
  const second=await prepareSongTake();
  second.begin({startTime:2.01,context:{currentTime:2},onLimit:()=>{}});
  clock=2000;
  assert.ok(Math.abs((await second.finish()).trimSeconds-.21)<1e-8);
  assert.equal(stops,2);
 }finally{
  for(const name of globals){
   const descriptor=previous[name];
   if(descriptor)Object.defineProperty(globalThis,name,descriptor);
   else delete globalThis[name];
  }
 }
});
