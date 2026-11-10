import {DYNAMICS_KINDS,defaultDynamics,validateDynamicsParameters} from './dynamics.js';
import {parameterFor,validParameterValue,dynamicsParameter,MOD_EFFECT_PARAMETERS,POST_PROCESSOR_LIMIT} from './parameters.js';
import {MOD_EFFECT_KINDS,defaultModEffect,validModEffect} from './modulation-effects.js';
import {POST_PROCESSOR_KINDS} from './post-processing.js';
import {validateEq,eqCoefficients,defaultEq,validateFilterStages} from './equalizer.js';

export const MAX_PROCESSORS=8,MAX_PARALLEL_ROUTES=4;
export const PROCESSOR_KINDS=Object.freeze(['filter','drive','eq',...POST_PROCESSOR_KINDS]);
export const PRIMARY_PROCESSORS=Object.freeze(['filter','drive','eq']);
export const processorParameter=(kind,key)=>MOD_EFFECT_PARAMETERS[kind]?.[key]??dynamicsParameter(kind,key)??parameterFor(kind==='drive'?'effects.drive':kind==='filter'?'filter.'+key:'');
export const processorField=(kind,key,label)=>{const p=processorParameter(kind,key);return {label,min:p.min,max:p.max,step:p.ui.step,display:p.ui.display,log:p.ui.log};};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
export function validateProcessorInstance(instance){
 if(!keys(instance,['id','kind','parameters'])||typeof instance.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(instance.id)||PRIMARY_PROCESSORS.includes(instance.id)||['delay','reverb'].includes(instance.id)||!PROCESSOR_KINDS.includes(instance.kind))return ['Invalid processor instance.'];
 const p=instance.parameters;
 if(MOD_EFFECT_KINDS.includes(instance.kind))return validModEffect(instance.kind,p)?[]:['Invalid modulation effect instance.'];
 if(DYNAMICS_KINDS.includes(instance.kind))return validateDynamicsParameters(instance.kind,p)?[]:["Invalid dynamics instance."];
 if(instance.kind==='drive')return keys(p,['amount'])&&validParameterValue('effects.drive',p.amount)?[]:['Invalid distortion instance.'];
 if(instance.kind==='eq')return !object(p)||validateEq(p).length?['Invalid equalizer instance.']:[];
 return keys(p,['type','cutoff','resonance','stages'])&&validParameterValue('filter.type',p.type)&&validParameterValue('filter.cutoff',p.cutoff)&&validParameterValue('filter.resonance',p.resonance)&&validateFilterStages(p.stages).length===0?[]:['Invalid filter instance.'];
}
export function validateGraphExtensions(chain){
 const instances=chain.instances??[],parallel=chain.parallel??[];
 if(!Array.isArray(instances)||instances.length>MAX_PROCESSORS||!Array.isArray(parallel)||parallel.length>MAX_PARALLEL_ROUTES)return ['Processing supports up to eight processors and four parallel routes.'];
 const errors=instances.flatMap(validateProcessorInstance),ids=instances.map(i=>i?.id);
 if(new Set(ids).size!==ids.length)errors.push('Processor identities must be unique.');
 const post=chain.post??[];
 if(!Array.isArray(post)||post.length>POST_PROCESSOR_LIMIT||post.some(id=>!POST_PROCESSOR_KINDS.includes(instances.find(n=>n?.id===id)?.kind)))return ['Up to four post-level processors are supported.'];
 if([...(chain.order??[]),...parallel.flatMap(r=>Array.isArray(r?.order)?r.order:[])].some(id=>POST_PROCESSOR_KINDS.includes(instances.find(n=>n?.id===id)?.kind)))errors.push('Post processors belong after level and pan.');
 const available=new Set([...PRIMARY_PROCESSORS,...ids]),used=[...(chain.order??[]),...post];
 let gain=chain.dry??0;const routes=new Set();
 if(!finite(gain,0,1))errors.push('Invalid parallel dry share.');
 for(const route of parallel){
  if(!keys(route,['id','gain','order'])||typeof route.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(route.id)||['serial','dry','post'].includes(route.id)||routes.has(route.id)||!finite(route.gain,0,1)||!Array.isArray(route.order)||route.order.some(id=>!available.has(id))){errors.push('Invalid parallel route.');continue;}
  routes.add(route.id);used.push(...route.order);gain+=route.gain;
 }
 if(used.some(id=>!available.has(id))||used.length>MAX_PROCESSORS||new Set(used).size!==used.length)errors.push('Each processor belongs to one route; duplicate it to process another route.');
 if(parallel.length&&gain>1+1e-9)errors.push('Parallel shares cannot exceed 100 percent.');
 const mix=chain.mix??{};
 if(!object(mix)||Object.entries(mix).some(([id,value])=>!available.has(id)||!finite(value,0,1)))errors.push('Invalid processor mix.');
 if((chain.bypass??[]).some(id=>!available.has(id)&&!['delay','reverb'].includes(id)))errors.push('Invalid processor bypass.');
 return errors;
}
export function processorInstance(patch,id){return patch.chain?.instances?.find(p=>p.id===id)??null;}
export const allProcessorIds=chain=>[...PRIMARY_PROCESSORS,...(chain.instances??[]).map(p=>p.id)];
export const toneProcessorOrders=chain=>[chain.order,...(chain.parallel??[]).map(r=>r.order)];
export const processorOrders=chain=>[...toneProcessorOrders(chain),chain.post??[]];
export function processorKind(patch,id){return processorInstance(patch,id)?.kind??(PRIMARY_PROCESSORS.includes(id)?id:null);}
export function withInstance(patch,kind){
 if(!PROCESSOR_KINDS.includes(kind))throw Error('Unknown processor type.');
 const chain=structuredClone(patch.chain??{version:1,order:['filter','drive'],bypass:[]});
 if(processorOrders(chain).flat().length>=MAX_PROCESSORS||(chain.instances?.length??0)>=MAX_PROCESSORS)throw Error('Processing supports up to eight processors.');
 if(POST_PROCESSOR_KINDS.includes(kind)&&(chain.post?.length??0)>=POST_PROCESSOR_LIMIT)throw Error("Up to four post-level processors are supported.");
 const taken=new Set(allProcessorIds(chain));let n=1;while(taken.has(kind+'-'+n))n++;
 const instance={id:kind+'-'+n,kind,parameters:MOD_EFFECT_KINDS.includes(kind)?defaultModEffect(kind):DYNAMICS_KINDS.includes(kind)?defaultDynamics(kind):kind==='filter'?{type:'lowpass',cutoff:8000,resonance:.7,stages:1}:kind==='drive'?{amount:.2}:defaultEq()};
 chain.instances=[...(chain.instances??[]),instance];if(MOD_EFFECT_KINDS.includes(kind))(chain.mix??={})[instance.id]=kind==='autopan'?1:.5;
 if(POST_PROCESSOR_KINDS.includes(kind))(chain.post??=[]).push(instance.id);else chain.order.push(instance.id);return chain;
}
export function withParallelRoute(patch){
 const chain=structuredClone(patch.chain??{version:1,order:['filter','drive'],bypass:[]});
 const routes=chain.parallel??[];if(routes.length>=MAX_PARALLEL_ROUTES)throw Error('Processing supports up to four parallel routes.');
 const taken=new Set(routes.map(r=>r.id));let n=1;while(taken.has('route-'+n))n++;
 const count=routes.length+1;chain.parallel=[...routes.map(r=>({...r,gain:r.gain*(count-1)/count})),{id:'route-'+n,gain:1/count,order:[]}];
 chain.dry=(chain.dry??0)*(count-1)/count;return chain;
}
export function withRouteShare(chain,id,value){
 const next=structuredClone(chain),routes=next.parallel??[],bounded=Math.max(0,Math.min(1,value));
 if(id!=='dry'&&!routes.some(r=>r.id===id))throw Error('Unknown parallel route.');
 const oldOther=(id==='dry'?0:next.dry??0)+routes.reduce((n,r)=>n+(r.id===id?0:r.gain),0);
 const otherCount=routes.length;
 const scale=oldOther?(1-bounded)/oldOther:0;
 next.dry=id==='dry'?bounded:oldOther?(next.dry??0)*scale:otherCount?((1-bounded)/otherCount):0;
 for(const r of routes)r.gain=r.id===id?bounded:oldOther?r.gain*scale:otherCount?(1-bounded)/otherCount:0;
 return next;
}
export function moveProcessor(chain,id,toRoute,before=null){
 if(chain.post?.includes(id))throw Error("Post processors belong after level and pan.");
 const next=structuredClone(chain),orders=toneProcessorOrders(next);
 if(!orders.some(order=>order.includes(id)))throw Error('Processor is not in the chain.');
 const destination=toRoute==='serial'?next.order:next.parallel?.find(r=>r.id===toRoute)?.order;
 if(!destination)throw Error('Unknown processor route.');
 for(const order of orders){const at=order.indexOf(id);if(at>=0)order.splice(at,1);}
 const at=before===null?destination.length:destination.indexOf(before);
 if(at<0)throw Error('Unknown processor insertion point.');destination.splice(at,0,id);return next;
}
// One numerical recipe for native preparation and Web Audio routing. Primary
// controls keep their existing identities; added instances own independent data.
export function compileProcessingGraph(patch,rate,driveFrames=192){
 const chain=patch.chain;if(!chain)return null;
 const errors=validateGraphExtensions(chain);if(errors.length)throw Error(errors.join(' '));
 const routes=toneProcessorOrders(chain),ids=routes.flat();
 if(!(chain.parallel?.length)&&!ids.some(id=>!PRIMARY_PROCESSORS.includes(id)))return null;
 const nodes=ids.map(id=>{
  const instance=processorInstance(patch,id),kind=instance?.kind??id;
  const p=instance?.parameters??(kind==='filter'?{...(patch.filter??{type:'lowpass',cutoff:14000,resonance:.7}),stages:patch.filterStages??1}:kind==='eq'?patch.eq??defaultEq():{amount:patch.effects?.drive??patch.drive??0});
  const bypass=chain.bypass.includes(id)||(id==='filter'&&patch.filter===null),mix=chain.mix?.[id]??1;
  return {id,kind,primary:id==='filter',bypass,mix,
   type:['lowpass','highpass','bandpass','notch'].indexOf(p.type??'lowpass'),cutoff:p.cutoff??8000,resonance:p.resonance??.7,stages:p.stages??1,amount:p.amount??0,
   coefficients:Array.from({length:8},(_,i)=>p.bands?.[i]?eqCoefficients(p.bands[i],rate):[1,0,0,0,0]),
   latency:!bypass&&mix>0&&kind==='drive'&&p.amount>0?driveFrames:0};
 });
 const indexes=order=>order.map(id=>ids.indexOf(id));
 const branches=(chain.parallel??[]).map(r=>({id:r.id,gain:r.gain,order:indexes(r.order),latency:r.order.reduce((n,id)=>n+nodes[ids.indexOf(id)].latency,0)}));
 // A routed empty graph is still a real blend (including silence). The wire
 // reserves count zero for no graph, so compile one neutral EQ stage without
 // creating a musical processor or changing the authored topology.
 const order=indexes(chain.order);
 if(!nodes.length){nodes.push({id:'empty-routing',kind:'eq',primary:false,bypass:false,mix:1,type:0,cutoff:8000,resonance:.7,stages:1,amount:0,coefficients:Array.from({length:8},()=>[1,0,0,0,0]),latency:0});order.push(0);}
 return {nodes,order,branches,dry:chain.dry??0,latency:Math.max(0,...branches.map(b=>b.latency))};
}

export const hasProcessingGraph=patch=>!!patch?.chain&&((patch.chain.parallel?.length??0)>0||patch.chain.order.some(id=>!PRIMARY_PROCESSORS.includes(id)));
export function songUsesProcessingGraph(song){
 return [...(song.beats??[]).flatMap(b=>b.instruments??[]),...(song.tracks??[]).flatMap(t=>t.freeform?.instruments??[])].some(i=>(i.sounds??[{patch:i.patch}]).some(s=>hasProcessingGraph(s.patch)))||
  (song.tracks??[]).some(t=>t.kind==='vocal'&&t.clips?.some(c=>hasProcessingGraph(c.effects)));
}

export function processorInactiveReason(patch,id){
 const chain=patch.chain;
 if(chain?.bypass.includes(id))return 'processor is bypassed';
 if(chain?.mix?.[id]===0)return 'processor mix is zero';
 const route=chain?.parallel?.find(r=>r.order.includes(id));
 if(route?.gain===0)return 'parallel route share is zero';
 if(chain?.parallel?.length&&(chain.dry??0)+chain.parallel.reduce((n,r)=>n+r.gain,0)===0)return 'all parallel routes are silent';
 return undefined;
}
