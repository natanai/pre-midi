import {DYNAMICS_KINDS,MAX_DYNAMICS} from './src/dsp/dynamics.js';
import {renderProcessorInstance} from './processorInstanceUI.js';
import {allProcessorIds,processorOrders,processorInstance,processorKind,withInstance,withParallelRoute,withRouteShare,moveProcessor,MAX_PROCESSORS,PRIMARY_PROCESSORS,PROCESSOR_KINDS} from './src/dsp/processing-graph.js';
import {processingChain,processorMix,DELAY_DIVISIONS,withProcessorBypass,withProcessorAdded,withProcessorRemoved} from './src/dsp/processing-chain.js';
import {DEFAULT_SAMPLE_FILTER} from './audioEffects.js';
const openBySound=new Map();
export function renderProcessingChain(patch,onChange,soundId=null,onPreview=()=>{}){
 const chain=processingChain(patch),root=document.createElement('details');root.className='synth-group processing-chain';
 const key=soundId??patch;root.open=openBySound.get(key)??false;root.dataset.soundPath='chain';
 root.addEventListener('toggle',()=>openBySound.set(key,root.open));
 let blendGraph=null;
 const paintShares=next=>{
  for(const control of root.querySelectorAll('[data-processing-share]')){
   const id=control.dataset.processingShare,value=id==='dry'?next.dry??0:next.parallel?.find(r=>r.id===id)?.gain??0;
   if(control.tagName==='INPUT')control.value=String(value);else control.textContent=Math.round(value*100)+'%';
  }
  for(const point of blendGraph?.querySelectorAll('[data-blend-route]')??[]){const id=point.dataset.blendRoute,value=id==='dry'?next.dry??0:next.parallel?.find(r=>r.id===id)?.gain??0;point.setAttribute('cx',String(70+230*value));point.setAttribute('aria-valuenow',String(value));}
 };
 const previewShare=(id,value)=>{const next=withRouteShare(chain,id,value);paintShares(next);onPreview(['chain'],next);return next;};
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
 const title=id=>{const kind=processorKind(patch,id)??id,name=kind==='eq'?'equalizer':kind==='drive'?'distortion':kind==='delay'?'delay send':kind==='deesser'?'de-esser':kind;return processorInstance(patch,id)?name+' '+(Number(id.match(/-(\d+)$/)?.[1]??0)+(PRIMARY_PROCESSORS.includes(kind)?1:0)):name;};
 const row=(id,index,routeId='serial',parent=list)=>{
  const order=routeId==='serial'?chain.order:routeId==='post'?chain.post:chain.parallel.find(r=>r.id===routeId).order;
  const item=document.createElement(id==='delay'?'div':'li'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';
  check.checked=!chain.bypass.includes(id)&&!(id==='filter'&&patch.filter==null);
  const name=title(id);
  check.setAttribute('aria-label','Enable '+name);check.title='bypass '+name+' without losing its settings';
  check.dataset.processingControl=id+'-toggle';
  check.addEventListener('change',()=>{
   const next=withProcessorBypass(patch,id,!check.checked);
   if(check.checked&&id==='filter'&&patch.filter==null)commit([['chain'],['filter']],[next,{...DEFAULT_SAMPLE_FILTER}],check,id);
   else commit(['chain'],next,check,id);
  });
  label.append(check,document.createTextNode(name));item.append(label);
  if(id==='filter'){
   const slope=document.createElement('select');slope.setAttribute('aria-label','filter slope');slope.dataset.processingControl='filter-slope';
   for(const n of [1,2,4]){const option=document.createElement('option');option.value=String(n);option.textContent=String(n*12)+' db/oct';slope.append(option);}slope.value=String(patch.filterStages??1);slope.title='additional stages steepen the cutoff; resonance stays on the first stage';slope.addEventListener('change',()=>commit(['filterStages'],Number(slope.value),slope,id));item.append(slope);
  }
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
   move.disabled=index+direction<0||index+direction>=order.length;
   move.addEventListener('click',()=>{const next=structuredClone(chain),order=routeId==='serial'?next.order:routeId==='post'?next.post:next.parallel.find(r=>r.id===routeId).order;[order[index],order[index+direction]]=[order[index+direction],order[index]];commit(['chain'],next,move,id);});item.append(move);
  }
  if(id!=='delay'){
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove '+name+' from chain');remove.title='remove from chain and retain its settings';remove.dataset.processingControl=id+'-remove';
   remove.addEventListener('click',()=>commit(['chain'],withProcessorRemoved(patch,id),remove,'add'));item.append(remove);
  }
  if(id!=='delay'&&routeId!=='post'&&chain.parallel?.length){
   const route=document.createElement('select');route.setAttribute('aria-label','route for '+name);route.dataset.processingControl=id+'-route';
   for(const [value,label]of [['serial','serial'],...chain.parallel.map((r,i)=>[r.id,'parallel '+(i+1)])]){const option=document.createElement('option');option.value=value;option.textContent=label;route.append(option);}
   route.value=routeId;route.addEventListener('change',()=>commit(['chain'],moveProcessor(chain,id,route.value),route,id));item.append(route);
  }
  if(id==='delay')root.append(item);else parent.append(item);
  const instance=processorInstance(patch,id);if(instance)item.append(renderProcessorInstance(patch,instance,onChange,onPreview,key,name));
 };
 chain.order.forEach((id,i)=>row(id,i));
 for(const [index,branch]of (chain.parallel??[]).entries()){
  const group=document.createElement('fieldset'),heading=document.createElement('legend'),routeList=document.createElement('ol');heading.textContent='parallel '+(index+1);group.append(heading,routeList);root.append(group);branch.order.forEach((id,i)=>row(id,i,branch.id,routeList));
  const share=document.createElement('input');share.type='range';share.min='0';share.max='1';share.step='.01';share.value=String(branch.gain);share.setAttribute('aria-label','parallel '+(index+1)+' share');share.dataset.processingControl=branch.id+'-share';share.dataset.processingShare=branch.id;share.title='blend this route with the other routes';share.addEventListener('input',()=>previewShare(branch.id,Number(share.value)));share.addEventListener('change',()=>commit(['chain'],withRouteShare(chain,branch.id,Number(share.value)),share,branch.id));const shareValue=document.createElement('output');shareValue.dataset.processingShare=branch.id;group.append(share,shareValue);
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','remove parallel '+(index+1));remove.title='return its processors to the serial chain';remove.dataset.processingControl=branch.id+'-remove';remove.addEventListener('click',()=>{const next=structuredClone(chain);next.order.push(...branch.order);next.parallel=next.parallel.filter(r=>r.id!==branch.id);if(next.parallel.length){const remaining=(next.dry??0)+next.parallel.reduce((n,r)=>n+r.gain,0);if(remaining){next.dry=(next.dry??0)/remaining;for(const r of next.parallel)r.gain/=remaining;}}else{delete next.parallel;delete next.dry;}commit(['chain'],next,remove,'add');});group.append(remove);
 }
 if(chain.parallel?.length){const dry=document.createElement('input');dry.type='range';dry.min='0';dry.max='1';dry.step='.01';dry.value=String(chain.dry??0);dry.setAttribute('aria-label','parallel dry share');dry.title='blend the unsplit serial signal with the parallel routes';dry.dataset.processingControl='dry-share';dry.dataset.processingShare='dry';dry.addEventListener('input',()=>previewShare('dry',Number(dry.value)));dry.addEventListener('change',()=>commit(['chain'],withRouteShare(chain,'dry',Number(dry.value)),dry,'add'));const dryLabel=document.createElement('label'),dryValue=document.createElement('output');dryValue.dataset.processingShare='dry';dryLabel.append(document.createTextNode('dry '),dry,dryValue);root.append(dryLabel);}
 if(chain.parallel?.length){
  const ns='http://www.w3.org/2000/svg',routes=[['dry','dry'],...chain.parallel.map((r,i)=>[r.id,'parallel '+(i+1)])];
  blendGraph=document.createElementNS(ns,'svg');blendGraph.setAttribute('viewBox','0 0 345 '+(routes.length*28+12));blendGraph.style.width='100%';blendGraph.style.touchAction='none';blendGraph.setAttribute('aria-label','parallel processing blend');root.append(blendGraph);
  for(const [i,[id,name]]of routes.entries()){
   const y=20+i*28,line=document.createElementNS(ns,'path'),label=document.createElementNS(ns,'text'),point=document.createElementNS(ns,'circle'),value=document.createElementNS(ns,'text');
   line.setAttribute('d','M70 '+y+' H300');line.setAttribute('stroke','#666');label.setAttribute('x','2');label.setAttribute('y',String(y+3));label.setAttribute('fill','currentColor');label.setAttribute('font-size','8');label.textContent=name;
   point.setAttribute('r','5');point.setAttribute('cy',String(y));point.setAttribute('tabindex','0');point.setAttribute('role','slider');point.setAttribute('aria-label',name+' share');point.setAttribute('aria-valuemin','0');point.setAttribute('aria-valuemax','1');point.setAttribute('fill','var(--track-accent,#08e4ec)');point.setAttribute('stroke','currentColor');point.dataset.blendRoute=id;point.dataset.processingControl=id+'-blend';
   value.setAttribute('x','307');value.setAttribute('y',String(y+3));value.setAttribute('font-size','8');value.setAttribute('fill','currentColor');value.dataset.processingShare=id;blendGraph.append(line,label,point,value);
   let drag=null,last=0;
   point.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag=e.pointerId;last=Number(point.getAttribute('aria-valuenow'));point.focus({preventScroll:true});point.setPointerCapture(e.pointerId);});
   point.addEventListener('pointermove',e=>{if(e.pointerId!==drag)return;const box=blendGraph.getBoundingClientRect();last=Math.round(Math.max(0,Math.min(1,((e.clientX-box.left)/box.width*345-70)/230))*100)/100;previewShare(id,last);});
   point.addEventListener('pointerup',e=>{if(e.pointerId!==drag)return;drag=null;commit(['chain'],withRouteShare(chain,id,last),point,'add');});
   point.addEventListener('pointercancel',()=>{drag=null;paintShares(chain);onPreview(['chain'],chain);});
   point.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const value=e.key==='Home'?0:e.key==='End'?1:Number(point.getAttribute('aria-valuenow'))+(['ArrowLeft','ArrowDown'].includes(e.key)?-.01:.01);commit(['chain'],withRouteShare(chain,id,value),point,'add');});
  }
  paintShares(chain);
 }
 if(chain.post?.length){const group=document.createElement('fieldset'),heading=document.createElement('legend'),list=document.createElement('ol');group.className='post-processing-order';heading.textContent='after level + pan';heading.title='each note or vocal clip has its own stereo-linked dynamics before mixing and echo sends';group.append(heading,list);root.append(group);chain.post.forEach((id,i)=>row(id,i,'post',list));}
 const available=allProcessorIds(chain).filter(id=>!processorOrders(chain).some(order=>order.includes(id)));
 const instanceType=document.createElement('select');instanceType.setAttribute('aria-label','new processor type');instanceType.dataset.processingControl='instance-type';
 for(const [prefix,ids]of [['stored',available],['new',PROCESSOR_KINDS]])for(const id of ids){const option=document.createElement('option');option.value=prefix+':'+id;option.textContent=prefix+' '+title(id);option.disabled=(prefix==='new'&&(chain.instances?.length??0)>=MAX_PROCESSORS)||(DYNAMICS_KINDS.includes(prefix==='new'?id:processorKind(patch,id))&&(chain.post?.length??0)>=MAX_DYNAMICS);instanceType.append(option);}
 if(instanceType.selectedOptions[0]?.disabled)instanceType.value=Array.from(instanceType.options).find(option=>!option.disabled)?.value??'';
 const addInstance=document.createElement('button');addInstance.type='button';addInstance.textContent='+ processor';addInstance.dataset.processingControl='add-instance';addInstance.disabled=processorOrders(chain).flat().length>=MAX_PROCESSORS||!instanceType.value;addInstance.title=addInstance.disabled?'eight processors are already in use':'add an independent processor';addInstance.addEventListener('click',()=>{const [mode,id]=instanceType.value.split(':');if(mode==='new')commit(['chain'],withInstance(patch,id),addInstance,'add');else{const next=withProcessorAdded(patch,id);if(id==='filter'&&patch.filter==null)commit([['chain'],['filter']],[next,{...DEFAULT_SAMPLE_FILTER}],addInstance,id);else commit(['chain'],next,addInstance,id);}});
 const addRoute=document.createElement('button');addRoute.type='button';addRoute.textContent='+ parallel';addRoute.dataset.processingControl='add-route';addRoute.disabled=(chain.parallel?.length??0)>=4;addRoute.title=addRoute.disabled?'four parallel routes are already in use':'split the serial output into independently processed routes';addRoute.addEventListener('click',()=>commit(['chain'],withParallelRoute(patch),addRoute,'add'));
 root.append(instanceType,addInstance,addRoute);
 row('delay');
 const timing=document.createElement('select');timing.setAttribute('aria-label','delay timing');timing.dataset.processingControl='delay-timing';
 for(const [value,label] of [['seconds','seconds'],...DELAY_DIVISIONS.map(n=>[String(n),n===.25?'1/16 note':n===.5?'1/8 note':n===.75?'dotted 1/8':'1/4 note'])]){const option=document.createElement('option');option.value=value;option.textContent=label;timing.append(option);}
 timing.value=String(patch.delaySync??'seconds');timing.addEventListener('change',()=>commit(['delaySync'],timing.value==='seconds'?undefined:Number(timing.value),timing,'delay'));root.append(timing);return root;
}
