import {processingChain,processorMix,DELAY_DIVISIONS,withProcessorBypass,withProcessorAdded,withProcessorRemoved} from './src/dsp/processing-chain.js';
import {DEFAULT_SAMPLE_FILTER} from './audioEffects.js';
const openBySound=new Map();
export function renderProcessingChain(patch,onChange,soundId=null,onPreview=()=>{}){
 const chain=processingChain(patch),root=document.createElement('details');root.className='synth-group processing-chain';
 const key=soundId??patch;root.open=openBySound.get(key)??false;root.dataset.soundPath='chain';
 root.addEventListener('toggle',()=>openBySound.set(key,root.open));
 const commit=(path,value,control,id)=>{
  openBySound.set(key,root.open);
  const owner=root.parentElement,positions=[];
  for(let node=root.parentElement;node;node=node.parentElement)if(node.scrollTop||node.scrollLeft)positions.push({node,top:node.scrollTop,left:node.scrollLeft});
  onChange(path,value);
  let target=owner?.querySelector('[data-processing-control="'+control.dataset.processingControl+'"]');
  if(!target||target.disabled)target=owner?.querySelector('[data-processing-control="'+id+'-toggle"]');
  target?.focus({preventScroll:true});
  for(const {node,top,left} of positions)if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}
 };
 const heading=document.createElement('summary');heading.textContent='processing order';root.append(heading);
 const list=document.createElement('ol');root.append(list);
 const row=(id,index)=>{
  const item=document.createElement(id==='delay'?'div':'li'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';
  check.checked=!chain.bypass.includes(id)&&!(id==='filter'&&patch.filter==null);
  const name=id==='drive'?'distortion':id==='delay'?'delay send':'filter';
  check.setAttribute('aria-label','Enable '+name);check.title='bypass '+name+' without losing its settings';
  check.dataset.processingControl=id+'-toggle';
  check.addEventListener('change',()=>{
   const next=withProcessorBypass(patch,id,!check.checked);
   if(check.checked&&id==='filter'&&patch.filter==null)commit([['chain'],['filter']],[next,{...DEFAULT_SAMPLE_FILTER}],check,id);
   else commit(['chain'],next,check,id);
  });
  label.append(check,document.createTextNode(name));item.append(label);
  if(id!=='delay'){
   const field=document.createElement('label');field.textContent='mix';
   const input=document.createElement('input');input.type='range';input.min='0';input.max='1';input.step='.01';input.value=String(processorMix(patch,id));input.setAttribute('aria-label',name+' wet mix');input.title='blend processed sound with the original';input.dataset.processingControl=id+'-mix';
   const output=document.createElement('output');output.textContent=Math.round(Number(input.value)*100)+'%';
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 180 44');svg.style.width='180px';svg.style.height='44px';svg.style.touchAction='none';svg.tabIndex=0;svg.setAttribute('role','slider');svg.setAttribute('aria-label',name+' original and processed blend');svg.setAttribute('aria-valuemin','0');svg.setAttribute('aria-valuemax','1');
   const dryLine=document.createElementNS(ns,'path'),wetLine=document.createElementNS(ns,'path'),point=document.createElementNS(ns,'circle');
   for(const [line,y,text] of [[dryLine,10,'original'],[wetLine,34,'processed']]){
    line.setAttribute('d','M10 22 L30 '+y+' H150 L170 22');line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');svg.append(line);
    const label=document.createElementNS(ns,'text');label.setAttribute('x','60');label.setAttribute('y',String(y+3));label.setAttribute('fill','currentColor');label.setAttribute('font-size','8');label.textContent=text;svg.append(label);
   }
   point.setAttribute('r','4');point.setAttribute('cy','22');point.setAttribute('fill','currentColor');svg.append(point);
   const paint=value=>{input.value=String(value);output.textContent=Math.round(value*100)+'%';svg.setAttribute('aria-valuenow',String(value));dryLine.setAttribute('stroke-width',String(1+3*(1-value)));wetLine.setAttribute('stroke-width',String(1+3*value));point.setAttribute('cx',String(10+160*value));};paint(processorMix(patch,id));
   const preview=value=>{paint(value);onPreview(['chain'],{...chain,mix:{...chain.mix,[id]:value}});};
   input.addEventListener('input',()=>preview(Number(input.value)));
   let drag=null;
   const position=e=>Math.round(Math.max(0,Math.min(1,((e.clientX-svg.getBoundingClientRect().left)/svg.getBoundingClientRect().width*180-10)/160))*100)/100;
   svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag=e.pointerId;svg.setPointerCapture(e.pointerId);preview(position(e));});
   svg.addEventListener('pointermove',e=>{if(e.pointerId===drag)preview(position(e));});
   svg.addEventListener('pointerup',e=>{if(e.pointerId!==drag)return;drag=null;commit(['chain'],{...chain,mix:{...chain.mix,[id]:Number(input.value)}},input,id);});
   svg.addEventListener('pointercancel',()=>{drag=null;preview(processorMix(patch,id));});
   svg.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const value=e.key==='Home'?0:e.key==='End'?1:Math.max(0,Math.min(1,Number(input.value)+(e.key==='ArrowLeft'?-.01:.01)));commit(['chain'],{...chain,mix:{...chain.mix,[id]:value}},input,id);});item.append(svg);
   input.addEventListener('change',()=>commit(['chain'],{...chain,mix:{...chain.mix,[id]:Number(input.value)}},input,id));
   field.append(input,output);item.append(field);
  }
  if(id!=='delay')for(const [direction,icon] of [[-1,'↑'],[1,'↓']]){
   const move=document.createElement('button');move.type='button';move.textContent=icon;
   move.setAttribute('aria-label','Move '+name+(direction<0?' earlier':' later'));move.title=move.getAttribute('aria-label');
   move.dataset.processingControl=id+(direction<0?'-up':'-down');
   move.disabled=index+direction<0||index+direction>=chain.order.length;
   move.addEventListener('click',()=>{const order=[...chain.order];[order[index],order[index+direction]]=[order[index+direction],order[index]];commit(['chain'],{...chain,order,bypass:[...chain.bypass]},move,id);});item.append(move);
  }
  if(id!=='delay'){
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove '+name+' from chain');remove.title='remove from chain and retain its settings';remove.dataset.processingControl=id+'-remove';
   remove.addEventListener('click',()=>commit(['chain'],withProcessorRemoved(patch,id),remove,'add'));item.append(remove);
  }
  if(id==='delay')root.append(item);else list.append(item);
 };
 chain.order.forEach(row);
 const available=['filter','drive'].filter(id=>!chain.order.includes(id));
 if(available.length){
  const choice=document.createElement('select');choice.setAttribute('aria-label','Processor to add');choice.dataset.processingControl='add-toggle';
  for(const id of available){const option=document.createElement('option');option.value=id;option.textContent=id==='drive'?'distortion':'filter';choice.append(option);}
  const add=document.createElement('button');add.type='button';add.textContent='+ add processor';add.title='restore a processor with its stored settings';add.dataset.processingControl='add-processor';
  add.addEventListener('click',()=>{
   const id=choice.value,next=withProcessorAdded(patch,id);
   if(id==='filter'&&patch.filter==null)commit([['chain'],['filter']],[next,{...DEFAULT_SAMPLE_FILTER}],add,id);
   else commit(['chain'],next,add,id);
  });root.append(choice,add);
 }
 row('delay');
 const timing=document.createElement('select');timing.setAttribute('aria-label','delay timing');timing.dataset.processingControl='delay-timing';
 for(const [value,label] of [['seconds','seconds'],...DELAY_DIVISIONS.map(n=>[String(n),n===.25?'1/16 note':n===.5?'1/8 note':n===.75?'dotted 1/8':'1/4 note'])]){const option=document.createElement('option');option.value=value;option.textContent=label;timing.append(option);}
 timing.value=String(patch.delaySync??'seconds');timing.addEventListener('change',()=>commit(['delaySync'],timing.value==='seconds'?undefined:Number(timing.value),timing,'delay'));root.append(timing);return root;
}
