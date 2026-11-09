import {DYNAMICS_KINDS,MAX_DYNAMICS} from './dynamics.js';
import {validateGraphExtensions,allProcessorIds,processorOrders} from './processing-graph.js';
// Stable IDs identify the existing processors. Serial tone stages precede
// articulation/pan; delay remains an explicitly owned send, never a reorderable
// feedback edge. This bounded model is shared by every source and host.
export const DEFAULT_PROCESSING_CHAIN=Object.freeze({version:1,order:Object.freeze(['filter','drive']),bypass:Object.freeze([])});
export function validateProcessingChain(chain){
 if(chain===undefined)return [];
 if(!chain||typeof chain!=='object'||Array.isArray(chain)||Object.keys(chain).some(k=>!['version','order','bypass','mix','instances','parallel','dry','post'].includes(k))||chain.version!==1||
  !Array.isArray(chain.order)||chain.order.length>8||new Set(chain.order).size!==chain.order.length||chain.order.some(id=>typeof id!=='string')||
  !Array.isArray(chain.bypass)||new Set(chain.bypass).size!==chain.bypass.length||chain.bypass.some(id=>typeof id!=='string'))return ['Invalid processing chain.'];
 return validateGraphExtensions(chain);
}
export const processingChain=patch=>patch.chain??DEFAULT_PROCESSING_CHAIN;
export const processorBypassed=(patch,id)=>processingChain(patch).bypass.includes(id)||(id!=='delay'&&!processorOrders(processingChain(patch)).some(order=>order.includes(id)));
export function withProcessorRemoved(patch,id){
 if(!allProcessorIds(processingChain(patch)).includes(id))throw Error('Unknown processor');
 const chain=processingChain(patch);
 const next={...chain,order:chain.order.filter(key=>key!==id),bypass:[...chain.bypass]};
 if(chain.post)next.post=chain.post.filter(key=>key!==id);
 if(chain.parallel)next.parallel=chain.parallel.map(r=>({...r,order:r.order.filter(key=>key!==id)}));
 return next;
}
export function withProcessorAdded(patch,id){
 if(!allProcessorIds(processingChain(patch)).includes(id))throw Error('Unknown processor');
 const chain=processingChain(patch);
 const next=structuredClone(chain);
 if(!processorOrders(chain).some(order=>order.includes(id))){if(processorOrders(chain).flat().length>=8)throw Error("Processing supports up to eight processors.");const kind=chain.instances?.find(n=>n.id===id)?.kind;if(DYNAMICS_KINDS.includes(kind)){if((chain.post?.length??0)>=MAX_DYNAMICS)throw Error('Up to four dynamics processors are supported.');(next.post??=[]).push(id);}else next.order.push(id);}
 return next;
}
export function withProcessorBypass(patch,id,bypassed){
 if(![...allProcessorIds(processingChain(patch)),'delay'].includes(id))throw Error('Unknown processor');
 const chain=processingChain(patch),bypass=chain.bypass.filter(key=>key!==id);
 if(bypassed)bypass.push(id);
 const next=!bypassed&&id!=="delay"?withProcessorAdded(patch,id):structuredClone(chain);
 return {...next,bypass};
}
export const processingFlags=patch=>(processingChain(patch).order.filter(id=>id!=='eq')[0]==='drive'?1:0)|(processorBypassed(patch,'filter')?2:0)|(processorBypassed(patch,'drive')?4:0)|(processingChain(patch).order.includes('eq')?(processingChain(patch).order.indexOf('eq')===0?8:processingChain(patch).order.at(-1)==='eq'?24:16):0)|(processingChain(patch).bypass.includes('eq')?32:0);
export const DELAY_DIVISIONS=Object.freeze([.25,.5,.75,1]);
export const validateDelaySync=value=>value===undefined||DELAY_DIVISIONS.includes(value)?[]:['Invalid delay tempo division.'];
export const effectiveDelayEffects=(patch,effects,unit=.125)=>{
 effects={...effects,delayTone:patch.delayTone??20000,delayPingPong:patch.delayPingPong??false};
 const fx=patch.delaySync?{...effects,delayTime:patch.delaySync*4*unit}:effects;
 return processorBypassed(patch,'delay')?{...fx,delayMix:0}:fx;
};

export const processorMix=(patch,id)=>processingChain(patch).mix?.[id]??1;
