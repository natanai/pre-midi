import {renderSynthBuffer,scheduleNote,frequency} from "../../audio.js";
import {scheduleSample} from "../../sampler.js";
import {configureDriveShaper} from "../../audioEffects.js";
import {scheduleAmplitudeEnvelope} from "../../envelope.js";
import {signalStats,difference,crossingFrequency,harmonicMetrics} from "./metrics.js";
import {SAMPLE_RATES,FFT_SIZE,ENVELOPE_FIXTURES,cleanPatch,referenceEnvelope} from "./fixtures.js";
const segment=(buffer,start,length)=>buffer.getChannelData(0).subarray(Math.round(start*buffer.sampleRate),Math.round(start*buffer.sampleRate)+length);
const ctx=(sampleRate,seconds,channels=1)=>new OfflineAudioContext(channels,Math.ceil(sampleRate*seconds),sampleRate);
function sampleVoice(context,samples,drive){
 const patch={type:"sample",zones:[{assetId:"reference",root:69}],followPitch:true,
  transpose:0,gain:1,attack:.005,release:.05,pan:0,drive,
  movement:{rate:5,depth:0,delay:0,glide:0,glideTime:.18,tremolo:0,tremoloRate:5,tone:0,toneRate:2},
  bend:{shape:"straight",amount:2,rate:4}};
 scheduleSample(context,context.destination,{patch,volume:1},{pitch:69,velocity:1},0,.65,null,new Map([["reference",samples]]));
}
export async function runAudioBenchmark(policy,onProgress=()=>{}){
 const results=[],failures=[],g=policy.gates;
 const add=(id,sampleRate,metrics,checks={})=>{
  const failed=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);
  results.push({id,sampleRate,metrics,checks,status:failed.length?"fail":"pass"});
  failures.push(...failed.map(check=>({id,sampleRate,check})));onProgress(id+" "+sampleRate);
 };
 for(const sampleRate of SAMPLE_RATES){
  for(const fixture of ENVELOPE_FIXTURES){
   const start=.01317,seconds=start+fixture.gate+fixture.envelope.release+.03;
   const context=ctx(sampleRate,seconds),source=context.createBufferSource(),amp=context.createGain();
   source.buffer=context.createBuffer(1,context.length,sampleRate);source.buffer.getChannelData(0).fill(1);
   source.connect(amp);amp.connect(context.destination);
   scheduleAmplitudeEnvelope(amp.gain,{start,off:start+fixture.gate,peak:1,envelope:fixture.envelope});
   // Explicit silence before the scheduled start, independent of gain default 1.
   amp.gain.setValueAtTime(0,0);source.start(0);
   const rendered=(await context.startRendering()).getChannelData(0);
   const expected=Float64Array.from(rendered,(_,i)=>referenceEnvelope(i/sampleRate-start,fixture.gate,fixture.envelope));
   const error=difference(rendered,expected),residual=Float64Array.from(rendered,(x,i)=>x-expected[i]);
   add("envelope/"+fixture.id,sampleRate,{error,residualMaxStep:signalStats(residual).maxStep},
    {shape:error.max<=g.envelopeMaxError,discontinuity:signalStats(residual).maxStep<=g.envelopeResidualStep});
  }
  for(const wave of ["sine","triangle","square","sawtooth","harmonic"]){
   for(const pitch of [45,69,93,105]){
    const patch=cleanPatch(wave),buffer=await renderSynthBuffer(patch,pitch,.65,{sampleRate,seconds:.85});
    const steady=segment(buffer,.12,FFT_SIZE),stats=signalStats(steady);
    const harmonic=harmonicMetrics(steady,sampleRate,frequency(pitch));
    const tail=signalStats(segment(buffer,.75,Math.floor(sampleRate*.05)));
    const tuning=wave==="sine"?1200*Math.log2(crossingFrequency(steady,sampleRate)/frequency(pitch)):null;
    add("synth/"+wave+"/"+pitch,sampleRate,{...stats,...harmonic,tuningCents:tuning,tailRms:tail.rms},
     {finite:stats.nonFinite===0,headroom:stats.peak<1,audible:stats.rms>.001,dc:Math.abs(stats.dc)<g.steadyDc,
      released:tail.rms<g.releasedRms,...(wave==="sine"?{tuning:Math.abs(tuning)<=g.tuningCents,sinePurity:harmonic.offHarmonicDb<g.sineOffHarmonicDb}:{})});
   }
  }
  // Two freshly constructed production graphs, including seeded noise and modulation.
  for(const kind of ["harmonic","noise"]){
   const patch=cleanPatch("harmonic");if(kind==="noise")patch.noise=.35;
   patch.effects.drive=.4;
   const a=await renderSynthBuffer(patch,69,.3,{sampleRate,seconds:.5});
   const b=await renderSynthBuffer(patch,69,.3,{sampleRate,seconds:.5});
   const diff=difference(a.getChannelData(0),b.getChannelData(0));
   add("repeatability/"+kind,sampleRate,diff,{repeatable:diff.max<=g.determinismMaxError});
  }
  // Gate phase and level have no coupling between independent polyphonic voices.
  const events=[{start:.013,duration:.19,pitch:69},{start:.023,duration:.003,pitch:72},{start:.053,duration:.29,pitch:69}];
  const patch=cleanPatch(),renderEvents=async entries=>{
   const context=ctx(sampleRate,.5);
   for(const e of entries)scheduleNote(context,context.destination,{patch,volume:1},{pitch:e.pitch,velocity:.8},e.start,e.duration,null);
   return (await context.startRendering()).getChannelData(0);
  };
  const together=await renderEvents(events),sum=new Float64Array(together.length);
  for(const event of events){const mono=await renderEvents([event]);for(let i=0;i<sum.length;i++)sum[i]+=mono[i];}
  const overlap=difference(together,sum);
  add("voices/overlap-retrigger",sampleRate,overlap,{independent:overlap.max<=g.overlapMaxError});
  // Real production stereo panner, including hard left/right and centered mono.
  for(const pan of [-1,0,1]){
   const context=ctx(sampleRate,.4,2),patch=cleanPatch();patch.pan=pan;
   scheduleNote(context,context.destination,{patch,volume:1},{pitch:69,velocity:1},0,.25,null);
   const rendered=await context.startRendering(),left=rendered.getChannelData(0),right=rendered.getChannelData(1);
   const l=signalStats(left),r=signalStats(right),diff=difference(left,right);
   add("stereo/"+pan,sampleRate,{left:l.rms,right:r.rms,difference:diff.max},
    {routing:pan===0?diff.max<=g.stereoLeakRms:pan===-1?l.rms>.01&&r.rms<=g.stereoLeakRms:r.rms>.01&&l.rms<=g.stereoLeakRms});
  }
  const dry=cleanPatch(),wet=cleanPatch();wet.effects={drive:0,delayMix:.7,delayTime:.1,delayFeedback:.5};
  const dryBuffer=await renderSynthBuffer(dry,69,.05,{sampleRate,seconds:1.7});
  const wetBuffer=await renderSynthBuffer(wet,69,.05,{sampleRate,seconds:1.7});
  const dryTail=signalStats(segment(dryBuffer,.3,Math.floor(sampleRate*.2))).rms;
  const wetTail=signalStats(segment(wetBuffer,.3,Math.floor(sampleRate*.2))).rms;
  const lateTail=signalStats(segment(wetBuffer,1.5,Math.floor(sampleRate*.1))).rms;
  add("effects/delay-tail",sampleRate,{dryTail,wetTail,lateTail},
   {audibleTail:wetTail>1e-5&&dryTail<g.releasedRms,decaying:lateTail<wetTail*.01});
  // Bin-coherent high sine isolates nonlinear aliases; compare identical curves.
  const hz=997*sampleRate/FFT_SIZE;
  for(const drive of [.25,.8]){
   const renderDrive=async mode=>{
    const context=ctx(sampleRate,.7),source=context.createOscillator(),gain=context.createGain(),shaper=context.createWaveShaper();
    source.frequency.value=hz;gain.gain.value=.8;
    configureDriveShaper(shaper,drive);shaper.oversample=mode;
    source.connect(gain);gain.connect(shaper);shaper.connect(context.destination);source.start(0);
    return context.startRendering();
   };
   const none=await renderDrive("none"),four=await renderDrive("4x");
   const n=harmonicMetrics(segment(none,.12,FFT_SIZE),sampleRate,hz),f=harmonicMetrics(segment(four,.12,FFT_SIZE),sampleRate,hz);
   const improvement=n.offHarmonicDb-f.offHarmonicDb;
   // Cost only: warm-up then repeated offline wall time; cannot assert device deadlines.
   const times={};
   for(const mode of ["none","4x"]){
    await renderDrive(mode);const measurements=[];
    for(let i=0;i<5;i++){const began=performance.now();await renderDrive(mode);measurements.push(performance.now()-began);}
    times[mode]=measurements.sort((a,b)=>a-b)[2];
   }
   add("drive/"+drive,sampleRate,{none:n,four:f,improvementDb:improvement,offlineMedianMs:times},
    {aliasReduction:improvement>=g.driveMinimumImprovementDb});
   const synth=cleanPatch();synth.effects.drive=drive;
   const synthBuffer=await renderSynthBuffer(synth,69+12*Math.log2(hz/440),.65,{sampleRate,seconds:.8});
   const context=ctx(sampleRate,.8),samples=context.createBuffer(1,Math.ceil(.8*sampleRate),sampleRate);
   const data=samples.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=.8*Math.sin(2*Math.PI*hz*i/sampleRate);
   sampleVoice(context,samples,drive);const sampleBuffer=await context.startRendering();
   const synthSpectrum=harmonicMetrics(segment(synthBuffer,.12,FFT_SIZE),sampleRate,hz);
   const sampleSpectrum=harmonicMetrics(segment(sampleBuffer,.12,FFT_SIZE),sampleRate,hz);
   add("drive/routes/"+drive,sampleRate,{synth:synthSpectrum,sample:sampleSpectrum},
    {synthAlias:synthSpectrum.offHarmonicDb<g.driveRouteOffHarmonicDb,sampleAlias:sampleSpectrum.offHarmonicDb<g.driveRouteOffHarmonicDb});
  }
 }
 return {schemaVersion:1,backend:"web-audio-offline",environment:{userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency},
  summary:{cases:results.length,failed:failures.length,status:failures.length?"fail":"pass"},failures,results};
}
