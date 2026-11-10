import {defaultReverb} from '../src/dsp/reverb.js';
import {withInstance,withParallelRoute,moveProcessor,withRouteShare} from '../src/dsp/processing-graph.js';
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
import {rebaseNativePlansToPage} from "../src/hosts/native/page-plan.js";
const root=fileURLToPath(new URL("../",import.meta.url));
const temp=await mkdtemp(join(tmpdir(),"premidi-device-stream-"));
const bin=join(temp,"device-stream-check");
try{
 execFileSync(process.env.CXX||"g++",[
  "-std=c++17","-O2","-ffp-contract=off","-Wall","-Wextra","-Werror",
  "-pedantic","-DPREMIDI_AUDIO_TEST",...(process.env.PREMIDI_NATIVE_SANITIZE?["-fsanitize=address","-fno-omit-frame-pointer","-g"]:[]),
  join(root,"native/stream-device-test.cpp"),
  join(root,"native/device-host.cpp"),"-pthread","-ldl","-lm","-o",bin
 ],{stdio:"pipe",timeout:90000,maxBuffer:1024*1024});
 const revisionBin=join(temp,"revision-check");
 execFileSync(process.env.CXX||"g++",["-std=c++17","-O2","-ffp-contract=off","-Wall","-Wextra","-Werror","-pedantic",join(root,"native/stream-revision-test.cpp"),"-o",revisionBin],{stdio:"pipe",timeout:90000,maxBuffer:1024*1024});
 // Sanitizer overhead is not a real-time performance measurement. Give its
 // physical-time null callbacks a larger lookahead while checking ownership.
 const rows=[],scale=process.env.PREMIDI_NATIVE_SANITIZE?4:1;
 for(const rate of (process.env.PREMIDI_STREAM_RATES?process.env.PREMIDI_STREAM_RATES.split(',').map(Number):[44100,48000,96000]))for(const graph of [false,true]){
  const frames=Math.round(rate*.55*scale),mark=[0,.090137,.180137,.270137,.360137,.55]
   .map(s=>Math.floor(s*rate*scale+1e-9));
  const patch=makePatch("touch-keys");
  patch.reverb={...defaultReverb(),mix:.35,decay:.2,preDelay:.015};
  patch.effects={...patch.effects,drive:.2,delayMix:.45,
   delayTime:.073137,delayFeedback:.6};
  patch.envelope={...patch.envelope,release:.20};
  patch.chain=withInstance(patch,"compressor");patch.chain.instances[0].parameters.threshold=-28;
  patch.chain=withInstance(patch,"deesser");Object.assign(patch.chain.instances[1].parameters,{frequency:1000,threshold:-40});
  patch.chain=withInstance(patch,'chorus');Object.assign(patch.chain.instances[2].parameters,{rate:3.7,phase:.27,feedback:-.5});
  patch.chain=withInstance(patch,'phaser');Object.assign(patch.chain.instances[3].parameters,{rate:2.3,depth:3,feedback:.6});
  if(graph){patch.chain=withInstance(patch,'filter');patch.chain.instances.find(instance=>instance.kind==='filter').parameters.cutoff=3200;patch.chain=withParallelRoute(patch);patch.chain=moveProcessor(patch.chain,'filter-1','route-1');patch.chain=withRouteShare(patch.chain,'dry',.4);}
  const tone=(pitch,start,duration)=>planSynthVoice({patch,volume:.12},
   {pitch,velocity:.8},start*scale,duration*scale,{automation:[{id:"pan",version:1,target:"pan",unit:"pan",interpolation:"linear",points:[{id:"a",step:0,value:-.4},{id:"b",step:4,value:.6}]}],timeline:{step:0,unit:.125*scale,limitStep:4}});
  const duration=Math.round(rate*.14),pcm=new Float32Array(duration*2);
  for(let i=0;i<duration;i++){
   pcm[2*i]=.22*Math.sin(2*Math.PI*345*i/rate);
   pcm[2*i+1]=.13*Math.cos(2*Math.PI*275*i/rate);
  }
  const asset={id:1,rate,channels:2,frames:duration,duration:duration/rate,normalization:2.6,pcm};
  const handles=new Map([["recorded",asset]]);
  const samplePatch={type:"sample",presetId:"stream-device",zones:[{assetId:"recorded",root:60}],
   followPitch:true,oneShot:true,transpose:0,gain:.8,attack:0,release:.025,pan:0};
  const sampleAt=start=>planNativeSample({patch:samplePatch,volume:.16},
   {pitch:60,velocity:.9},start*scale,.05*scale,handles);
  const parts=[
   [tone(62,.018,.34),tone(67,.102,.11)], // delayed strum: authored in page one
   [tone(73,.090137,.12),sampleAt(.131)],
   [tone(70,.212,.12)],
   [sampleAt(.303)],
   [tone(57,.402,.06)]
  ];
  const whole=parts.flat().sort((a,b)=>a.start-b.start),full=join(temp,"full-"+rate+".pms");
  await writeFile(full,encodeNativeSession(whole,rate,[asset]));
  const args=[rate,frames,full];
  for(let i=0;i<parts.length;i++){
   const segment=join(temp,"page-"+rate+"-"+i+".pms");
   await writeFile(segment,encodeNativeSession(
    rebaseNativePlansToPage(parts[i],mark[i],rate),rate,[asset]));
   args.push(mark[i],mark[i+1],parts[i].length,segment);
  }
  const revisionReport=JSON.parse(execFileSync(revisionBin,args.map(String),{encoding:"utf8",timeout:90000}));
  assert.ok(revisionReport.seekMaximumError<1e-7);
  const output=execFileSync(bin,args.map(String),{
   encoding:"utf8",timeout:90000,maxBuffer:65536
  });
  const report=JSON.parse(output);
  assert.equal(report.qualified,true);
  assert.equal(report.rate,rate);
  assert.equal(report.pages,5);
  assert.equal(report.published,5);
  assert.equal(report.callbackAllocations,0);
  assert.ok(report.callbacks>0&&report.peak>0);
  assert.ok(report.backpressure>=1,
   "The fourteenth native Song event must not overflow the three-slot page mailbox");
  rows.push({...report,processingGraph:graph,revisionMaximumError:revisionReport.seekMaximumError,seekLoopCountInCapture:true});
 }
 console.log("PASS miniaudio null-device dynamic Song streaming: "+JSON.stringify(rows));
}finally{
 await rm(temp,{recursive:true,force:true});
}
