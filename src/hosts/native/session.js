import {encodeNativePlan} from './plan.js';
import {resolveEvent} from '../../../soundModel.js';
import {planSynthVoice} from '../../dsp/synth-voice.js';

export const nativeEnabled=()=>!!globalThis.__TAURI__?.core?.invoke&&(localStorage.getItem('premidi-audio-backend')||'native')==='native';
export const nativeRequest=request=>globalThis.__TAURI__.core.invoke('native_audio',{request});
let transportEpoch=0;
export async function cancelNativeTransport(){transportEpoch++;return nativeRequest({action:'control',command:1,looping:false,owner:null});}
export function unsupportedNativeFeatures(patch){
 if(patch?.type!=='synth')return ['sample/recording playback'];
 return [patch.noise!==0&&'noise',patch.effects.drive!==0&&'effects.drive',patch.effects.delayMix!==0&&'effects.delayMix',
  (patch.filter.sweep??0)!==0&&'filter.sweep',...(patch.movement?['depth','tone','tremolo'].filter(key=>patch.movement[key]!==0).map(key=>'movement.'+key):[])].filter(Boolean);
}
export function encodeNativeSession(plans,rate){
 if(plans.length>4096)throw Error('Native preview supports at most 4096 note onsets per cycle');
 const packets=plans.map(plan=>encodeNativePlan(plan,rate,1));
 const bytes=new Uint8Array(8+packets.reduce((sum,packet)=>sum+4+packet.length,0));
 if(bytes.length>16*1024*1024)throw Error('Native session exceeds 16 MiB');
 const view=new DataView(bytes.buffer);view.setUint32(0,0x31534d50,true);view.setUint32(4,packets.length,true);let offset=8;
 for(const packet of packets){view.setUint32(offset,packet.length,true);offset+=4;bytes.set(packet,offset);offset+=packet.length;}
 return bytes;
}
export function nativePlans(events){
 return events.map(event=>{
  if(event.kind==='vocal')throw Error('Native recording playback is not implemented. Select Web Audio in Settings to play this Song.');
  const resolved=event.instrument.sounds?resolveEvent(event.instrument,event.note):{voice:event.instrument,note:event.note};
  if(!resolved)throw Error('Native playback found an unresolved sound identity');
  const {voice,note}=resolved,unsupported=unsupportedNativeFeatures(voice.patch);
  if(unsupported.length)throw Error(`${event.instrument.name||'Sound'}: native playback does not yet support ${unsupported.join(', ')}. Choose a supported preset (Init, Triangle Keys, Touch Keys), or explicitly select Web Audio in Settings.`);
  const duration=event.instrument.layout==='rack'?Math.max(.015,voice.patch.envelope.attack+voice.patch.envelope.decay):event.duration;
  return planSynthVoice(voice,note,event.at,duration,{automation:event.instrument.automation,timeline:event.timeline});
 });
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
 const plans=notes.map(note=>planSynthVoice(instrument,note,note.at??0,note.duration??duration));
 const cycle=Math.max(.05,...plans.map(plan=>plan.graphEnd));
 return nativeRequest({action:'play',data:Array.from(encodeNativeSession(plans,status.sampleRate)),cycle,seek:0,looping:false,preview:true});
}
export async function playNative(document,events,{loop=false,onPosition=()=>{},onProgress=()=>{},onStop=()=>{},onStart=()=>{},startStep=0}={}){
 const epoch=++transportEpoch;
 // Validate every audible instruction before publishing any of the session.
 // No catch here may route an unsupported project to the browser backend.
 const plans=nativePlans(events),unit=60/document.bpm/4;
 const steps=document.kind==='song'?document.nativeLengthSteps:document.bars*16;
 const cycle=steps*unit;
 if(!steps)throw Error('Add a Beat clip before playing this Song');
 if(!Number.isFinite(cycle)||cycle>600)throw Error('Native preview supports music up to 10 minutes');
 const info=await ensureNativeOutput(),data=Array.from(encodeNativeSession(plans,info.sampleRate));
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
