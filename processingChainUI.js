import {processingChain,withProcessorBypass} from './src/dsp/processing-chain.js';
import {DEFAULT_SAMPLE_FILTER} from './audioEffects.js';
const openBySound=new Map();
export function renderProcessingChain(patch,onChange,soundId=null){
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
  if(id!=='delay')for(const [direction,icon] of [[-1,'↑'],[1,'↓']]){
   const move=document.createElement('button');move.type='button';move.textContent=icon;
   move.setAttribute('aria-label','Move '+name+(direction<0?' earlier':' later'));move.title=move.getAttribute('aria-label');
   move.dataset.processingControl=id+(direction<0?'-up':'-down');
   move.disabled=index+direction<0||index+direction>=chain.order.length;
   move.addEventListener('click',()=>{const order=[...chain.order];[order[index],order[index+direction]]=[order[index+direction],order[index]];commit(['chain'],{...chain,order,bypass:[...chain.bypass]},move,id);});item.append(move);
  }
  if(id==='delay')root.append(item);else list.append(item);
 };
 chain.order.forEach(row);row('delay');return root;
}
