import {DYNAMICS_FIELDS,DYNAMICS_PARAMETERS} from './parameters.js';
export const DYNAMICS_KINDS=Object.freeze(Object.keys(DYNAMICS_FIELDS));
export const MAX_DYNAMICS=4;
export function defaultDynamics(kind){
 if(!DYNAMICS_KINDS.includes(kind))throw Error('Unknown dynamics processor');
 const result=Object.fromEntries(DYNAMICS_FIELDS[kind].map(key=>[key,DYNAMICS_PARAMETERS[key].default]));
 if(kind==='gate')result.threshold=-48;
 if(kind==='limiter'){result.threshold=-1;result.release=.05;}
 return result;
}
export function validateDynamicsParameters(kind,p){
 const fields=DYNAMICS_FIELDS[kind];
 return !!fields&&!!p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===fields.length&&Object.keys(p).every(key=>fields.includes(key))&&fields.every(key=>{const def=DYNAMICS_PARAMETERS[key];return Number.isFinite(p[key])&&p[key]>=def.min&&p[key]<=def.max;});
}
// Runtime recipes include inactive-kind defaults, never new persisted fields.
export function compileDynamics(patch){
 const chain=patch.chain;if(!chain)return [];
 const order=chain.post??[],instances=chain.instances??[],bypass=chain.bypass??[];
 if(!Array.isArray(order)||order.length>MAX_DYNAMICS||new Set(order).size!==order.length||!Array.isArray(instances)||!Array.isArray(bypass))throw Error('Invalid post-level dynamics order');
 const nodes=[];
 for(const id of order){
  const node=instances.find(instance=>instance?.id===id),mix=chain.mix?.[id]??1;
  if(!node||!validateDynamicsParameters(node.kind,node.parameters)||!Number.isFinite(mix)||mix<0||mix>1)throw Error('Invalid dynamics processor');
  if(bypass.includes(id)||mix===0)continue;
  nodes.push({id,kind:node.kind,...Object.fromEntries(Object.entries(DYNAMICS_PARAMETERS).map(([key,p])=>[key,p.default])),...node.parameters,mix});
 }
 return nodes;
}
export const compressionDb=(input,p)=>{
 const x=input-p.threshold,slope=1/p.ratio-1;
 return p.knee===0?Math.min(0,slope*x):x<=-p.knee/2?0:x>=p.knee/2?slope*x:slope*(x+p.knee/2)**2/(2*p.knee);
};
