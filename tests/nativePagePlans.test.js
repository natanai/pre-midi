import test from "node:test";
import assert from "node:assert/strict";
import {makePatch} from "../synth.js";
import {planSynthVoice} from "../src/dsp/synth-voice.js";
import {planNativeSample,planNativeVocal} from "../src/hosts/native/sample-plan.js";
import {encodeNativeSession} from "../src/hosts/native/session.js";
import {nativeFrameAt,rebaseNativePlanToPage,rebaseNativePlansToPage}
 from "../src/hosts/native/page-plan.js";

const synthetic=(at,duration=.25,automation=false)=>{
 const patch=makePatch("touch-keys");
 if(automation)patch.filter={...patch.filter,cutoff:1200,sweep:1,sweepTime:.18};
 return planSynthVoice({patch,volume:.5},
  {pitch:64,velocity:.9},at,duration,automation?{
   automation:{version:1,target:"filter.cutoff",unit:"hz",interpolation:"exponential",
    points:[{id:"a",step:0,value:300},{id:"b",step:3,value:6000}]},
   timeline:{step:0,unit:.125,limitStep:16}
  }:{});
};
const times=plan=>{
 const values=[plan.start,plan.off,plan.end,plan.graphEnd];
 if(plan.audibleEnd!==undefined)values.push(plan.audibleEnd);
 if(plan.contract==="pre-midi-synth-voice"){
  values.push(plan.filter.sweepEnd,plan.amplitude.end);
  values.push(...plan.amplitude.events.map(x=>x.time));
  values.push(...plan.oscillators.map(x=>x.pitch.start));
  values.push(...(plan.automation?.points??[]).map(x=>x.time));
 }else{
  values.push(...plan.events.map(x=>x.time),plan.pitch.start);
 }
 return values;
};

test("Song pages after ten minutes rebase every synth/automation time without frame drift",()=>{
 for(const rate of [44100,48000,96000]){
  for(const pageSeconds of [630,987.123,1500.5]){
   const frame=nativeFrameAt(pageSeconds,rate);
   const at=pageSeconds+0.034581;
   const original=synthetic(at,.23,true);
   const snapshot=JSON.stringify(original);
   const local=rebaseNativePlanToPage(original,frame,rate);
   assert.equal(JSON.stringify(original),snapshot,"Never rewrite authored Voice plans");
   const before=times(original),after=times(local);
   assert.equal(after.length,before.length);
   for(let i=0;i<before.length;i++)
    assert.equal(frame+nativeFrameAt(after[i],rate),nativeFrameAt(before[i],rate),
     "Native absolute frame differs for element "+i+" at "+rate+" Hz");
   assert.equal(local.duration,original.duration);
   assert.equal(local.patch,original.patch);
   assert.ok(local.start>=0&&local.start<1);
   const packet=encodeNativeSession([local],rate),view=new DataView(packet.buffer);
   assert.ok(packet.length>200&&view.getUint32(0,true)===0x31534d50);
   assert.ok(view.getFloat64(28,true)<1,"Page packet still includes an absolute >600s onset");
  }
 }
});

test("Sample and vocal page rebasing retains source offsets and absolute release frames",()=>{
 const rate=48000,base=875.713,start=base+.075,frame=nativeFrameAt(base,rate);
 const asset={id:1,rate,channels:2,frames:4800,duration:.1,normalization:2.6},assets=new Map([["recorded",asset]]);
 const patch={type:"sample",presetId:"test",zones:[{assetId:"recorded",root:60}],
  followPitch:true,oneShot:true,transpose:0,gain:.9,attack:0,release:.025,pan:0};
 const sample=planNativeSample({patch,volume:.2},{pitch:60,velocity:.8},start,.05,assets);
 const vocal=planNativeVocal({recording:{id:"recorded",durationSeconds:.1},
  clip:{lengthSteps:1,gain:.004}},start,.125,assets);
 for(const original of [sample,vocal]){
  const snapshot=JSON.stringify(original),local=rebaseNativePlanToPage(original,frame,rate);
  assert.equal(JSON.stringify(original),snapshot);
  assert.equal(local.asset,original.asset);
  assert.equal(local.offset,original.offset,"Rebasing must not change source-audio trim");
  assert.equal(local.playbackRate,original.playbackRate);
  assert.equal(local.duration,original.duration);
  assert.deepEqual(local.pitch.values,original.pitch.values);
  const before=times(original),after=times(local);
  for(let i=0;i<before.length;i++)
   assert.equal(frame+nativeFrameAt(after[i],rate),nativeFrameAt(before[i],rate));
  const packet=encodeNativeSession([local],rate);
  assert.ok(packet.length>50);
 }
});

test("Non-frame-aligned page origin never introduces a spurious negative first onset",()=>{
 const rate=44100,unit=60/123/4,step=4001,absolute=step*unit;
 const startFrame=nativeFrameAt(absolute,rate);
 const source=synthetic(absolute,.26);
 const local=rebaseNativePlanToPage(source,startFrame,rate);
 assert.equal(local.start,0);
 assert.equal(nativeFrameAt(local.start,rate)+startFrame,nativeFrameAt(absolute,rate));
 assert.ok(local.off>local.start);
 for(let i=0;i<times(source).length;i++)
  assert.equal(nativeFrameAt(times(local)[i],rate)+startFrame,
   nativeFrameAt(times(source)[i],rate));
});

test("Page voice transformations fail closed for stale, unsupported and overflowing inputs",()=>{
 const plan=synthetic(1200.1),rate=48000;
 assert.throws(()=>rebaseNativePlanToPage(plan,nativeFrameAt(1201,rate),rate),
  /preceding its source frame/);
 assert.throws(()=>rebaseNativePlanToPage(plan,0,rate),
  /starts beyond the bounded/);
 assert.throws(()=>rebaseNativePlanToPage(plan,-1,rate),/nonnegative safe integer/);
 assert.throws(()=>rebaseNativePlanToPage(plan,0,0),/sample rate/);
 assert.throws(()=>rebaseNativePlanToPage({contract:"other"},0,rate),/Unsupported native voice/);
 assert.throws(()=>rebaseNativePlansToPage(Array(4097).fill(plan),0,rate),/4096/);
});
