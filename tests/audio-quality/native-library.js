import {create} from '../../schema.js';
import {EXAMPLES,buildExample} from '../../examples.js';
import {SAMPLE_ASSETS,SAMPLE_LIBRARY,makeSamplerPatch,sampleAsset,sampleFile} from '../../samples.js';
import {loadLibrarySample,scheduleSample} from '../../sampler.js';
import {resolveEvent} from '../../soundModel.js';
import {renderEvents,renderEndSeconds,scheduleSynthPlan} from '../../audio.js';
import {planSynthVoice} from '../../src/dsp/synth-voice.js';
import {nativePlans,nativeRequiredAssets,encodeNativeSession} from '../../src/hosts/native/session.js';
import {VoiceSession} from '../../src/hosts/web/voice-session.js';
import {scheduleVocal} from '../../songAudio.js';
import {createSong,addVocalTake,addBeatClip,addSongTrack,songDurationSteps} from '../../songModel.js';
import {difference,signalStats} from './metrics.js';

export async function qualifyNativeLibrary(add,{quick=false}={}){
 const rate=48000,decoder=new OfflineAudioContext(2,1,rate),cache=new Map();
 async function asset(id,{path,extension}={}){
  if(cache.has(id))return cache.get(id);
  const task=(async()=>{
   const meta=sampleAsset(id),url=path??sampleFile(meta),bytes=await(await fetch(url)).arrayBuffer();
   const response=await fetch('/__native_decode?ext='+(extension??(meta.mime==='audio/ogg'?'ogg':'wav'))+'&rate='+rate,{method:'POST',body:bytes});if(!response.ok)throw Error(id+': '+await response.text());
   const result=await response.arrayBuffer(),view=new DataView(result),native={rate:view.getUint32(0,true),channels:view.getUint32(4,true),frames:view.getUint32(8,true),normalization:view.getFloat32(12,true),pcm:new Float32Array(result.slice(16))};native.duration=native.frames/native.rate;
   return {native,browser:await decoder.decodeAudioData(bytes.slice(0))};
  })();cache.set(id,task);return task;
 }
 async function renderNative(plans,assets,frames,cycle,{seek=0,loop=false,block=128}={}){
  const query=new URLSearchParams({rate,frames,cycle,seek,loop,block});
  const response=await fetch('/__native_session?'+query,{method:'POST',body:encodeNativeSession(plans,rate,assets)});if(!response.ok)throw Error(await response.text());return new Float32Array(await response.arrayBuffer());
 }
 async function qualify(id,doc,{strict=false,seek=0,loop=false,seconds=null}={}){
  const events=renderEvents(doc),handles=new Map(),buffers=new Map(),assets=[];
  for(const key of nativeRequiredAssets(events)){
   const decoded=await asset(key),native={...decoded.native,id:assets.length+1};assets.push(native);handles.set(key,native);buffers.set(key,decoded.browser);
  }
  const unit=60/doc.bpm/4,cycle=(doc.kind==='song'?songDurationSteps(doc):doc.bars*16)*unit;
  const plans=nativePlans(events,handles,unit),length=seconds??Math.max(cycle,renderEndSeconds(doc,events,buffers))+.05,frames=Math.ceil(length*rate);
  const native=await renderNative(plans,assets,frames,cycle,{seek,loop}),odd=await renderNative(plans,assets,frames,cycle,{seek,loop,block:511});
  const blockError=difference(native,odd),stats=signalStats(native);
  // Full independent browser graph from the original score, not from native
  // prepared sample parameters or native decoder output.
  const c=new OfflineAudioContext(2,frames+Math.ceil(seek*rate),rate),out=c.createGain();out.gain.value=.85;out.connect(c.destination);const session=new VoiceSession(c,out,{chronological:true});
  const cycles=loop?Math.ceil((length+seek)/cycle):1;
  for(let n=0;n<cycles;n++)for(const event of events){
   const start=event.at+n*cycle;
   if(event.kind==='vocal'){scheduleVocal(c,out,event.event,start,unit,buffers,{session});continue;}
   const resolved=resolveEvent(event.instrument,event.note);if(!resolved)throw Error('Unresolved browser fixture voice');
   if(resolved.voice.patch.type==='sample')scheduleSample(c,out,resolved.voice,resolved.note,start,event.duration,event.beat,buffers,session);
   else{
    const duration=event.instrument.layout==='rack'?Math.max(.015,resolved.voice.patch.envelope.attack+resolved.voice.patch.envelope.decay):event.duration;
    scheduleSynthPlan(c,out,planSynthVoice(resolved.voice,resolved.note,start,duration,{automation:event.instrument.automation,timeline:event.timeline}),session);
   }
  }
  const browser=await c.startRendering(),offset=Math.ceil(seek*rate-1e-9),errors=[0,1].map(ch=>difference(Float32Array.from({length:frames},(_,i)=>native[2*i+ch]),browser.getChannelData(ch).subarray(offset,offset+frames)));
  const max=Math.max(...errors.map(e=>e.max)),rms=Math.max(...errors.map(e=>e.rms));
  const browserRms=Math.sqrt([0,1].reduce((sum,ch)=>sum+signalStats(browser.getChannelData(ch).subarray(offset,offset+frames)).rms**2,0)/2);
  const levelError=Math.abs(stats.rms/Math.max(1e-9,browserRms)-1);
  // New codec/rate-conversion gates are declared before measurement. Existing
  // synth PCM gates stay unchanged. Strict fixtures bypass rate conversion.
  add('library/'+id,{max,rms,levelError,stats,blockError,nativePlans:plans.length,assets:assets.length,seconds:length,seek,loop},
   {prepared:true,finite:stats.nonFinite===0,audible:stats.rms>.000001,deterministic:blockError.max===0,
    maxError:max<(strict?.0001:.03),rmsError:rms<(strict?.00002:.002),level:levelError<(strict?.001:.03)});
 }
 // The same decoded source at the same rate isolates native scheduling, stereo
 // panning and DSP from codec/rate-conversion tolerances.
 const syntheticId='native-tone';await asset(syntheticId,{path:'/native/decoder/tests/fixtures/tone.wav',extension:'wav'});
 function sampleBeat(patch,notes){const doc=create();doc.bars=1;doc.instruments[0].sounds[0].patch=patch;doc.instruments[0].volume=.4;doc.instruments[0].chunks[0].notes=notes;doc.instruments[0].timeline=[doc.instruments[0].chunks[0].id];doc.instruments[0].placements=[null];doc.samples=[...new Set(patch.zones.map(z=>z.assetId))].map(id=>{const source=sampleAsset(id),mime=source?.mime??'audio/wav';return {id,name:id,mime,path:'assets/'+id+(mime==='audio/ogg'?'.ogg':'.wav'),source:source?.sourceUrl??'synthetic qualification'};});return doc;}
 function patchFor(id){return {type:'sample',presetId:'qualification',zones:[{assetId:id,root:60}],followPitch:true,oneShot:false,transpose:0,gain:.7,attack:.003,release:.04,pan:0};}
 const notes=[{id:'a',pitch:60,start:1,duration:2,velocity:.8},{id:'b',pitch:60,start:2,duration:1,velocity:.55}];
 for(const pan of [-1,0,1]){const patch={...patchFor(syntheticId),pan};await qualify('stereo-pan-'+pan,sampleBeat(patch,notes),{strict:true});}
 const expressive={...patchFor(syntheticId),filter:{type:'lowpass',cutoff:2500,resonance:1.2},drive:.4,movement:{glide:-2,glideTime:.18,rate:5.3,depth:30,delay:.02,tremolo:.3,tremoloRate:3.7}};
 await qualify('sample-effects',sampleBeat(expressive,notes),{strict:true});
 if(!quick){
  for(const preset of SAMPLE_LIBRARY){const patch=makeSamplerPatch(preset);await qualify('preset/'+preset.id,sampleBeat(patch,[...notes,{id:'velocity',pitch:64,start:5,duration:3,velocity:.25}]));}
  for(const source of SAMPLE_ASSETS){await qualify('asset/'+source.id,sampleBeat(patchFor(source.id),[notes[0]]));}
  for(const example of EXAMPLES){const doc=await buildExample(example.id,loadLibrarySample);await qualify('example/'+example.id,doc);}
 }
 const base=sampleBeat(patchFor(syntheticId),notes),song=createSong(base);song.tracks[0].clips[0].lengthSteps=16;addBeatClip(song,addSongTrack(song).id,song.beats[0].id,4,12);
 for(const [extension,mime] of [['webm','audio/webm'],['mp4','audio/mp4'],['ogg','audio/ogg']]){
  const id='vocal-'+extension;await asset(id,{path:'/native/decoder/tests/fixtures/'+(extension==='ogg'?'opus.ogg':'tone.'+extension),extension});
  addVocalTake(song,{id,name:id,mime,path:'assets/'+id+'.'+extension,durationSeconds:.1,trimSeconds:.01},{startStep:2});
 }
 await qualify('song/vocals-overlap',song);
 await qualify('song/vocal-seek',song,{seek:.28,seconds:1});
 await qualify('song/loop',song,{loop:true,seconds:4.3});
}
