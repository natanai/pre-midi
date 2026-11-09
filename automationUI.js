import {MAX_AUTOMATION_POINTS,MAX_AUTOMATION_LANES,automationParameters,validateAutomation,insertAutomationPoint} from './src/dsp/automation.js';
import {readSoundParameter} from './soundParameterAdapter.js';
import {illustrateSoundPanel} from './soundIllustrations.js';
import {assignSoundEdit} from './soundEditPath.js';
import {explainLabel} from './dial.js';
const opened=new Set();
export function renderAutomation(root,instrument,beat,onChange){
 const patch=instrument.sounds?.[0]?.patch;if(!patch)return;
 const lanes=instrument.automation??[],parameters=automationParameters(patch);
 const panel=document.createElement('details');panel.className='parameter-automation synth-group';panel.open=opened.has(instrument.id);panel.dataset.automationOwner=instrument.id;
 panel.addEventListener('toggle',()=>{if(panel.open)opened.add(instrument.id);else opened.delete(instrument.id);});
 const summary=document.createElement('summary');summary.textContent='automation';explainLabel(summary,'automation');panel.append(summary);root.append(panel);
 const commit=(next,control)=>{
  const errors=validateAutomation(next,patch,beat.bars);
  if(errors.length){control?.setCustomValidity?.(errors[0]);control?.reportValidity?.();return;}
  control?.setCustomValidity?.('');opened.add(instrument.id);onChange(next.length?next:undefined);
  if(control?.dataset.automationControl)document.querySelector('[data-automation-owner="'+instrument.id+'"] [data-automation-control="'+control.dataset.automationControl+'"]')?.focus({preventScroll:true});
 };
 for(const lane of lanes){
  const p=parameters.find(p=>p.id===lane.target);if(!p)continue;
  const details=document.createElement('details');details.className='automation-lane synth-group';details.open=true;details.dataset.automationId=lane.id;
  const heading=document.createElement('summary');heading.textContent=lane.target.replaceAll('.',' ');details.append(heading);panel.append(details);
  const change=next=>commit(lanes.map(old=>old.id===lane.id?next:old));
  const controls=document.createElement('div');controls.className='synth-fields';details.append(controls);
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=!lane.bypass;enabled.setAttribute('aria-label','enable '+heading.textContent+' automation');enabled.addEventListener('change',()=>change({...lane,bypass:!enabled.checked}));const enabledLabel=document.createElement('label');enabledLabel.append(enabled,'enabled');controls.append(enabledLabel);
  const mode=document.createElement('select');mode.setAttribute('aria-label',heading.textContent+' interpolation');for(const value of ['linear','exponential','step']){const option=document.createElement('option');option.value=value;option.textContent=value;option.disabled=value==='exponential'&&lane.points.some(point=>point.value<=0);mode.append(option);}mode.value=lane.interpolation;mode.addEventListener('change',()=>change({...lane,interpolation:mode.value}));controls.append(mode);
  const pictureDetails=document.createElement('details');pictureDetails.className='synth-group';pictureDetails.open=true;const title=document.createElement('summary');title.textContent='curve';pictureDetails.append(title);
  const visual=illustrateSoundPanel(pictureDetails,'automation',{...lane,type:'automation',sourceType:patch.type,bars:beat.bars,parameter:p},(path,value)=>{const next=structuredClone(lane);assignSoundEdit(next,path,value);change(next);},()=>{},instrument.id+':'+lane.id);details.append(visual.element);
  for(const [index,point]of lane.points.entries()){
   const row=document.createElement('fieldset');row.className='automation-point';const legend=document.createElement('legend');legend.textContent=index===0?'begin':index===lane.points.length-1?'end':'point '+(index+1);row.append(legend);
   const update=(key,value,control)=>commit(lanes.map(old=>old.id===lane.id?{...lane,points:lane.points.map((old,i)=>i===index?{...old,[key]:value}:old).sort((a,b)=>a.step-b.step)}:old),control);
   for(const [key,min,max,step]of [['step',0,beat.bars*16,1],['value',p.min,p.max,p.ui.step]]){
    const label=document.createElement('label'),input=document.createElement('input');label.textContent=key==='step'?'step':['hz','cents'].includes(p.unit)?'value '+p.unit:'value';input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(point[key]);input.dataset.automationControl=lane.id+'-'+point.id+'-'+key;input.setAttribute('aria-label',legend.textContent+' '+key);input.addEventListener('change',()=>update(key,Number(input.value),input));label.dataset.soundPath='points.'+index+'.'+key;label.append(input);row.append(label);
   }
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','remove '+legend.textContent);remove.disabled=lane.points.length<=2;remove.addEventListener('click',()=>change({...lane,points:lane.points.filter(p=>p.id!==point.id)}));row.append(remove);pictureDetails.append(row);
  }
  const add=document.createElement('button');add.type='button';add.textContent='+ point';add.disabled=lane.points.length>=MAX_AUTOMATION_POINTS||!lane.points.some((p,i)=>i&&p.step-lane.points[i-1].step>1);add.addEventListener('click',()=>change(insertAutomationPoint(lane)));details.append(add);
  const remove=document.createElement('button');remove.type='button';remove.textContent='remove lane';remove.addEventListener('click',()=>commit(lanes.filter(old=>old.id!==lane.id)));details.append(remove);
 }
 const select=document.createElement('select');select.setAttribute('aria-label','automation target');for(const p of parameters.filter(p=>!lanes.some(lane=>lane.target===p.id))){const option=document.createElement('option');option.value=p.id;option.textContent=p.id.replaceAll('.',' ');select.append(option);}panel.append(select);
 const add=document.createElement('button');add.type='button';add.textContent='+ automation';add.disabled=lanes.length>=MAX_AUTOMATION_LANES||!select.options.length;add.addEventListener('click',()=>{
  const p=parameters.find(p=>p.id===select.value),value=p.id.startsWith('processor.')?(()=>{const [,id,key]=p.id.split('.');return patch.chain.instances.find(i=>i.id===id).parameters[key];})():readSoundParameter(patch,p.id);
  commit([...lanes,{id:crypto.randomUUID(),version:1,target:p.id,unit:p.unit,interpolation:p.interpolation,points:[{id:crypto.randomUUID(),step:0,value},{id:crypto.randomUUID(),step:Math.min(16,beat.bars*16),value}]}]);
 });panel.append(add);
}
