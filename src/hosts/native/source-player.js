import {nativeEnabled,nativeRequest,ensureNativeOutput,encodeNativeSession} from './session.js';
import {planNativeVocal} from './sample-plan.js';
// Raw recording previews share the native preview lane with Hear sound.
export function nativeSourcePlayer(element,{onError=()=>{}}={}){
 const controls=document.createElement('span'),button=document.createElement('button'),seek=document.createElement('input');
 controls.className='native-audio-player';controls.style.cssText='display:inline-flex;gap:.5rem;align-items:center;width:100%';
 button.type='button';button.textContent='▶';button.setAttribute('aria-label','play recording');
 seek.type='range';seek.min='0';seek.max='0';seek.step='.01';seek.value='0';seek.setAttribute('aria-label','recording position');seek.style.flex='1';
 controls.append(button,seek);element.after(controls);controls.hidden=true;
 let blob=null,asset=null,assetGeneration,owner=null,timer,position=0,duration=0,base=0,active=false,paused=false,revision=0,polling=false;
 const show=()=>{button.innerHTML='<svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">'+(active&&!paused?'<path d="M2 1h3v10H2zM7 1h3v10H7z"/>':'<path d="M2 1l9 5-9 5z"/>')+'</svg>';button.setAttribute('aria-label',active&&!paused?'pause recording':'play recording');seek.value=String(Math.min(duration,position));};
 function clear(){clearInterval(timer);timer=null;active=paused=false;owner=null;show();}
 async function stop(){revision++;const prior=owner;clear();if(prior!==null)await nativeRequest({action:'preview_control',command:1,owner:prior});}
 async function start(){
  const version=++revision,source=blob;if(!source)return;const info=await ensureNativeOutput();
  if(assetGeneration!==info.generation+':'+info.sampleRate){asset=null;assetGeneration=info.generation+':'+info.sampleRate;}
  let loaded=asset;if(!loaded){const bytes=new Uint8Array(await source.arrayBuffer());loaded=await nativeRequest({action:'asset',data:Array.from(bytes),rate:info.sampleRate});loaded.duration=loaded.frames/loaded.rate;}
  if(version!==revision||source!==blob)return;asset=loaded;duration=asset.duration;seek.max=String(duration);base=Math.min(Math.max(0,position),Math.max(0,duration-.006));
  const plan=planNativeVocal({recording:{id:'raw',trimSeconds:base,durationSeconds:duration},clip:{gain:1/.85,lengthSteps:duration}},0,1,new Map([['raw',asset]]));
  if(!plan)return;const claim=await nativeRequest({action:'begin'});if(version!==revision)return;owner=claim.owner;
  await nativeRequest({action:'play',data:Array.from(encodeNativeSession([plan],info.sampleRate)),cycle:Math.max(.05,plan.graphEnd),seek:0,looping:false,preview:true,owner});
  if(version!==revision){await nativeRequest({action:'preview_control',command:1,owner:claim.owner});return;}
  active=true;paused=false;show();clearInterval(timer);
  timer=setInterval(async()=>{if(polling||!active)return;polling=true;try{
   const state=await nativeRequest({action:'status'});if(version!==revision)return;
   if(state.deviceLost)throw Error('native audio output changed or disconnected');
   if(state.previewOwner!==owner||state.previewState===0||state.previewState===3){position=0;clear();return;}
   position=base+state.previewSeconds;show();
  }catch(error){clear();onError(error);}finally{polling=false;}},40);
 }
 button.addEventListener('click',()=>{void(async()=>{if(!active)return start();await nativeRequest({action:'preview_control',command:paused?3:2,owner});paused=!paused;show();})().catch(onError);});
 seek.addEventListener('change',()=>{const next=Number(seek.value),resume=active&&!paused;void stop().then(()=>{position=next;show();if(resume)return start();}).catch(onError);});
 return {
  set(value){void stop().catch(onError);blob=value;asset=null;position=duration=base=0;seek.max='0';show();const native=nativeEnabled();element.hidden=native;controls.hidden=!native;button.disabled=!blob;seek.disabled=!blob;return native;},
  stop
 };
}
