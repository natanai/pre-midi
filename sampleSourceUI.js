import {renderSampleMapping} from './sampleMappingUI.js';
import {renderAudioWaveform} from './audioWaveform.js';
import {decodeRecordedAsset} from './recordedAssetDecode.js';
import {sampleSourceRegion,sampleZoneWithRegion} from './sampleSlice.js';
import {validateSampleLoop} from './src/dsp/sample-loop.js';
import {explainLabel} from './dial.js';
const opened=new Set(),selected=new Map(),modes=new Map();
// A source slot in the existing Inspector, using the vocal waveform editor.
// Decode only on disclosure; no waveform work joins the transport command path.
export function renderSampleSource(patch,context,onChange,soundId){
 const details=document.createElement('details');details.className='synth-group sample-source-editor';
 const heading=document.createElement('summary');heading.textContent='source region';details.append(heading);
 const select=document.createElement('select');select.setAttribute('aria-label','sample source region');
 patch.zones.forEach((zone,index)=>{const asset=context.samples?.find(a=>a.id===zone.assetId),option=document.createElement('option');option.value=String(index);option.textContent=(index+1)+' · '+(asset?.name??zone.assetId);select.append(option);});
 select.value=String(Math.min(selected.get(soundId)??0,patch.zones.length-1));select.hidden=patch.zones.length===1;
 const mode=document.createElement('select');mode.setAttribute('aria-label','sample region editing');for(const [value,text]of [['crop','source crop'],['loop','sustain loop'],['mapping','key + velocity']]){const option=document.createElement('option');option.value=value;option.textContent=text;mode.append(option);}mode.value=modes.get(soundId)??'crop';
 const slot=document.createElement('div'),status=document.createElement('output');status.setAttribute('role','status');details.append(select,mode,slot,status);
 let generation=0;
 const show=async()=>{
  if(!details.isConnected||!details.open)return;
  const token=++generation,index=Number(select.value),zone=patch.zones[index],asset=context.samples?.find(a=>a.id===zone.assetId);
  slot.replaceChildren();status.textContent='';if(mode.value==='mapping'){slot.append(renderSampleMapping(zone,next=>onChange(['zones',index],next),{id:soundId,index}));return;}if(!asset){status.textContent='recording audio is unavailable';return;}
  try{
   const buffer=await decodeRecordedAsset(asset);if(token!==generation||!details.isConnected||!details.open)return;
   const region=sampleSourceRegion(zone,buffer.duration),end=region.offset+region.sourceLength;
   const apply=(start,end)=>{try{const next=sampleZoneWithRegion(zone,start,end,buffer.duration);status.textContent='';onChange(['zones',index],next);}catch(error){const message=error.message,restoreToken=generation+1;void show().then(()=>{if(generation===restoreToken&&details.isConnected)status.textContent=message;});}};
   const waveform={recording:{...asset,durationSeconds:buffer.duration,trimSeconds:0},loadDecoded:()=>Promise.resolve(buffer)};
   if(mode.value==='loop'){
    const label=document.createElement('label'),box=document.createElement('input'),word=document.createElement('span');label.className='synth-field';word.textContent='loop';explainLabel(word,'sample sustain loop',patch.oneShot?'turn off full recording playback to hear the stored loop':undefined);box.type='checkbox';box.checked=!!zone.loop;box.setAttribute('aria-label','enable sample sustain loop');label.append(word,box);slot.append(label);
    box.addEventListener('change',()=>onChange([['zones',index,'loop'],['oneShot']],[box.checked?{start:region.offset,end,crossfade:Math.floor(Math.min(.02,(end-region.offset)/2)*1000)/1000}:undefined,box.checked?false:patch.oneShot]));
    if(zone.loop){
     if(zone.loop.start<region.offset||zone.loop.end>end+1e-9){status.textContent='loop points exceed this recording region; disable the loop to reset them';return;}
     const change=fields=>{const loop={...zone.loop,...fields},error=validateSampleLoop({...zone,loop});if(error){status.textContent=error;void show().then(()=>{if(details.isConnected)status.textContent=error;});return;}onChange(['zones',index,'loop'],loop);};
     slot.append(renderAudioWaveform({...waveform,regionKind:'loop',bounds:{start:region.offset,end},trimStart:zone.loop.start,trimEnd:buffer.duration-zone.loop.end,loopFade:zone.loop.crossfade,onTrim:start=>change({start}),onTrimEnd:trim=>change({end:buffer.duration-trim}),onLoopFade:crossfade=>change({crossfade})}));
    }
   }else slot.append(renderAudioWaveform({...waveform,trimStart:region.offset,trimEnd:Math.max(0,buffer.duration-end),onTrim:start=>apply(start,end),onTrimEnd:trim=>apply(region.offset,buffer.duration-trim)}));
  }catch(error){if(token===generation&&details.isConnected)status.textContent=error.message;}
 };
 mode.addEventListener('change',()=>{modes.set(soundId,mode.value);void show();});
 select.addEventListener('change',()=>{selected.set(soundId,Number(select.value));void show();});
 details.addEventListener('toggle',()=>{if(!details.isConnected){generation++;return;}if(details.open){opened.add(soundId);void show();}else{opened.delete(soundId);generation++;}});
 details.open=opened.has(soundId);return details;
}
