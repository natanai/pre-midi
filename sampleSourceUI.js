import {renderAudioWaveform} from './audioWaveform.js';
import {decodeRecordedAsset} from './recordedAssetDecode.js';
import {sampleSourceRegion,sampleZoneWithRegion} from './sampleSlice.js';
const opened=new Set(),selected=new Map();
// A source slot in the existing Inspector, using the vocal waveform editor.
// Decode only on disclosure; no waveform work joins the transport command path.
export function renderSampleSource(patch,context,onChange,soundId){
 const details=document.createElement('details');details.className='synth-group sample-source-editor';
 const heading=document.createElement('summary');heading.textContent='source region';details.append(heading);
 const select=document.createElement('select');select.setAttribute('aria-label','sample source region');
 patch.zones.forEach((zone,index)=>{const asset=context.samples?.find(a=>a.id===zone.assetId),option=document.createElement('option');option.value=String(index);option.textContent=(index+1)+' · '+(asset?.name??zone.assetId);select.append(option);});
 select.value=String(Math.min(selected.get(soundId)??0,patch.zones.length-1));select.hidden=patch.zones.length===1;
 const slot=document.createElement('div'),status=document.createElement('output');status.setAttribute('role','status');details.append(select,slot,status);
 let generation=0;
 const show=async()=>{
  const token=++generation,index=Number(select.value),zone=patch.zones[index],asset=context.samples?.find(a=>a.id===zone.assetId);
  slot.replaceChildren();status.textContent='';if(!asset){status.textContent='recording audio is unavailable';return;}
  try{
   const buffer=await decodeRecordedAsset(asset);if(token!==generation||!details.isConnected||!details.open)return;
   const region=sampleSourceRegion(zone,buffer.duration),end=region.offset+region.sourceLength;
   const apply=(start,end)=>{try{const next=sampleZoneWithRegion(zone,start,end,buffer.duration);status.textContent='';onChange(['zones',index],next);}catch(error){const message=error.message,restoreToken=generation+1;void show().then(()=>{if(generation===restoreToken&&details.isConnected)status.textContent=message;});}};
   slot.append(renderAudioWaveform({recording:{...asset,durationSeconds:buffer.duration,trimSeconds:0},trimStart:region.offset,trimEnd:Math.max(0,buffer.duration-end),onTrim:start=>apply(start,end),onTrimEnd:trim=>apply(region.offset,buffer.duration-trim),loadDecoded:()=>Promise.resolve(buffer)}));
  }catch(error){if(token===generation&&details.isConnected)status.textContent=error.message;}
 };
 select.addEventListener('change',()=>{selected.set(soundId,Number(select.value));void show();});
 details.addEventListener('toggle',()=>{if(details.open){opened.add(soundId);void show();}else{opened.delete(soundId);generation++;}});
 details.open=opened.has(soundId);return details;
}
