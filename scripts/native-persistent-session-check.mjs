import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {makePatch} from "../synth.js";
import {planSynthVoice} from "../src/dsp/synth-voice.js";
import {planNativeSample} from "../src/hosts/native/sample-plan.js";
import {encodeNativeSession} from "../src/hosts/native/session.js";
import {nativeFrameAt,rebaseNativePlansToPage} from "../src/hosts/native/page-plan.js";
const root=fileURLToPath(new URL("../",import.meta.url));
const temp=await mkdtemp(join(tmpdir(),"premidi-persistent-pages-"));
const bin=join(temp,"native-stream-check");
try{
 execFileSync(process.env.CXX||"g++",[
  "-std=c++17","-O2","-ffp-contract=off","-Wall","-Wextra",
  "-Werror","-pedantic",join(root,"native/streaming-session-test.cpp"),
  "-pthread","-o",bin
 ],{stdio:"pipe",timeout:90000});
 const rows=[];
 for(const rate of [44100,48000,96000]){
  const frames=Math.round(1.1*rate),mid1=nativeFrameAt(.113,rate),
   mid2=nativeFrameAt(.261,rate);
  const keys=makePatch("touch-keys");
  keys.effects={...keys.effects,drive:0,delayMix:0};
  keys.envelope={...keys.envelope,release:.22};
  const long=planSynthVoice({patch:keys,volume:.14},
   {pitch:62,velocity:.8},.018,.61);
  const short=planSynthVoice({patch:keys,volume:.14},
   {pitch:70,velocity:.7},.305,.17);
  const count=Math.round(.16*rate),pcm=new Float32Array(count*2);
  for(let i=0;i<count;i++){
   pcm[2*i]=.22*Math.sin(2*Math.PI*321*i/rate);
   pcm[2*i+1]=.17*Math.cos(2*Math.PI*417*i/rate);
  }
  const asset={id:1,rate,channels:2,frames:count,duration:count/rate,normalization:2.6,pcm};
  const handles=new Map([["original",asset]]);
  const samplePatch={type:"sample",presetId:"stream-sample",zones:[{assetId:"original",root:60}],
   followPitch:true,oneShot:true,transpose:0,gain:.8,attack:0,release:.02,pan:0};
  const sampler={patch:samplePatch,volume:.16};
  const firstSample=planNativeSample(sampler,{pitch:60,velocity:.9},.159,.05,handles);
  const secondSample=planNativeSample(sampler,{pitch:63,velocity:.65},.413,.05,handles);
  const full=[long,firstSample,short,secondSample].sort((a,b)=>a.start-b.start);
  const fullPath=join(temp,"full-"+rate+".pms");
  await writeFile(fullPath,encodeNativeSession(full,rate,[asset]));
  const parts=[
   {begin:0,end:mid1,voices:[long]},
   {begin:mid1,end:mid2,voices:[firstSample]},
   {begin:mid2,end:frames,voices:[short,secondSample]}
  ];
  const args=[rate,frames,fullPath];
  for(let i=0;i<parts.length;i++){
   const part=parts[i];
   const local=rebaseNativePlansToPage(part.voices,part.begin,rate);
   const path=join(temp,"page-"+rate+"-"+i+".pms");
   await writeFile(path,encodeNativeSession(local,rate,[asset]));
   args.push(part.begin,part.end,part.voices.length,path);
  }
  const stdout=execFileSync(bin,args.map(String),{
   encoding:"utf8",timeout:90000,maxBuffer:65536
  });
  const report=JSON.parse(stdout);
  assert.equal(report.qualified,true);
  assert.equal(report.pages,3);
  assert.equal(report.newPageActivations,3);
  assert.equal(report.callbackAllocations,0);
  assert.equal(report.dynamicNativeNotes,full.length,
   "Only the page inputs may admit new C++ Voices");
  assert.ok(report.callbackSplits>=2);
  assert.ok(report.maxPcm<=1e-4);
  assert.ok(report.rmsPcm<=2e-5);
  rows.push({rate,...report});
 }
 console.log("PASS live native persistent Session multi-page note/sample ingestion: "+JSON.stringify(rows));
}finally{
 await rm(temp,{recursive:true,force:true});
}
