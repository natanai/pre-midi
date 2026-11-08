// Stable IDs identify the existing processors. Serial tone stages precede
// articulation/pan; delay remains an explicitly owned send, never a reorderable
// feedback edge. This bounded model is shared by every source and host.
export const DEFAULT_PROCESSING_CHAIN=Object.freeze({version:1,order:Object.freeze(['filter','drive']),bypass:Object.freeze([])});
export function validateProcessingChain(chain){
 if(chain===undefined)return [];
 if(!chain||typeof chain!=='object'||Array.isArray(chain)||Object.keys(chain).some(k=>!['version','order','bypass','mix'].includes(k))||chain.version!==1||
  !Array.isArray(chain.order)||chain.order.length>2||new Set(chain.order).size!==chain.order.length||chain.order.some(id=>!['filter','drive'].includes(id))||
  !Array.isArray(chain.bypass)||new Set(chain.bypass).size!==chain.bypass.length||chain.bypass.some(id=>!['filter','drive','delay'].includes(id)))return ['Invalid processing chain.'];
 if(chain.mix!==undefined&&(!chain.mix||typeof chain.mix!=='object'||Array.isArray(chain.mix)||Object.entries(chain.mix).some(([id,value])=>!['filter','drive'].includes(id)||!Number.isFinite(value)||value<0||value>1)))return ['Invalid processor mix.'];
 return [];
}
export const processingChain=patch=>patch.chain??DEFAULT_PROCESSING_CHAIN;
export const processorBypassed=(patch,id)=>processingChain(patch).bypass.includes(id)||(['filter','drive'].includes(id)&&!processingChain(patch).order.includes(id));
export function withProcessorRemoved(patch,id){
 if(!['filter','drive'].includes(id))throw Error('Only serial processors can be removed');
 const chain=processingChain(patch);
 return {...chain,order:chain.order.filter(key=>key!==id),bypass:[...chain.bypass]};
}
export function withProcessorAdded(patch,id){
 if(!['filter','drive'].includes(id))throw Error('Unknown serial processor');
 const chain=processingChain(patch);
 return {...chain,order:chain.order.includes(id)?[...chain.order]:[...chain.order,id],bypass:[...chain.bypass]};
}
export function withProcessorBypass(patch,id,bypassed){
 if(!['filter','drive','delay'].includes(id))throw Error('Unknown processor');
 const chain=processingChain(patch),bypass=chain.bypass.filter(key=>key!==id);
 if(bypassed)bypass.push(id);
 const order=[...chain.order];if(!bypassed&&id!=='delay'&&!order.includes(id))order.push(id);
 return {...chain,order,bypass};
}
export const processingFlags=patch=>(processingChain(patch).order[0]==='drive'?1:0)|(processorBypassed(patch,'filter')?2:0)|(processorBypassed(patch,'drive')?4:0);
export const DELAY_DIVISIONS=Object.freeze([.25,.5,.75,1]);
export const validateDelaySync=value=>value===undefined||DELAY_DIVISIONS.includes(value)?[]:['Invalid delay tempo division.'];
export const effectiveDelayEffects=(patch,effects,unit=.125)=>{
 const fx=patch.delaySync?{...effects,delayTime:patch.delaySync*4*unit}:effects;
 return processorBypassed(patch,'delay')?{...fx,delayMix:0}:fx;
};

export const processorMix=(patch,id)=>processingChain(patch).mix?.[id]??1;
