import {DYNAMICS_FIELDS,DYNAMICS_PARAMETERS,MOD_EFFECT_PARAMETERS} from './parameters.js';

// Stable field numbers are shared with native/post-processing.hpp. Processor
// identities stay in the project and resolve to compiled node slots at prepare.
export const POST_AUTOMATION_BASE=512;
export const POST_AUTOMATION_FIELDS=Object.freeze([
 'mix','enabled','threshold','ratio','knee','attack','release','makeup','range',
 'hold','frequency','bandwidth','amount','rate','depth','phase','stereo','feedback','delay'
]);
const mix={unit:'ratio',min:0,max:1,interpolation:'linear',ui:{step:.01,display:'percent'}};
const enabled={unit:'switch',min:0,max:1,interpolation:'step',ui:{step:1},discrete:true};
export function postAutomationFields(kind){
 const fields=DYNAMICS_FIELDS[kind];
 if(fields)return {...Object.fromEntries(fields.map(key=>[key,DYNAMICS_PARAMETERS[key]])),mix,enabled};
 const motion=MOD_EFFECT_PARAMETERS[kind];
 return motion?{...Object.fromEntries(Object.entries(motion).filter(([key])=>key!=='sync')),mix,enabled}:null;
}
export const postAutomationTarget=(target,id)=>target.startsWith('processor.'+id+'.');
export function postAutomationMask(lanes,id){
 return (lanes??[]).reduce((mask,lane)=>!lane.bypass&&postAutomationTarget(lane.target,id)?
  mask|(1<<POST_AUTOMATION_FIELDS.indexOf(lane.target.split('.')[2])):mask,0);
}

// Movement shares the same continuous controls, units and bounds as authored
// lanes. Saved identities resolve to prepared slots only at the host boundary.
export const POST_MODULATION_BASE=10;
export function postModulationTargets(patch){
 const chain=patch?.chain;
 return (Array.isArray(chain?.instances)?chain.instances:[]).flatMap(node=>{
  if(!node||typeof node.id!=='string')return [];
  const fields=postAutomationFields(node.kind);if(!fields)return [];
  return Object.entries(fields).filter(([key])=>key!=='enabled').map(([key,field])=>({
   id:'processor.'+node.id+'.'+key,name:node.id+' '+key,unit:field.unit,
   limit:field.max-field.min,parameter:field,
   active:Array.isArray(chain.post)&&chain.post.includes(node.id)&&Array.isArray(chain.bypass)&&!chain.bypass.includes(node.id)&&!(key==='rate'&&node.parameters?.sync)
  }));
 });
}
export function postModulationMask(patch,id){
 const targets=postModulationTargets(patch);
 return (patch?.modulation?.routes??[]).reduce((mask,route)=>
  postAutomationTarget(route.target,id)&&targets.find(t=>t.id===route.target)?.active?
   mask|(1<<POST_AUTOMATION_FIELDS.indexOf(route.target.split('.')[2])):mask,0);
}

// Prepared per-voice lane cursors. The worklet advances in audio-frame order
// without constructing objects or arrays in its process callback.
export class PostAutomationCursor {
 constructor(lanes,id){
  this.lanes=(lanes??[]).filter(lane=>postAutomationTarget(lane.target,id));
  this.cursors=new Uint8Array(this.lanes.length);
  this.fields=this.lanes.map(lane=>lane.target.split('.')[2]);
 }
 apply(parameters,time,rate){
  let enabled=1;
  for(let n=0;n<this.lanes.length;n++){
   const lane=this.lanes[n],points=lane.points;
   let i=this.cursors[n];
   while(i+1<points.length&&time+1e-9/rate>=points[i+1].time)i++;
   this.cursors[n]=i;
   const a=points[i];let value=a.value;
   if(i+1<points.length&&time>a.time&&lane.interpolation!=='step'){
    const b=points[i+1],t=Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));
    value=lane.interpolation==='exponential'?a.value*(b.value/a.value)**t:a.value+(b.value-a.value)*t;
   }
   const field=this.fields[n];
   if(field==='enabled')enabled=value;else parameters[field]=value;
  }
  return enabled;
 }
}
