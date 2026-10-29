import {attachModulation} from '../../src/hosts/web/modulation.js';
import {planSynthVoice} from '../../src/dsp/synth-voice.js';
import {scheduleSynthPlan} from '../../audio.js';
import {encodeNativeSession} from '../../src/hosts/native/session.js';
import {cleanPatch} from './fixtures.js';
import {difference,signalStats} from './metrics.js';
export async function qualifyNativeEdges(add){
 for(const rate of [8000,44100,48000,96000,192000])for(const start of [0,.010123])for(const kind of ['glide','bend','modulation','vibrato','combined']){
  const patch=cleanPatch(kind==='bend'?'sawtooth':'sine');patch.oscillators[0].octave=1;
  const note={pitch:127,velocity:.7};
  if(kind==='glide')patch.movement={...patch.movement,glide:12,glideTime:.12};
  if(kind==='bend')note.bend={shape:'rise',amount:12,rate:4};
  if(kind==='vibrato'||kind==='combined')patch.movement={...patch.movement,depth:100,rate:7.3,delay:.012,tone:.8,toneRate:11.7,tremolo:1,tremoloRate:5.1};
  if(kind==='combined')patch.effects={drive:.7,delayMix:.4,delayTime:.1,delayFeedback:.6};
  if(kind==='modulation'||kind==='combined'){patch.version=2;patch.modulation={version:1,routes:[{id:'edge',source:{kind:'lfo',shape:'sine',rate:7.3},target:'oscillators.0.detune',unit:'cents',depth:2400,polarity:'bipolar',smoothing:0}]};}
  const plan=planSynthVoice({patch,volume:.3},note,start,.2),frames=Math.ceil(.5*rate);
  const response=await fetch('/__native_render',{method:'POST',body:JSON.stringify({plan,sampleRate:rate,frames})});if(!response.ok)throw Error(await response.text());
  const native=new Float32Array(await response.arrayBuffer()),context=new OfflineAudioContext(2,frames,rate);scheduleSynthPlan(context,context.destination,plan);const browser=await context.startRendering();
  const errors=[0,1].map(ch=>difference(Float32Array.from({length:frames},(_,i)=>native[2*i+ch]),browser.getChannelData(ch))),stats=signalStats(native),max=Math.max(...errors.map(x=>x.max)),rms=Math.max(...errors.map(x=>x.rms));
  let trace;
  if(kind==='modulation'&&new URL(location.href).searchParams.has('edgesOnly')){
   const debug=await fetch('/__native_render',{method:'POST',body:JSON.stringify({plan,sampleRate:rate,frames,probe:true})});if(!debug.ok)throw Error(await debug.text());const nativeTrace=new Float32Array(await debug.arrayBuffer());
   const c=new OfflineAudioContext(1,frames,rate),carrier=c.createConstantSource(),control=c.createGain();carrier.offset.value=1;control.gain.value=0;carrier.connect(control);control.connect(c.destination);carrier.start();const owner={sources:[],nodes:[]};attachModulation(c,plan,new Map([['oscillators.0.detune',control.gain]]),owner);const browserTrace=(await c.startRendering()).getChannelData(0);
   const a=Math.ceil(start*rate),b=Math.ceil(plan.end*rate);const differences=difference(Float32Array.from({length:b-a},(_,i)=>nativeTrace[5*(i+a)+1]),browserTrace.subarray(a,b));let frequencyPhase=0;for(let i=a;i<b;i++){const f=Math.min(rate/2,Math.fround(Math.fround(Math.min(rate/2,plan.oscillators[0].frequency))*Math.fround(2**Math.fround(browserTrace[i]*Math.fround(1/1200)))));frequencyPhase+=(nativeTrace[5*i+2]-f)/rate;}differences.phaseCycles=frequencyPhase;
   trace={differences,samples:[Math.ceil(start*rate),127,128,256,512,1024].filter(i=>i<frames).map(i=>({frame:i,native:nativeTrace[5*i+1],browser:browserTrace[i],frequency:nativeTrace[5*i+2]}))};
  }
  add('execution/nyquist/' +rate+'/'+start+'/'+kind,{max,rms,stats,trace},{prepared:true,finite:stats.nonFinite===0,maxError:max<.0001,rmsError:rms<.00002});
 }
 for(const rate of [44100,96000])for(const modulated of [false,true]){
  const patch=cleanPatch();if(modulated){patch.version=2;patch.modulation={version:1,routes:[{id:'long',source:{kind:'lfo',shape:'sine',rate:7.3},target:'oscillators.0.detune',unit:'cents',depth:2400,polarity:'bipolar',smoothing:0}]};}const start=.010123,seek=35,seconds=.5,plan=planSynthVoice({patch,volume:.3},{pitch:60,velocity:.7},start,40),frames=Math.ceil(seconds*rate),query=new URLSearchParams({rate,frames,cycle:45,seek,loop:false,block:128});
  const response=await fetch('/__native_session?'+query,{method:'POST',body:encodeNativeSession([plan],rate)});if(!response.ok)throw Error(await response.text());const native=new Float32Array(await response.arrayBuffer());
  query.set('block','511');const oddResponse=await fetch('/__native_session?'+query,{method:'POST',body:encodeNativeSession([plan],rate)});if(!oddResponse.ok)throw Error(await oddResponse.text());const blockError=difference(native,new Float32Array(await oddResponse.arrayBuffer()));
  const context=new OfflineAudioContext(2,Math.ceil((seek+seconds)*rate),rate),master=context.createGain();master.gain.value=.85;master.connect(context.destination);scheduleSynthPlan(context,master,plan);const browser=await context.startRendering();
  const errors=[0,1].map(ch=>difference(Float32Array.from({length:frames},(_,i)=>native[2*i+ch]),browser.getChannelData(ch).subarray(Math.ceil(seek*rate-1e-9)))),stats=signalStats(native),max=Math.max(...errors.map(x=>x.max)),rms=Math.max(...errors.map(x=>x.rms));
  let trace;
  if(modulated&&new URL(location.href).searchParams.has('edgesOnly')){
   const debug=await fetch('/__native_render',{method:'POST',body:JSON.stringify({plan,sampleRate:rate,frames,probe:{seek}})});if(!debug.ok)throw Error(await debug.text());const nativeTrace=new Float32Array(await debug.arrayBuffer());
   const c=new OfflineAudioContext(1,Math.ceil((seek+seconds)*rate),rate),carrier=c.createConstantSource(),control=c.createGain();carrier.offset.value=1;control.gain.value=0;carrier.connect(control);control.connect(c.destination);carrier.start();const owner={sources:[],nodes:[]};attachModulation(c,plan,new Map([['oscillators.0.detune',control.gain]]),owner);const browserTrace=(await c.startRendering()).getChannelData(0).subarray(Math.ceil(seek*rate-1e-9));
   trace=difference(Float32Array.from({length:frames},(_,i)=>nativeTrace[5*i+1]),browserTrace);
  }
  add('execution/long-note-seek/'+rate+'/'+modulated,{max,rms,stats,blockError,trace},{prepared:true,finite:stats.nonFinite===0,audible:stats.rms>.001,maxError:max<.0001,rmsError:rms<.00002,deterministic:blockError.max===0});
 }
}
