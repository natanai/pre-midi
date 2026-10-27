import {explainUnit,explainLabel} from './dial.js';
const opened=new Set();
export function renderCutoffAutomation(root,instrument,beat,onChange){
 if(instrument.layout!=='pitched'||instrument.sounds[0].patch.type!=='synth')return;
 const patch=instrument.sounds[0].patch,block=instrument.automation,dial=root.querySelector('[aria-label="Cutoff"]')?.closest('.dial-field'),group=dial?.closest('.synth-group');if(!group)return;
 const toggle=document.createElement('button');toggle.type='button';toggle.className='automation-toggle';toggle.textContent=block?'cutoff over time':'move over time';toggle.setAttribute('aria-label',block?'Edit cutoff automation':'Automate cutoff');
 toggle.addEventListener('click',()=>{
  if(!block){opened.add(instrument.id);onChange({version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',points:[{id:crypto.randomUUID(),step:0,value:patch.filter.cutoff},{id:crypto.randomUUID(),step:Math.min(16,beat.bars*16),value:Math.max(50,patch.filter.cutoff/4)}]});}
  else{const panel=root.querySelector('.cutoff-automation');panel.open=!panel.open;if(panel.open)panel.scrollIntoView({block:'nearest'});}
 });if(!block)dial.append(toggle);
 if(!block)return;
 const panel=document.createElement('details');panel.className='cutoff-automation';panel.open=opened.has(instrument.id);panel.addEventListener('toggle',()=>{if(panel.open)opened.add(instrument.id);else opened.delete(instrument.id);});
 const summary=document.createElement('summary'),heading=document.createElement('span');heading.textContent='cutoff over time';explainLabel(heading,'cutoff timeline');summary.append(heading);panel.append(summary);
 const update=(index,values)=>onChange({...block,points:block.points.map((point,i)=>i===index?{...point,...values}:point)});
 for(const [index,point] of block.points.entries()){
  const row=document.createElement('fieldset');row.className='automation-point';const legend=document.createElement('legend');legend.textContent=index?'end':'begin';row.append(legend);
  const position={bar:Math.floor(point.step/16)+1,beat:(point.step%16)/4+1};
  for(const key of ['bar','beat']){
   const label=document.createElement('label'),title=document.createElement('span'),input=document.createElement('input');title.textContent=key;explainLabel(title,'automation '+key);label.className='synth-field';input.type='number';input.min=1;input.max=key==='bar'?beat.bars+1:position.bar===beat.bars+1?1:4.75;input.step=key==='bar'?1:.25;input.value=position[key];input.setAttribute('aria-label',(index?'End ':'Begin ')+key);
   input.addEventListener('change',()=>{const next={...position,[key]:Number(input.value)};update(index,{step:(next.bar-1)*16+(next.beat-1)*4});});label.append(title,input);row.append(label);
  }
  const field=document.createElement('label'),title=document.createElement('span'),word=document.createElement('span'),unit=document.createElement('span'),input=document.createElement('input');field.className='synth-field';word.textContent='cutoff';explainLabel(word,index?'End cutoff':'Begin cutoff');unit.textContent='hz';explainUnit(unit,'hz');title.append(word,' ',unit);input.type='number';input.min=50;input.max=14000;input.step=1;input.value=point.value;input.setAttribute('aria-label',index?'End cutoff':'Begin cutoff');input.addEventListener('change',()=>update(index,{value:Number(input.value)}));field.append(title,input);row.append(field);panel.append(row);
 }
 const remove=document.createElement('button');remove.type='button';remove.textContent='remove cutoff movement';remove.addEventListener('click',()=>{opened.delete(instrument.id);onChange(null);});panel.append(remove);group.append(panel);
}
