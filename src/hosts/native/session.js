import {encodeNativePlan} from './plan.js';
import {resolveEvent} from '../../../soundModel.js';
import {planSynthVoice} from '../../dsp/synth-voice.js';
import {sampleForNote} from '../../../sampler.js';
import {getAsset} from '../../../assetRegistry.js';
import {validatePatch} from '../../../synth.js';
import {encodeNativeSample,planNativeSample,planNativeVocal} from './sample-plan.js';

export const nativeEnabled=()=>!!globalThis.__TAURI__?.core?.invoke&&(localStorage.getItem('premidi-audio-backend')||'native')==='native';
export const nativeRequest=request=>globalThis.__TAURI__.core.invoke('native_audio',{request});
let transportEpoch=0;
export async function cancelNativeTransport(){transportEpoch++;return nativeRequest({action:'control',command:1,looping:false,owner:null});}
export function unsupportedNativeFeatures(patch){
 if(!['synth','sample'].includes(patch?.type))return ['unknown sound type'];
 return [];
}
export function encodeNativeSession(plans,rate,assets=null){
 if(plans.length>4096)throw Error('Native preview supports at most 4096 note onsets per cycle');
 const packets=plans.map(plan=>plan.contract==='pre-midi-sample-voice'?encodeNativeSample(plan,rate):encodeNativePlan(plan,rate,1));
 const bytes=new Uint8Array(8+packets.reduce((sum,packet)=>sum+4+packet.length,0));
 if(bytes.length>16*1024*1024)throw Error('Native session exceeds 16 MiB');
 const view=new DataView(bytes.buffer);view.setUint32(0,0x31534d50,true);view.setUint32(4,packets.length,true);let offset=8;
 for(const packet of packets){view.setUint32(offset,packet.length,true);offset+=4;bytes.set(packet,offset);offset+=packet.length;}
 if(!assets)return bytes;
 const length=12+packets.reduce((sum,p)=>sum+4+p.length,0)+assets.reduce((sum,a)=>sum+12+a.pcm.length*4,0);
 if(length>512*1024*1024)throw Error('Native PCM qualification bundle exceeds 512 MiB');
 const out=new Uint8Array(length),data=new DataView(out.buffer);data.setUint32(0,0x32534d50,true);data.setUint32(4,assets.length,true);let at=8;
 for(const asset of assets){for(const value of [asset.rate,asset.channels,asset.frames]){data.setUint32(at,value,true);at+=4;}for(const value of asset.pcm){data.setFloat32(at,value,true);at+=4;}}
 out.set(bytes.subarray(4),at);return out;
}
export function nativePlans(events,assets=new Map(),unit=.125){
 return events.map(event=>{
  if(event.kind==='vocal')return planNativeVocal(event.event,event.at,unit,assets);
  const resolved=event.instrument.sounds?resolveEvent(event.instrument,event.note):{voice:event.instrument,note:event.note};
  if(!resolved)throw Error('Native playback found an unresolved sound identity');
  const {voice,note}=resolved,unsupported=unsupportedNativeFeatures(voice.patch);
  if(unsupported.length)throw Error(`${event.instrument.name||'Sound'}: native playback does not yet support ${unsupported.join(', ')}. Choose a supported preset (Init, Triangle Keys, Touch Keys), or explicitly select Web Audio in Settings.`);
  if(voice.patch.type==='sample')return planNativeSample(voice,note,event.at,event.duration,assets);
  const duration=event.instrument.layout==='rack'?Math.max(.015,voice.patch.envelope.attack+voice.patch.envelope.decay):event.duration;
  return planSynthVoice(voice,note,event.at,duration,{automation:event.instrument.automation,timeline:event.timeline});
 }).filter(Boolean);
}
const assetCache=new Map();let assetGeneration;
export function nativeRequiredAssets(events){
 const ids=new Set();for(const event of events){
  if(event.kind==='vocal'){ids.add(event.event.recording.id);continue;}
  const resolved=event.instrument.sounds?resolveEvent(event.instrument,event.note):{voice:event.instrument,note:event.note};
  if(!resolved)throw Error('Native playback found an unresolved sound identity');
  const errors=validatePatch(resolved.voice.patch);if(errors.length)throw Error(errors.join('; '));
  if(resolved.voice.patch.type==='sample'){
   const zone=sampleForNote(resolved.voice.patch,resolved.note.pitch,resolved.note.velocity);if(!zone)throw Error('Native sample has no matching zone');ids.add(zone.assetId);
  }
 }
 return ids;
}
export async function prepareNativeAssets(ids,info){
 const generation=info.generation+':'+info.sampleRate;if(assetGeneration!==generation){assetCache.clear();assetGeneration=generation;}
 const result=new Map();for(const id of ids){
  const bytes=getAsset(id);if(!bytes)throw Error('Missing audio asset '+id+'. Open the music ZIP containing its audio.');
  const digest=await crypto.subtle.digest('SHA-256',bytes),key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(!assetCache.has(key))assetCache.set(key,nativeRequest({action:'asset',data:Array.from(bytes)}).then(asset=>({...asset,duration:asset.frames/asset.rate})).catch(error=>{assetCache.delete(key);throw error;}));
  result.set(id,await assetCache.get(key));
 }
 return result;
}
export async function ensureNativeOutput(){
 let status=await nativeRequest({action:'status'});
 if(status.deviceLost)throw Error('Native audio output changed or disconnected. Refresh outputs in Settings and select the device again.');
 if(status.sampleRate)return status;
 let device=null;const saved=JSON.parse(localStorage.getItem('premidi-native-output')||'null');
 if(saved?.name){
  const {devices}=await nativeRequest({action:'devices'}),matches=devices.filter(item=>item.name===saved.name);
  if(matches.length!==1)throw Error('The saved audio output is missing or ambiguous. Select an output in Settings.');
  device=matches[0].id;
 }
 return nativeRequest({action:'configure',device,rate:saved?.rate??0,buffer:saved?.buffer??0});
}
export async function auditionNative(instrument,notes,{duration=.24}={}){
 const unsupported=unsupportedNativeFeatures(instrument.patch);
 if(unsupported.length)throw Error('Native preview does not yet support '+unsupported.join(', ')+'. Choose a supported preset or Web Audio in Settings.');
 const status=await ensureNativeOutput();
 const events=notes.map(note=>({kind:'note',instrument,note,at:note.at??0,duration:note.duration??duration}));
 const assets=await prepareNativeAssets(nativeRequiredAssets(events),status),plans=nativePlans(events,assets);
 const cycle=Math.max(.05,...plans.map(plan=>plan.graphEnd));
 return nativeRequest({action:'play',data:Array.from(encodeNativeSession(plans,status.sampleRate)),cycle,seek:0,looping:false,preview:true});
}
export async function playNative(document,events,{loop=false,onPosition=()=>{},onProgress=()=>{},onStop=()=>{},onStart=()=>{},startStep=0}={}){
 const epoch=++transportEpoch;
 // Validate every audible instruction before publishing any of the session.
 // No catch here may route an unsupported project to the browser backend.
 const ids=nativeRequiredAssets(events),unit=60/document.bpm/4;
 const steps=document.kind==='song'?document.nativeLengthSteps:document.bars*16;
 const cycle=steps*unit;
 if(!steps)throw Error('Add a Beat clip before playing this Song');
 if(!Number.isFinite(cycle)||cycle>600)throw Error('Native preview supports music up to 10 minutes');
 const info=await ensureNativeOutput(),assets=await prepareNativeAssets(ids,info),plans=nativePlans(events,assets,unit),data=Array.from(encodeNativeSession(plans,info.sampleRate));
 if(epoch!==transportEpoch)throw Error('Native playback request cancelled');
 let {owner}=await nativeRequest({action:'begin'});
 if(epoch!==transportEpoch)throw Error('Native playback request cancelled');
 const loops=()=>typeof loop==='function'?loop():loop;
 await nativeRequest({action:'play',data,cycle,seek:Math.min(Math.max(0,startStep*unit),cycle-unit),looping:!!loops(),preview:false,owner});
 if(epoch!==transportEpoch){await nativeRequest({action:'control',command:1,looping:false,owner});throw Error('Native playback request cancelled');}
 let stopped=false,paused=false,polling=false,seeks=0,seekGeneration=0,timer,lastLoop=!!loops();
 const finish=()=>{if(stopped)return;stopped=true;clearInterval(timer);onStop();};
 const reportError=message=>{globalThis.dispatchEvent?.(new CustomEvent('premidi-native-error',{detail:message}));finish();};
 async function tick(){
  if(stopped||polling||seeks)return;polling=true;
  try{
   if(!!loops()!==lastLoop){lastLoop=!!loops();await nativeRequest({action:'control',command:0,looping:lastLoop,owner});}
   const status=await nativeRequest({action:'status'});
   if(stopped||seeks)return;
   if(status.owner!==owner){finish();return;}
   if(status.deviceLost){reportError('Native audio output changed or disconnected. Select the output again in Settings.');return;}
   if(status.fault){reportError('Native playback stopped: callback capacity exceeded ('+status.fault+'). Reduce note density.');return;}
   if(status.state===3||status.state===0){finish();return;}
   const step=(status.positionSeconds%cycle)/unit,bar=Math.floor(step/16),local=step%16;
   onPosition(bar,Math.floor(local));onProgress(bar,local);
  }catch(error){reportError(String(error));}finally{polling=false;}
 }
 onStart({backend:'native-cpp',sampleRate:info.sampleRate});
 timer=setInterval(()=>void tick(),40);
 return {
  backend:'native-cpp',get paused(){return paused;},
  async pause(){await nativeRequest({action:'control',command:2,looping:!!loops(),owner});paused=true;},
  async resume(){await nativeRequest({action:'control',command:3,looping:!!loops(),owner});paused=false;},
  async seek(step){
   const generation=++seekGeneration;seeks++;
   try{
    const claim=await nativeRequest({action:'begin'});if(stopped||generation!==seekGeneration)return;owner=claim.owner;
    await nativeRequest({action:'play',data,cycle,seek:Math.min(Math.max(0,step*unit),cycle-unit),looping:!!loops(),preview:false,owner});paused=false;
   }finally{seeks--;}
  },
  async stop(){if(stopped)return;finish();await nativeRequest({action:'control',command:1,looping:false,owner});},
  get diagnostics(){return {backend:'native-cpp',snapshot:true};}
 };
}
