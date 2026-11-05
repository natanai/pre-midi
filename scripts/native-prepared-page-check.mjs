import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {makePatch} from "../synth.js";
import {planSynthVoice} from "../src/dsp/synth-voice.js";
import {planNativeSample,planNativeVocal} from "../src/hosts/native/sample-plan.js";
import {encodeNativeSession} from "../src/hosts/native/session.js";

const root=fileURLToPath(new URL("../",import.meta.url));
const temp=await mkdtemp(join(tmpdir(),"premidi-prepared-page-"));
const binary=join(temp,"prepared-page-check");
try{
 execFileSync(process.env.CXX||"g++",[
  "-std=c++17","-O2","-ffp-contract=off","-Wall","-Wextra","-Werror","-pedantic",
  join(root,"native/prepared-page-test.cpp"),"-pthread","-o",binary
 ],{stdio:"pipe",timeout:90000});
 const rate=48000,start=.025,assets=[];
 const synthPatch=makePatch("touch-keys");
 synthPatch.effects={...synthPatch.effects,
  drive:.4,delayMix:.55,delayTime:.073137,delayFeedback:.6};
 const synth=planSynthVoice({patch:synthPatch,volume:.2},
  {pitch:64,velocity:.9},start,.32);
 const frames=4800,pcm=new Float32Array(frames*2);
 for(let frame=0;frame<frames;frame++){
  pcm[2*frame]=.25*Math.sin(2*Math.PI*440*frame/rate);
  pcm[2*frame+1]=.125*Math.cos(2*Math.PI*330*frame/rate);
 }
 const asset={id:1,rate,channels:2,frames,duration:frames/rate,normalization:2.6,pcm};
 assets.push(asset);
 const handles=new Map([["recorded",asset]]);
 const samplePatch={type:"sample",presetId:"test",
  zones:[{assetId:"recorded",root:60}],followPitch:true,oneShot:true,
  transpose:0,gain:.9,attack:0,release:.025,pan:0};
 const sample=planNativeSample({patch:samplePatch,volume:.25},
  {pitch:60,velocity:.85},start,.05,handles);
 const vocal=planNativeVocal({
  recording:{id:"recorded",trimSeconds:0,durationSeconds:.1},
  clip:{lengthSteps:1,gain:.004}
 },start,.125,handles);
 const results=[];
 for(const [kind,plan,inline] of [
  ["synth",synth,null],["sample",sample,assets],["vocal",vocal,assets]
 ]){
  assert.ok(plan,"Native page test requires a fully prepared "+kind+" plan");
  const file=join(temp,kind+".pms");
  await writeFile(file,encodeNativeSession([plan],rate,inline));
  const output=execFileSync(binary,[file,rate,kind],{
   encoding:"utf8",timeout:90000,maxBuffer:65536
  });
  const result=JSON.parse(output);
  assert.equal(result.kind,kind);
  assert.equal(result.onsets,1);
  assert.ok(result.resources>=1,"C++ must validate at least one real resource");
  assert.equal(result.callbackAllocations,0);
  assert.ok(result.retainedUntil>=result.tailFrame,
   "Control-side resource retention cannot end before page metadata");
  if(kind==="synth")assert.ok(result.retainedUntil>result.tailFrame,
   "Synth and feedback-tail resources must outlive the page");
  results.push(result);
 }
 console.log("Native prepared Song page resource leases: "+JSON.stringify(results));
}finally{
 await rm(temp,{recursive:true,force:true});
}
