import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {makePatch} from "../synth.js";
import {planSynthVoice} from "../src/dsp/synth-voice.js";
import {planNativeSample,planNativeVocal} from "../src/hosts/native/sample-plan.js";
import {encodeNativeSession} from "../src/hosts/native/session.js";
import {nativeFrameAt,rebaseNativePlanToPage} from "../src/hosts/native/page-plan.js";

const root=fileURLToPath(new URL("../",import.meta.url));
const temp=await mkdtemp(join(tmpdir(),"premidi-page-relative-"));
const binary=join(temp,"page-relative-render");
try{
 execFileSync(process.env.CXX||"g++",[
  "-std=c++17","-O2","-ffp-contract=off","-Wall","-Wextra","-Werror","-pedantic",
  join(root,"native/session-render.cpp"),"-o",binary
 ],{stdio:"pipe",timeout:90000});
 const report=[];
 for(const rate of [44100,48000]){
  const seconds=.35,frames=Math.round(rate*seconds),base=937,offset=.045;
  const frame=nativeFrameAt(base,rate);
  const render=plans=>{
   const bytes=encodeNativeSession(plans,rate);
   return execFileSync(binary,[rate,1,0,0,frames,127,"none"],{
    input:Buffer.from(bytes),maxBuffer:frames*8+65536,timeout:90000,
    stdio:["pipe","pipe","pipe"]
   });
  };
  const compare=(name,actual,expected)=>{
   assert.equal(actual.length,expected.length,"Native PCM byte count mismatch");
   let max=0,rms=0;
   for(let i=0;i<actual.length;i+=4){
    const delta=actual.readFloatLE(i)-expected.readFloatLE(i);
    max=Math.max(max,Math.abs(delta));rms+=delta*delta;
   }
   rms=Math.sqrt(rms/(actual.length/4));
   assert.ok(max<=1e-4&&rms<=2e-5,
    name+" native PCM drift after rebasing: max "+max+", rms "+rms);
   report.push({name,rate,max,rms});
  };
  const patch=makePatch("touch-keys");
  patch.filter={...patch.filter,sweep:1,sweepTime:.18};
  const synthAt=at=>planSynthVoice({patch,volume:.4},
   {pitch:64,velocity:.8},at,.18);
  const early=synthAt(offset),late=synthAt(base+offset);
  let rejected=false;
  try{render([late]);}catch{rejected=true;}
  assert.ok(rejected,"Native C++ parser silently admitted an unrebased >600-second voice");
  compare("synth-filter-sweep",
   render([rebaseNativePlanToPage(late,frame,rate)]),
   render([early]));

  const count=3000,pcm=new Float32Array(count*2);
  for(let i=0;i<count;i++){
   pcm[2*i]=.24*Math.sin(2*Math.PI*440*i/rate);
   pcm[2*i+1]=.18*Math.cos(2*Math.PI*330*i/rate);
  }
  const asset={id:1,rate,channels:2,frames:count,pcm,
   duration:count/rate,normalization:2.6};
  const assets=new Map([["recording",asset]]);
  const samplePatch={type:"sample",presetId:"test",zones:[{assetId:"recording",root:60}],
   followPitch:true,oneShot:true,transpose:0,gain:.9,attack:0,release:.025,pan:0};
  const sampleAt=at=>planNativeSample({patch:samplePatch,volume:.2},
   {pitch:60,velocity:.8},at,.05,assets);
  const sampleEarly=sampleAt(offset),sampleLate=sampleAt(base+offset);
  // Inline assets use the same native PMS2 packet contract as device tests.
  const renderAsset=plan=>{
   const bytes=encodeNativeSession([plan],rate,[asset]);
   return execFileSync(binary,[rate,1,0,0,frames,127,"none"],{
    input:Buffer.from(bytes),maxBuffer:frames*8+65536,timeout:90000,
    stdio:["pipe","pipe","pipe"]
   });
  };
  compare("stereo-sample-source-offset",
   renderAsset(rebaseNativePlanToPage(sampleLate,frame,rate)),
   renderAsset(sampleEarly));

  const vocalAt=at=>planNativeVocal({
   recording:{id:"recording",trimSeconds:0,durationSeconds:asset.duration},
   clip:{lengthSteps:1,gain:.004}
  },at,.125,assets);
  compare("recorded-vocal-envelope",
   renderAsset(rebaseNativePlanToPage(vocalAt(base+offset),frame,rate)),
   renderAsset(vocalAt(offset)));
 }
 console.log("Native Song page-local PCM: "+JSON.stringify(report));
}finally{
 await rm(temp,{recursive:true,force:true});
}
