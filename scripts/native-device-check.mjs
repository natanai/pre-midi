import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir,cpus,platform,release,arch} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makePatch} from '../synth.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';
import {planNativeSample,planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {encodeNativeSession} from '../src/hosts/native/session.js';
import {buildNativeRenderer} from '../native/bridge.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'premidi-device-'));
const binary=join(temp,'device-check'),rows=[],deviceRows=[];
const run=(args)=>execFileSync(binary,args.map(String),{encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
const floatArray=bytes=>Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4));
const sine=()=>{const patch=makePatch('init');patch.oscillators=[{wave:'sine',level:1,octave:0,detune:0},{wave:'sine',level:0,octave:0,detune:0}];patch.envelope={attack:.005,decay:.025,sustain:.65,release:.09};return patch;};
const plan=(patch,pitch=69,start=0,duration=.12,volume=.15,extra={})=>planSynthVoice({patch,volume},{pitch,velocity:.8},start,duration,extra);
let renderer;
try{
 execFileSync(process.env.CXX||'g++',['-std=c++17','-O2','-ffp-contract=off','-Wall','-Wextra','-Werror','-pedantic','-DPREMIDI_AUDIO_TEST',join(root,'native/session-test.cpp'),join(root,'native/device-host.cpp'),'-pthread','-ldl','-lm','-o',binary],{stdio:'pipe'});
 renderer=await buildNativeRenderer();
 async function render(plans,{rate=48000,cycle=1,seek=0,loop=false,seconds=.4,block=128,pause=false,assets=null,offline=false,loopEdit=false}={}){
  const input=join(temp,'fixture.pms'),output=join(temp,'pcm.f32');await writeFile(input,encodeNativeSession(plans,rate,assets));
  const frames=Math.round(seconds*rate),report=JSON.parse(run([offline?'--export':'--render',input,rate,cycle,seek,Number(loop),frames,block,output,pause?'pause':loopEdit?'loop-edit':'none']));
  return {pcm:floatArray(await readFile(output)),report};
 }
 function compare(name,actual,expected,extra={}){
  if(actual.length!==expected.length)throw Error(name+': PCM length mismatch');
  let max=0,sum=0;for(let i=0;i<actual.length;i++){const delta=actual[i]-expected[i];max=Math.max(max,Math.abs(delta));sum+=delta*delta;}
  const rms=Math.sqrt(sum/actual.length);if(max>1e-4||rms>2e-5)throw Error(`${name}: callback/native reference max ${max}, rms ${rms}`);
  rows.push({name,maxPcm:max,rmsPcm:rms,...extra});
 }
 for(const rate of [44100,48000,96000]){
  for(const patch of [sine(),makePatch('touch-keys'),makePatch('harmonic-keys'),makePatch('broken-siren'),makePatch('midnight-theremin')]){
   const voice=plan(patch,62,.010,.14),expected=floatArray(renderer.render(voice,rate,Math.round(rate*.4))).map(v=>v*.85);
   const one=await render([voice],{rate});compare('canonical-'+patch.presetId+'-'+rate,one.pcm,expected,{rate,allocationAssertions:one.report.allocations===0});
   compare('native-offline-'+patch.presetId+'-'+rate,(await render([voice],{rate,offline:true})).pcm,expected,{rate});
   const odd=await render([voice],{rate,block:511});compare('block-invariance-'+patch.presetId+'-'+rate,odd.pcm,one.pcm,{rate});
   const seek=.08,offset=Math.ceil(seek*rate),length=Math.round(.2*rate),full=floatArray(renderer.render(voice,rate,offset+length));
   const positioned=await render([voice],{rate,seek,seconds:.2});compare('seek-'+patch.presetId+'-'+rate,positioned.pcm,full.slice(2*offset).map(v=>v*.85),{rate});
  }
  const base=plan(sine(),69,0,.12,.008),single=floatArray(renderer.render(base,rate,Math.round(rate*.4)));
  for(const voices of [1,8,32,64]){
   const plans=Array.from({length:voices},()=>structuredClone(base));
   const rendered=await render(plans,{rate});compare(`polyphony-${voices}-${rate}`,rendered.pcm,single.map(v=>v*.85*voices),{rate,voices});
   const input=join(temp,'device.pms');await writeFile(input,encodeNativeSession(plans,rate));
   const before=performance.now(),result=JSON.parse(run(['--device',input,rate,'null']));
   deviceRows.push({...result,voices,wallSeconds:(performance.now()-before)/1000,renderCpuPercent:result.renderNs*rate/(result.frames*1e7)});
  }
 }
 const rate=48000,seconds=.4,frames=rate*seconds;
 const held=plan(sine(),69,0,.2,.004),released=plan(sine(),60,0,.01,.004),incoming=plan(sine(),72,.03,.12,.004);
 const many=[...Array.from({length:63},()=>structuredClone(held)),released,incoming];
 const stolen=await render(many,{rate});
 const a=floatArray(renderer.render(held,rate,frames)),b=floatArray(renderer.render(released,rate,frames)),c=floatArray(renderer.render(incoming,rate,frames));
 compare('release-first-stealing',stolen.pcm,a.map((v,i)=>.85*(63*v+c[i]+b[i]*(i/2<rate*.03?1:Math.max(0,1-(Math.floor(i/2)-rate*.03)/(rate*.005))))));
 if(stolen.report.stolen!==1)throw Error('Stealing count mismatch');
 const automation={version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',points:[{id:'low',step:0,value:400},{id:'high',step:4,value:6000}]};
 const automated=plan(makePatch('touch-keys'),60,0,.15,.1,{automation,timeline:{step:0,unit:.125,limitStep:16}});
 const automatedResult=await render([automated]);compare('v3-cutoff-automation',automatedResult.pcm,floatArray(renderer.render(automated,rate,frames)).map(v=>v*.85));
 const loopVoice=plan(sine(),69,0,.09,.03),loopSeconds=.125,total=.5,expected=new Array(Math.round(total*rate)*2).fill(0);
 for(let cycle=0;cycle<4;cycle++){
  const shifted=structuredClone(loopVoice),shift=cycle*loopSeconds;
  for(const key of ['start','off','end','graphEnd'])shifted[key]+=shift;
  shifted.amplitude.events.forEach(event=>event.time+=shift);
  const pcm=floatArray(renderer.render(shifted,rate,Math.round(total*rate)));for(let i=0;i<expected.length;i++)expected[i]+=pcm[i]*.85;
 }
 compare('loop-retains-release-tails',(await render([loopVoice],{cycle:loopSeconds,loop:true,seconds:total})).pcm,expected);
 // Each loop iteration must restart the same cutoff sweep, not inherit the
 // previous cycle's absolute sweep endpoint.
 const sweptPatch=sine();sweptPatch.filter={type:'lowpass',cutoff:900,resonance:1.1,sweep:2,sweepTime:.06};
 const swept=plan(sweptPatch,69,0,.09,.03),sweptExpected=new Array(Math.round(total*rate)*2).fill(0);
 for(let cycle=0;cycle<4;cycle++){
  const shifted=structuredClone(swept),shift=cycle*loopSeconds;
  for(const key of ['start','off','end','graphEnd'])shifted[key]+=shift;
  shifted.amplitude.events.forEach(event=>event.time+=shift);
  shifted.filter.sweepEnd+=shift;
  const pcm=floatArray(renderer.render(shifted,rate,Math.round(total*rate)));
  for(let i=0;i<sweptExpected.length;i++)sweptExpected[i]+=pcm[i]*.85;
 }
 compare('loop-restarts-native-filter-sweep',(await render([swept],{cycle:loopSeconds,loop:true,seconds:total})).pcm,sweptExpected);
 // Shared feedback buses retain tails after voices end and across loop boundaries.
 for(const rate of [44100,48000,96000]){
  const patch=sine();patch.effects={drive:0,delayMix:.55,delayTime:.073137,delayFeedback:.6};
  const one=plan(patch,64,.01,.025,.05),two=plan(patch,69,.13,.025,.05);
  const base=await render([one,two],{rate,cycle:.25,seconds:1.2});
  const expected=[one,two].map(p=>floatArray(renderer.render(p,rate,Math.round(rate*1.2))));
  compare('delay-shared-bus-'+rate,base.pcm,expected[0].map((v,i)=>(v+expected[1][i])*.85));
  for(const block of [1,17,511,8192])compare('delay-block-'+block+'-'+rate,(await render([one,two],{rate,cycle:.25,seconds:1.2,block})).pcm,base.pcm);
  const seek=.6;
  compare('delay-seek-ended-notes-'+rate,(await render([one,two],{rate,cycle:1,seek,seconds:.6})).pcm,base.pcm.slice(Math.ceil(seek*rate)*2));
  const seconds=.8,cycle=.25,totalFrames=Math.round(seconds*rate),loopExpected=new Array(totalFrames*2).fill(0);
  for(let n=0;n<4;n++){
   const p=structuredClone(one),shift=n*cycle;for(const key of ['start','off','end','graphEnd','audibleEnd'])p[key]+=shift;
   p.amplitude.events.forEach(e=>e.time+=shift);p.filter.sweepEnd+=shift;
   const pcm=floatArray(renderer.render(p,rate,totalFrames));for(let i=0;i<loopExpected.length;i++)loopExpected[i]+=pcm[i]*.85;
  }
  compare('delay-loop-tails-'+rate,(await render([one],{rate,cycle,loop:true,seconds})).pcm,loopExpected);
  const history=await render([one],{rate,cycle,loop:true,seconds:1.1});
  compare('live-edit-loop-delay-history-'+rate,(await render([one],{rate,cycle,seek:.08,loop:true,seconds:.27,loopEdit:true})).pcm,history.pcm.slice(Math.ceil((3*cycle+.08)*rate-1e-9)*2,Math.ceil((3*cycle+.35)*rate-1e-9)*2));
 }
 const paused=await render([plan(sine(),69,0,.5)],{cycle:1,pause:true});if(paused.report.state===2)throw Error('Resume failed');
 const malformed=join(temp,'bad.pms');await writeFile(malformed,new Uint8Array([1,2,3]));let rejected=false;
 try{run(['--render',malformed,rate,1,0,0,100,128,join(temp,'bad.pcm'),'none']);}catch{rejected=true;}if(!rejected)throw Error('Malformed native instructions accepted');
 // Validate execution extension boundaries through the same parser as the device.
 const valid=encodeNativeSession([plan(makePatch('glass-keys'))],rate);
 for(const [name,mutate] of [
  ['truncated-delay',b=>b.slice(0,12+130)],
  ['unknown-version',b=>{new DataView(b.buffer).setUint32(24,99,true);return b;}],
  ['nonfinite-delay',b=>{new DataView(b.buffer).setFloat64(12+108,NaN,true);return b;}],
  ['feedback-bound',b=>{new DataView(b.buffer).setFloat64(12+124,1,true);return b;}],
  ['negative-time',b=>{new DataView(b.buffer).setFloat64(12+116,-1,true);return b;}]
 ]){
  await writeFile(malformed,mutate(valid.slice()));let rejected=false;
  try{run(['--render',malformed,rate,1,0,0,100,128,join(temp,'bad.pcm'),'none']);}catch{rejected=true;}
  if(!rejected)throw Error('Malformed native packet accepted: '+name);
 }
 // New v9 limits must not silently relax a v7/v8 packet's contract.
 const extended=encodeNativeSession([plan(sine(),60,.010123,40)],rate);
 for(const [name,mutate] of [
  ['legacy-lifetime',b=>{new DataView(b.buffer).setUint32(24,7,true);return b;}],
  ['reserved-synth-version-eight',b=>{new DataView(b.buffer).setUint32(24,8,true);return b;}],
  ['v9-nonfinite-duration',b=>{new DataView(b.buffer).setFloat64(36,Infinity,true);return b;}],
  ['v9-overlong-duration',b=>{new DataView(b.buffer).setFloat64(36,602,true);return b;}],
  ['v9-truncated',b=>b.slice(0,b.length-1)]
 ]){
  await writeFile(malformed,mutate(extended.slice()));let rejected=false;
  try{run(['--render',malformed,rate,45,0,0,100,128,join(temp,'bad.pcm'),'none']);}catch{rejected=true;}
  if(!rejected)throw Error('Malformed native packet accepted: '+name);
 }
 // Mix v9 and legacy notes in both preparation orders, with shared effects.
 for(const v9First of [false,true]){
  const patch=sine();patch.effects={drive:.4,delayMix:.3,delayTime:.07137,delayFeedback:.4};
  const long=plan(patch,127,.010123,40,.015),short=plan(patch,60,.1,.2,.015),plans=v9First?[long,short]:[short,long];
  const baseline=await render(plans,{rate,cycle:45,seconds:.8});
  for(const block of [1,17,511,8192])compare('mixed-v9-block-'+v9First+'-'+block,(await render(plans,{rate,cycle:45,seconds:.8,block})).pcm,baseline.pcm);
 }
 // Sample/vocal packets retain owned PCM, stereo identity, seek and priority.
 {
 const sampleRate=48000,sourceFrames=4800,source=new Float32Array(sourceFrames*2);
 for(let frame=0;frame<sourceFrames;frame++){source[2*frame]=.25*Math.sin(2*Math.PI*440*frame/sampleRate);source[2*frame+1]=.125*Math.cos(2*Math.PI*330*frame/sampleRate);}
 const asset={id:1,rate:sampleRate,channels:2,frames:sourceFrames,duration:.1,normalization:2.6,pcm:source},assets=[asset],handles=new Map([['test-sample',asset]]);
 const patch={type:'sample',presetId:'test',zones:[{assetId:'test-sample',root:60}],followPitch:true,oneShot:true,transpose:0,gain:.9,attack:0,release:.025,pan:0};
 const sample=planNativeSample({patch,volume:.2},{pitch:60,velocity:.8},.01,.05,handles),stereo=await render([sample],{rate:sampleRate,cycle:1,seconds:.25,assets});
 const expected=new Array(Math.round(.25*sampleRate)*2).fill(0);
 const events=sample.events.map(e=>({...e,value:Math.fround(e.value)}));
 for(let frame=0;frame<expected.length/2;frame++){
  const time=frame/sampleRate;let amp=events[0].value;
  for(let i=1;i<events.length;i++){const e=events[i],p=events[i-1];if(time<e.time){if(e.kind===1&&e.time>p.time)amp=p.value+(e.value-p.value)*(time-p.time)/(e.time-p.time);break;}amp=e.value;}
  const at=frame-Math.ceil(sample.start*sampleRate-1e-9);if(at<0||at>=sourceFrames)continue;
  for(let ch=0;ch<2;ch++)expected[2*frame+ch]=source[2*at+ch]*Math.fround(amp)*.85;
 }
 compare('stereo-sample-independent-envelope',stereo.pcm,expected);
 compare('stereo-sample-block-one',(await render([sample],{rate:sampleRate,cycle:1,seconds:.25,block:1,assets})).pcm,stereo.pcm);
 compare('native-offline-stereo-sample',(await render([sample],{rate:sampleRate,cycle:1,seconds:.25,assets,offline:true})).pcm,stereo.pcm);
 compare('stereo-sample-seek',(await render([sample],{rate:sampleRate,cycle:1,seek:.04,seconds:.21,assets})).pcm,stereo.pcm.slice(Math.ceil(.04*sampleRate-1e-9)*2));
 const vocal=planNativeVocal({recording:{id:'test-sample',trimSeconds:0,durationSeconds:.1},clip:{lengthSteps:1,gain:.004}},0,.125,handles),vocals=Array.from({length:64},()=>structuredClone(vocal));
 const reference=await render(vocals,{assets,seconds:.2});
 const contender=plan(sine(),69,.03,.05,.1);compare('vocal-priority-under-synth-pressure',(await render([...vocals,contender],{assets,seconds:.2})).pcm,reference.pcm);
 }
 const report={version:1,sourceCommit:process.env.GITHUB_SHA??null,os:platform(),osRelease:release(),architecture:arch(),cpu:cpus()[0]?.model,
  physicalDeviceQualification:'pending',deviceUnderruns:'not measured',physicalLatency:'not measured',comparisons:rows,deviceCallbacks:deviceRows,
  tests:['C++ new allocation assertions inside mixer and miniaudio callbacks','canonical v1/v2/v3 PCM gates unchanged','arbitrary block sizes','phase/filter-correct seek','release-first stealing','loop release overlap','pause/resume','rapid play/stop and parallel preview','malformed packet rejection'],
  remaining:['physical Windows 11/macOS/Linux listening and device behavior','sustained playback','physical device switching/disconnect/reconnect','sleep/resume','driver underruns and end-to-end latency']};
 await writeFile(new URL('../benchmarks/native-device.latest.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log('PASS native device milestone: '+rows.length+' PCM comparisons, '+deviceRows.length+' null-backend rate/voice cases; physical hardware pending');
}finally{await renderer?.dispose();await rm(temp,{recursive:true,force:true});}
