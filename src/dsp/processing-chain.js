// Stable IDs identify the existing processors. Serial tone stages precede
// articulation/pan; delay remains an explicitly owned send, never a reorderable
// feedback edge. This bounded model is shared by every source and host.
export const DEFAULT_PROCESSING_CHAIN=Object.freeze({version:1,order:Object.freeze(['filter','drive']),bypass:Object.freeze([])});
export function validateProcessingChain(chain){
 if(chain===undefined)return [];
 if(!chain||typeof chain!=='object'||Array.isArray(chain)||Object.keys(chain).some(k=>!['version','order','bypass'].includes(k))||chain.version!==1||
  !Array.isArray(chain.order)||chain.order.length!==2||new Set(chain.order).size!==2||chain.order.some(id=>!['filter','drive'].includes(id))||
  !Array.isArray(chain.bypass)||new Set(chain.bypass).size!==chain.bypass.length||chain.bypass.some(id=>!['filter','drive','delay'].includes(id)))return ['Invalid processing chain.'];
 return [];
}
export const processingChain=patch=>patch.chain??DEFAULT_PROCESSING_CHAIN;
export const processorBypassed=(patch,id)=>processingChain(patch).bypass.includes(id);
export function withProcessorBypass(patch,id,bypassed){
 if(!['filter','drive','delay'].includes(id))throw Error('Unknown processor');
 const chain=processingChain(patch),bypass=chain.bypass.filter(key=>key!==id);
 if(bypassed)bypass.push(id);
 return {...chain,order:[...chain.order],bypass};
}
export const processingFlags=patch=>(processingChain(patch).order[0]==='drive'?1:0)|(processorBypassed(patch,'filter')?2:0)|(processorBypassed(patch,'drive')?4:0);
export const effectiveDelayEffects=(patch,effects)=>processorBypassed(patch,'delay')?{...effects,delayMix:0}:effects;
