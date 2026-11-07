// Optional focused DSP regression. Provide node-web-audio-api externally with
// WEB_AUDIO_MODULE; it is intentionally not a production or routine dependency.
import assert from "node:assert/strict";
const {OfflineAudioContext}=await import(process.env.WEB_AUDIO_MODULE??"node-web-audio-api");
globalThis.OfflineAudioContext=OfflineAudioContext;
const {scheduleVocal}=await import("../songAudio.js");
const {prepareVocalSeek,scheduleVocalSeek}=await import("../src/hosts/web/vocal-seek.js");
const rate=24000,unit=.125,reference=new OfflineAudioContext(2,rate*6,rate);
const buffer=reference.createBuffer(2,rate*2,rate);
for(let ch=0;ch<2;ch++){
 const pcm=buffer.getChannelData(ch);
 for(let i=0;i<pcm.length;i++)pcm[i]=.22*Math.sin(i/rate*2*Math.PI*(173+ch*71))+.08*Math.sin(i/rate*2*Math.PI*1283);
}
const recording={id:"r",durationSeconds:2,trimSeconds:.05};
const clip={id:"c",recordingId:"r",startStep:2,lengthSteps:16,trimStartSeconds:.07,gain:.8,effects:{
 filter:{type:"lowpass",cutoff:2200,resonance:1.2,sweep:-2,sweepTime:.7},drive:.3,pan:.2,
 attack:.08,release:.2,delayMix:.6,delayTime:.19,delayFeedback:.4,
 bend:{shape:"wave",amount:1,rate:2},movement:{glide:-2,glideTime:.4,depth:12,rate:3,delay:.2,tone:.2,toneRate:2,tremolo:.2,tremoloRate:3}
}};
const decoded=new Map([["r",buffer]]),event={recording,clip};
const song={kind:"song",bpm:120,recordings:[recording],tracks:[{id:"t",kind:"vocal",clips:[clip]}]};
scheduleVocal(reference,reference.destination,event,clip.startStep*unit,unit,decoded,{controlStart:clip.startStep*unit});
const full=await reference.startRendering();
for(const step of [9,19]){
 const prepared=await prepareVocalSeek(song,step,decoded,rate),offset=Math.round(step*unit*rate);
 assert.equal(prepared.size,1,"Ongoing audio and ended-clip echoes both continue");
 const resumed=new OfflineAudioContext(2,full.length-offset,rate);
 scheduleVocalSeek(resumed,resumed.destination,prepared.get(clip.id),0);
 const output=await resumed.startRendering();let difference=0,peak=0;
 for(let ch=0;ch<2;ch++){
  const actual=output.getChannelData(ch),expected=full.getChannelData(ch);
  for(let i=0;i<actual.length;i++){
   difference=Math.max(difference,Math.abs(actual[i]-expected[i+offset]));peak=Math.max(peak,Math.abs(actual[i]));
  }
 }
 assert.ok(peak>.0001,"Seek continuation is audible");
 assert.ok(difference<2e-5,`Seek at ${step} reset processor history: ${difference}`);
 console.log("PASS processed vocal seek",JSON.stringify({step,sampleRate:rate,peak,maxDifference:difference}));
}
