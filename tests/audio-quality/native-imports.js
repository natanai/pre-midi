import {planNativeSample,planNativeVocal} from '../../src/hosts/native/sample-plan.js';
import {encodeNativeSession} from '../../src/hosts/native/session.js';
import {scheduleSample} from '../../sampler.js';
import {scheduleVocal} from '../../songAudio.js';
import {difference,signalStats} from './metrics.js';

// Independent decoder + graph: browser receives original encoded files and
// authored sampler settings, never native prepared DSP values or native PCM.
export async function qualifyNativeImports(add){
 const rate=48000,frames=Math.ceil(.4*rate),decoder=new OfflineAudioContext(2,1,rate);
 for(const name of ['channels-4.wav','channels-6.wav','channels-8.wav','channels-32.wav','channels-6-opus.ogg','channels-6-vorbis.ogg','channels-6.mp4','he-aac.mp4','rate-3000.wav','rate-384000.wav','rate-768000.wav']){
  const bytes=await(await fetch('/native/decoder/tests/fixtures/'+name)).arrayBuffer(),extension=name.split('.').at(-1);
  const reply=await fetch('/__native_decode?ext='+extension+'&rate='+rate,{method:'POST',body:bytes});if(!reply.ok)throw Error(name+': '+await reply.text());
  const raw=await reply.arrayBuffer(),view=new DataView(raw),asset={id:1,rate:view.getUint32(0,true),channels:view.getUint32(4,true),frames:view.getUint32(8,true),normalization:view.getFloat32(12,true),pcm:new Float32Array(raw.slice(16))};asset.duration=asset.frames/asset.rate;
  const buffer=await decoder.decodeAudioData(bytes.slice(0)),handles=new Map([['source',asset]]),buffers=new Map([['source',buffer]]);
  for(const mode of ['plain','effects','vocal']){
   const patch={type:'sample',presetId:'qualification',zones:[{assetId:'source',root:60}],followPitch:true,oneShot:false,transpose:0,gain:.7,attack:.003,release:.025,pan:0};
   if(mode==='effects'){patch.filter={type:'lowpass',cutoff:2300,resonance:1.1};patch.drive=.6;patch.pan=-.4;patch.movement={glide:-2,glideTime:.05,rate:5.3,depth:30,delay:.02,tremolo:.4,tremoloRate:3.7};}
   const instrument={patch,volume:.3},note={pitch:60,velocity:.7},start=.010123,duration=.08;
   const vocal={recording:{id:'source',trimSeconds:0,durationSeconds:asset.duration},clip:{lengthSteps:2,gain:.2}};
   const plans=mode==='vocal'?[planNativeVocal(vocal,start,.125,handles)]:[planNativeSample(instrument,note,start,duration,handles)];
   const render=async block=>{const query=new URLSearchParams({rate,frames,cycle:1,seek:0,loop:false,block});const r=await fetch('/__native_session?'+query,{method:'POST',body:encodeNativeSession(plans,rate,[asset])});if(!r.ok)throw Error(name+': '+await r.text());return new Float32Array(await r.arrayBuffer());};
   const native=await render(128),odd=await render(511),context=new OfflineAudioContext(2,frames,rate),master=context.createGain();master.gain.value=.85;master.connect(context.destination);
   if(mode==='vocal')scheduleVocal(context,master,vocal,start,.125,buffers);else scheduleSample(context,master,instrument,note,start,duration,null,buffers);
   const browser=await context.startRendering(),errors=[0,1].map(ch=>difference(Float32Array.from({length:frames},(_,i)=>native[2*i+ch]),browser.getChannelData(ch))),stats=signalStats(native),blockError=difference(native,odd),max=Math.max(...errors.map(x=>x.max)),rms=Math.max(...errors.map(x=>x.rms));
   const decoded={nativeFrames:asset.frames,browserFrames:buffer.length,nativeRms:signalStats(asset.pcm).rms,browserRms:signalStats(buffer.getChannelData(0)).rms};
   if(mode==='vocal'&&(name.includes('.mp4')||name.includes('768000')||name.includes('vorbis'))){
    const n=asset.frames,b=buffer.length,channel=Math.min(2,asset.channels-1);let best={rms:Infinity,lag:0};
    for(let lag=-2048;lag<=2048;lag++){let sum=0,count=0;for(let i=2304;i<Math.min(n,b)-2304;i+=8){const delta=asset.pcm[i*asset.channels+channel]-buffer.getChannelData(channel)[i+lag];sum+=delta*delta;count++;}const rms=Math.sqrt(sum/Math.max(1,count));if(rms<best.rms)best={rms,lag};}decoded.best=best;
   }
   const strict=name.startsWith('channels-')&&extension==='wav';
   add('imports/'+name+'/'+mode,{max,rms,stats,blockError,decoded,sourceChannels:buffer.numberOfChannels,nativeChannels:asset.channels},{prepared:true,finite:stats.nonFinite===0,audible:stats.rms>.000001,channels:asset.channels===buffer.numberOfChannels,deterministic:blockError.max===0,maxError:max<(strict?.0001:.03),rmsError:rms<(strict?.00002:.002)});
  }
 }
}
