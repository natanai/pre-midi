import {modulationFixtures} from "./modulation-fixtures.js";
import {scheduleNote,scheduleSynthPlan,play,audition} from "../../audio.js";
import {planSynthVoice} from "../../src/dsp/synth-voice.js";
import {delayTailSeconds} from "../../src/dsp/effect-tail.js";
import {VoiceSession} from "../../src/hosts/web/voice-session.js";
import {scheduleSample} from "../../sampler.js";
import {scheduleVocal} from "../../songAudio.js";
import {makePatch} from "../../synth.js";
import {create} from "../../schema.js";
import {signalStats,difference} from "./metrics.js";
import {cleanPatch} from "./fixtures.js";
const context=(seconds=1)=>new OfflineAudioContext(1,Math.ceil(seconds*48000),48000);
const wait=ms=>new Promise(done=>setTimeout(done,ms));
export async function runVoiceBenchmark(){
 const results=[],failures=[];
 const add=(id,metrics,checks)=>{
  const failed=Object.keys(checks).filter(key=>!checks[key]);
  failures.push(...failed.map(check=>({id,check})));results.push({id,metrics,checks,status:failed.length?"fail":"pass"});
 };
 // Shared linear buses must preserve the original per-voice delay sound.
 for(const preset of ["glass-keys","neon-lead","glass-portamento","harmonic-keys"]){
  const render=async shared=>{
   const ctx=context(2),session=shared?new VoiceSession(ctx,ctx.destination):null;
   for(let i=0;i<4;i++)scheduleNote(ctx,ctx.destination,{patch:makePatch(preset),volume:.2},
    {pitch:57+i*4,velocity:.8},i*.1,.35,null,session);
   return {pcm:(await ctx.startRendering()).getChannelData(0),busCount:session?.buses.size??0};
  };
  const independent=await render(false),shared=await render(true),error=difference(independent.pcm,shared.pcm);
  add("shared-delay/"+preset,error,{compatible:error.max<.000002});
 }
 {
  const patch=makePatch("glass-portamento"),instrument={patch,volume:.3},note={pitch:69,velocity:.8};
  const plan=JSON.parse(JSON.stringify(planSynthVoice(instrument,note,.01,.5)));
  const first=context(1),second=context(1);
  scheduleNote(first,first.destination,instrument,note,.01,.5,null);
  scheduleSynthPlan(second,second.destination,plan);
  const a=await first.startRendering(),b=await second.startRendering(),error=difference(a.getChannelData(0),b.getChannelData(0));
  add("contract/serialized-voice-replay",error,{identical:error.max<.0000001});
 }
 // Voice stealing fades the dry source while preserving already-sent echoes.
 {
  const ctx=context(1.5),patch=cleanPatch(),session=new VoiceSession(ctx,ctx.destination,{maxVoices:1});
  patch.effects={drive:0,delayMix:.8,delayTime:.3,delayFeedback:.5};
  scheduleNote(ctx,ctx.destination,{patch,volume:.5},{pitch:69,velocity:1},0,1,null,session);
  const silent=cleanPatch();silent.oscillators[0].level=0;
  scheduleNote(ctx,ctx.destination,{patch:silent,volume:0},{pitch:69,velocity:0},.1,.1,null,session);
  const data=(await ctx.startRendering()).getChannelData(0);
  const dry=signalStats(data.subarray(.15*48000,.25*48000)).rms;
  const echo=signalStats(data.subarray(.32*48000,.38*48000)).rms;
  add("steal/retains-echo",{dry,echo,steals:session.steals},{dryStops:dry<.000002,echoSurvives:echo>.001,stolen:session.steals===1});
 }
 // Stop cancels future starts, terminates current sources and releases their graph.
 for(const future of [false,true]){
  const ctx=context(.8),session=new VoiceSession(ctx,ctx.destination),patch=makePatch("glass-portamento");
  const voice=scheduleNote(ctx,ctx.destination,{patch,volume:.5},{pitch:69,velocity:1},future?.5:0,1,null,session);
  session.stop(.2);const data=(await ctx.startRendering()).getChannelData(0);
  const tail=signalStats(data.subarray(.25*48000)).rms;
  add("stop/"+(future?"queued":"active"),{tail,disposed:voice.disposed,remaining:session.voices.size,buses:session.buses.size},
   {silence:tail<.000002,disposed:voice.disposed,empty:session.voices.size===0&&session.buses.size===0});
 }
 // Sample and vocal cancellation uses the same ownership path as the synth.
 for(const type of ["sample","vocal"]){
  const ctx=context(.8),buffer=ctx.createBuffer(1,48000,48000);buffer.getChannelData(0).fill(.2);
  const session=new VoiceSession(ctx,ctx.destination);let voice;
  if(type==="vocal")voice=scheduleVocal(ctx,ctx.destination,{recording:{id:"audio",trimSeconds:0,durationSeconds:1},clip:{lengthSteps:16,gain:1}},0,.125,new Map([["audio",buffer]]),{session});
  else voice=scheduleSample(ctx,ctx.destination,{volume:1,patch:{type:"sample",zones:[{assetId:"audio",root:69}],followPitch:true,transpose:0,gain:1,attack:.01,release:.1,pan:0}},
   {pitch:69,velocity:1},0,1,null,new Map([["audio",buffer]]),session);
  session.stop(.2);const data=(await ctx.startRendering()).getChannelData(0),tail=signalStats(data.subarray(.25*48000)).rms;
  add("stop/"+type,{tail,disposed:voice.disposed},{silence:tail<.000002,disposed:voice.disposed});
 }
 // Priority protection must also reject/dispose an incoming already-built graph.
 {
  const ctx=context(1.2),session=new VoiceSession(ctx,ctx.destination,{maxVoices:1});
  const buffer=ctx.createBuffer(1,48000,48000);buffer.getChannelData(0).fill(.1);
  scheduleVocal(ctx,ctx.destination,{recording:{id:"protected",trimSeconds:0,durationSeconds:1},clip:{lengthSteps:8,gain:1}},0,.125,new Map([["protected",buffer]]),{session});
  const patch=cleanPatch();patch.effects.delayMix=.8;patch.envelope.release=4;
  const rejected=scheduleNote(ctx,ctx.destination,{patch,volume:.5},{pitch:69,velocity:1},.1,.2,null,session);
  const diagnostics=session.diagnostics,end=session.end,data=(await ctx.startRendering()).getChannelData(0);
  add("priority/reject-lower-synth",{diagnostics,end,rms:signalStats(data.subarray(9600,19200)).rms},
   {rejected:!rejected.admitted&&rejected.disposed,protected:diagnostics.rejected===1&&diagnostics.stolen===0,noRejectedBus:diagnostics.buses===0,noStaleEnd:end<1.1,audible:signalStats(data.subarray(9600,19200)).rms>.01});
 }
 for(const delay of [false,true]){
  const ctx=context(2),session=new VoiceSession(ctx,ctx.destination,{maxVoices:1}),patch=cleanPatch();patch.envelope.release=4;
  if(delay)patch.effects={drive:0,delayMix:.8,delayTime:.1,delayFeedback:.3};
  const old=scheduleNote(ctx,ctx.destination,{patch,volume:.3},{pitch:69,velocity:1},0,.2,null,session);
  const short=cleanPatch();short.envelope.release=.01;
  scheduleNote(ctx,ctx.destination,{patch:short,volume:.1},{pitch:72,velocity:1},.1,.05,null,session);
  const end=session.end,data=(await ctx.startRendering()).getChannelData(0);
  add("completion/stolen-long-release/"+delay,{end,oldEnd:old.end,tailRms:signalStats(data.subarray(48000)).rms},
   {shortened:Math.abs(end-Math.max(.322,delay?.105+delayTailSeconds(patch.effects):0))<1e-9,fadePreserved:Math.abs(old.end-.105)<1e-9,silentAfterBound:signalStats(data.subarray(48000)).rms<.000002,
    ...(delay?{realEcho:signalStats(data.subarray(11040,13440)).rms>.0001}:{})});
 }
 {
  const ctx=context(2),session=new VoiceSession(ctx,ctx.destination,{maxVoices:4}),long=cleanPatch(),short=cleanPatch();long.envelope.release=4;short.envelope.release=.01;
  for(let i=0;i<128;i++)scheduleNote(ctx,ctx.destination,{patch:long,volume:.01},{pitch:60+i%12,velocity:.5},i*.005,.1,null,session);
  for(let i=0;i<4;i++)scheduleNote(ctx,ctx.destination,{patch:short,volume:.01},{pitch:60+i,velocity:.5},.7+i*.005,.05,null,session);
  const end=session.end,diagnostics=session.diagnostics,data=(await ctx.startRendering()).getChannelData(0);
  add("completion/dense-long-releases",{end,diagnostics,after:signalStats(data.subarray(48000))},
   {bound:end<1,stolen:diagnostics.stolen===128,finite:signalStats(data).nonFinite===0,silent:signalStats(data.subarray(48000)).rms<.000002});
 }
 // 32 sustained expressive voices run on the real-time graph and are captured
 // inside AudioWorklet. Device-driver underruns are not observable here.
 {
  const ctx=new AudioContext({sampleRate:48000,latencyHint:"interactive"});await ctx.resume();
  try{
   await ctx.audioWorklet.addModule("/tests/audio-quality/capture-worklet.js");
   const startFrame=Math.ceil((ctx.currentTime+.3)*ctx.sampleRate),first=startFrame+Math.round(.15*ctx.sampleRate),length=Math.round(.5*ctx.sampleRate);
   const capture=new AudioWorkletNode(ctx,"premidi-qualification-capture",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{first,length}});
   capture.connect(ctx.destination);
   let timer;const dataPromise=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error("Real-time capture timed out")),10000);capture.port.onmessage=event=>resolve(event.data);
   });
   const session=new VoiceSession(ctx,capture),patch=makePatch("glass-portamento"),started=performance.now();
   for(let i=0;i<32;i++)scheduleNote(ctx,capture,{patch,volume:.02},{pitch:48+i,velocity:.8},startFrame/ctx.sampleRate,.8,null,session);
   const setupMs=performance.now()-started,queuedBeforeOnset=ctx.currentTime<startFrame/ctx.sampleRate;
   const data=await dataPromise;clearTimeout(timer);const stats=signalStats(data);let silentBlocks=0,minBlockRms=Infinity;
   for(let i=0;i+128<=data.length;i+=128){const rms=signalStats(data.subarray(i,i+128)).rms;minBlockRms=Math.min(minBlockRms,rms);if(rms<1e-7)silentBlocks++;}
   session.stop();await wait(50);session.sweep();
   add("realtime/32-expressive-voices",{setupMs,sampleRate:ctx.sampleRate,baseLatency:ctx.baseLatency,outputLatency:ctx.outputLatency??null,
    ...stats,silentBlocks,minBlockRms,remaining:session.voices.size,
    qualification:"browser render-graph capture only; output device latency, driver underruns and native callback deadlines remain unqualified"},
    {queuedBeforeOnset,finite:stats.nonFinite===0,audible:stats.rms>.0001,noSilentBlocks:silentBlocks===0,headroom:stats.peak<1,cleanup:session.voices.size===0});
  }finally{await ctx.close();}
 }
 for(const count of [32,64]){
  const ctx=new AudioContext({sampleRate:48000,latencyHint:"interactive"});await ctx.resume();
  try{
   await ctx.audioWorklet.addModule("/tests/audio-quality/capture-worklet.js");
   await ctx.suspend();
   const startFrame=Math.ceil((ctx.currentTime+.3)*ctx.sampleRate),first=startFrame+Math.round(.15*ctx.sampleRate),length=Math.round(.4*ctx.sampleRate);
   const capture=new AudioWorkletNode(ctx,"premidi-qualification-capture",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{first,length}});capture.connect(ctx.destination);
   let timer;const dataPromise=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error("Modulated capture timed out")),15000);capture.port.onmessage=event=>resolve(event.data);});
   const session=new VoiceSession(ctx,capture),patch=modulationFixtures().find(fixture=>fixture.id==="maximum-16").patch,started=performance.now();
   for(let i=0;i<count;i++)scheduleNote(ctx,capture,{patch,volume:.005},{pitch:48+i%24,velocity:.8},startFrame/ctx.sampleRate,.8,null,session);
   const setupMs=performance.now()-started,queuedBeforeOnset=ctx.currentTime<startFrame/ctx.sampleRate;await ctx.resume();const data=await dataPromise;clearTimeout(timer);
   const stats=signalStats(data);let silentBlocks=0;for(let i=0;i+128<=data.length;i+=128)if(signalStats(data.subarray(i,i+128)).rms<1e-7)silentBlocks++;
   session.stop();const cleanupStart=performance.now();
   while(session.voices.size&&performance.now()-cleanupStart<5000){await wait(20);session.sweep();}
   const cleanupMs=performance.now()-cleanupStart;
   add("realtime/"+count+"-voices-16-routes",{setupMs,cleanupMs,preparation:"Audio clock suspended during graph preparation; setupMs is startup cost, not callback CPU",...stats,silentBlocks,remaining:session.voices.size,diagnostics:session.diagnostics,
    qualification:"Browser AudioWorklet graph capture; no driver underrun, device latency or native CPU qualification"},
    {queuedBeforeOnset,finite:stats.nonFinite===0,audible:stats.rms>.00001,headroom:stats.peak<1,noSilentBlocks:silentBlocks===0,cleanup:session.voices.size===0,noRejections:session.diagnostics.rejected===0,allAdmitted:session.diagnostics.admitted===count});
  }finally{await ctx.close();}
 }
 {
  const patch=cleanPatch(),voices=[];
  for(let i=0;i<9;i++)voices.push(await audition({patch,volume:.1},60+i,null,{duration:.8}));
  const complete=voices.every(voice=>voice.end-voice.start>.8);
  voices.forEach(voice=>voice.stop(0));
  add("preview/full-nine-sound-rack-budget",{voices:voices.length},{complete});
 }
 // Repeated stop/start/seek/loop sessions must clean their actual owned graphs.
 {
  const beat=create();beat.bpm=240;beat.instruments[0].sounds[0].patch=cleanPatch();
  beat.instruments[0].chunks[0].notes=[{id:"loop",pitch:69,start:0,duration:1,velocity:.8}];
  const diagnostics=[];
  for(const startStep of [0,0,1]){const transport=await play(beat,{loop:true,startStep});await wait(120);transport.stop();await wait(60);diagnostics.push(transport.diagnostics);}
  add("transport/stop-seek-loop",{diagnostics},{empty:diagnostics.every(x=>x.voices===0&&x.buses===0)});
 }
 return {schemaVersion:1,backend:"web-audio-voice-lifecycle",environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency},
  summary:{cases:results.length,failed:failures.length,status:failures.length?"fail":"pass"},failures,results};
}
