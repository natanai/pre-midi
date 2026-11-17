import {POST_AUTOMATION_BASE,POST_AUTOMATION_FIELDS,postAutomationFields} from './processor-automation.js';
import {parameterFor,validParameterValue,automationParametersFor} from './parameters.js';
import {allProcessorIds,processorKind,toneProcessorOrders,PROCESSOR_AUTOMATION_FIELDS} from './processing-graph.js';
import {processingChain,processorMix,processorBypassed} from './processing-chain.js';
const parameter=parameterFor('filter.cutoff');
export const AUTOMATION_VERSION=1;
export const MAX_AUTOMATION_POINTS=32;
export const MAX_AUTOMATION_EVENTS=36;
export const MAX_AUTOMATION_LANES=8;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const keys=(object,allowed)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).every(key=>allowed.includes(key));
const mixField={unit:'ratio',min:0,max:1,interpolation:'linear',ui:{step:.01}};
const enabledField={unit:'switch',min:0,max:1,interpolation:'step',ui:{step:1},discrete:true};
export function automationParameters(patch,context=patch?.type??'synth'){
 const chain=processingChain(patch??{}),routed=toneProcessorOrders(chain).flat(),post=chain.post??[];
 const processors=allProcessorIds(chain).flatMap((id,index)=>{
  const kind=processorKind(patch??{},id);
  const postFields=postAutomationFields(kind);
  if(postFields){
   const instance=chain.instances.find(instance=>instance.id===id);
   return Object.entries(postFields).map(([key,field])=>({...field,id:'processor.'+id+'.'+key,
    active:post.includes(id)&&!processorBypassed(patch,id)&&!(key==='rate'&&instance.parameters.sync),
    automationIndex:POST_AUTOMATION_BASE+index*POST_AUTOMATION_FIELDS.length+POST_AUTOMATION_FIELDS.indexOf(key)}));
  }
  if(!['filter','eq','drive'].includes(kind))return [];
  const active=routed.includes(id)&&!processorBypassed(patch??{},id)&&!(id==='filter'&&patch?.filter===null);
  const fields=kind==='filter'&&id!=='filter'?{
   cutoff:parameterFor('filter.cutoff',context),resonance:parameterFor('filter.resonance',context)
  }:{};
  return Object.entries({...fields,mix:mixField,enabled:enabledField}).map(([key,field])=>({
   ...field,id:'processor.'+id+'.'+key,active,automationIndex:256+index*PROCESSOR_AUTOMATION_FIELDS.length+PROCESSOR_AUTOMATION_FIELDS.indexOf(key)
  }));
 });
 return [...automationParametersFor(context),...processors];
}
export function processorAutomationBase(patch,target){
 const [,id,field]=target.split('.');
 if(field==='mix')return processorMix(patch,id);
 if(field==='enabled')return processorBypassed(patch,id)?0:1;
 return patch.chain.instances.find(instance=>instance.id===id).parameters[field];
}
export const cutoffLane=lanes=>lanes?.find(lane=>lane.target==='filter.cutoff'&&!lane.bypass);
export function validateAutomation(lanes,patch,bars=1000000){
 if(lanes===undefined)return [];
 if(!Array.isArray(lanes)||lanes.length>MAX_AUTOMATION_LANES)return ['Automation needs up to eight parameter lanes.'];
 const parameters=automationParameters(patch),ids=new Set(),targets=new Set(),errors=[];
 for(const lane of lanes){
  const p=parameters.find(p=>p.id===lane?.target);
  if(!p||!keys(lane,['id','version','target','unit','interpolation','points','bypass'])||typeof lane.id!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(lane.id)||ids.has(lane.id)||targets.has(lane.target)||lane.version!==1||lane.unit!==p.unit||!['linear','exponential','step'].includes(lane.interpolation)||(p.discrete&&lane.interpolation!=='step')||(lane.bypass!==undefined&&typeof lane.bypass!=='boolean')||!Array.isArray(lane.points)||lane.points.length<2||lane.points.length>MAX_AUTOMATION_POINTS){errors.push('Invalid parameter automation lane.');continue;}
  ids.add(lane.id);targets.add(lane.target);let previous=-1;const points=new Set();
  for(const point of lane.points){
   if(!keys(point,['id','step','value'])||typeof point.id!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(point.id)||points.has(point.id)||!Number.isInteger(point.step)||point.step<=previous||point.step<0||point.step>bars*16||!finite(point.value)||(p.discrete&&!Number.isInteger(point.value))||point.value<p.min||point.value>p.max||(lane.interpolation==='exponential'&&point.value<=0))errors.push('Invalid parameter automation point.');
   points.add(point?.id);previous=point?.step;
  }
 }
 return errors;
}
const interpolate=(a,b,position,mode)=>mode==='step'?a:mode==='exponential'?a*(b/a)**position:a+(b-a)*position;
export function laneValueAt(lane,position,base,timeKey='step'){
 if(!lane||lane.bypass)return base;
 const points=lane.points;if(position<=points[0][timeKey])return points[0].value;
 for(let i=1;i<points.length;i++)if(position<points[i][timeKey]){const a=points[i-1],b=points[i];return interpolate(a.value,b.value,(position-a[timeKey])/(b[timeKey]-a[timeKey]),lane.interpolation);}
 return points.at(-1).value;
}
export function planParameterAutomation(lanes,patch,{start,end,step=0,unit=.125,limitStep=step+(end-start)/unit}){
 const errors=validateAutomation(lanes,patch);if(errors.length)throw Error(errors.join(' '));
 if(!finite(start)||start<0||!finite(end)||end<=start||!finite(step)||step<0||!finite(unit)||unit<=0||!finite(limitStep)||limitStep<step)throw Error('Invalid automation timeline position.');
 const parameters=automationParameters(patch);
 return (lanes??[]).filter(lane=>!lane.bypass&&parameters.find(p=>p.id===lane.target).active!==false).map(lane=>{
  const at=position=>laneValueAt(lane,Math.min(position,limitStep)),points=[];
  const add=(time,value)=>{if(points.at(-1)?.time===time)points.pop();points.push({time,value});};
  add(start,at(step));
  for(const point of lane.points)if(point.step>step&&point.step<limitStep&&start+(point.step-step)*unit<end)add(start+(point.step-step)*unit,point.value);
  const boundary=start+(limitStep-step)*unit;if(boundary>start&&boundary<end)add(boundary,at(limitStep));
  add(end,at(step+(end-start)/unit));
  return {target:lane.target,index:parameters.find(p=>p.id===lane.target).automationIndex,interpolation:lane.interpolation,points};
 });
}
export function insertAutomationPoint(lane,id=globalThis.crypto.randomUUID()){
 if(lane.points.length>=MAX_AUTOMATION_POINTS)return lane;let width=1,step;
 for(let i=1;i<lane.points.length;i++){const a=lane.points[i-1],b=lane.points[i];if(b.step-a.step>width){width=b.step-a.step;step=a.step+Math.floor(width/2);}}
 return step===undefined?lane:{...lane,points:[...lane.points,{id,step,value:laneValueAt(lane,step)}].sort((a,b)=>a.step-b.step)};
}
// Map a played Song position to the lane's authored source range. Captured
// Freeform notes retain the source step they had before unpacking or moving.
export function automationRecordingStep(position,{start=0,length,sourceStep=0,limitStep=Infinity}){
 if(!Number.isFinite(position)||position<start||position>=start+length)return null;
 const step=sourceStep+position-start;
 return step<limitStep?step:null;
}

// Commit one pass of a Beat gesture. Preserve the original interpolation
// outside its written steps and keep existing point identities where possible.
export function recordAutomationGesture(lane,recorded,totalSteps,makeId=()=>globalThis.crypto.randomUUID()){
 const samples=[...recorded].filter(([step,value])=>Number.isInteger(step)&&step>=0&&step<=totalSteps&&Number.isFinite(value))
  .sort(([a],[b])=>a-b);
 if(!samples.length)return lane;
 const first=samples[0][0],last=samples.at(-1)[0];
 const original=new Map(lane.points.map(point=>[point.step,point]));
 const retained=lane.points.filter(point=>point.step<first||point.step>last);
 for(const step of [first-1,last+1])if(step>=0&&step<=totalSteps&&!original.has(step))
  retained.push({id:makeId(),step,value:laneValueAt({...lane,bypass:false},step)});
 const room=MAX_AUTOMATION_POINTS-retained.length;
 if(room<Math.min(2,samples.length))return lane;
 const picked=samples.length<=room?samples:Array.from({length:room},(_,i)=>samples[Math.round(i*(samples.length-1)/(room-1))]);
 const points=[...retained,...picked.map(([step,value])=>({id:original.get(step)?.id??makeId(),step,value}))]
  .sort((a,b)=>a.step-b.step);
 return points.length>=2?{...lane,points}:lane;
}

export function validateCutoffAutomation(block,instrument,bars){
 if(block===undefined)return [];
 const errors=[];
 if(!keys(block,['version','target','unit','interpolation','points'])||block.version!==1||block.target!==parameter.id||block.unit!==parameter.unit||block.interpolation!=='exponential'||!Array.isArray(block.points)||(block.points.length<2||block.points.length>MAX_AUTOMATION_POINTS))return ['Unsupported cutoff automation.'];
 if(instrument&&(instrument.layout!=='pitched'||instrument.sounds?.[0]?.patch?.type!=='synth'))errors.push('Cutoff movement requires a piano-roll synthesizer. Remove its movement before changing the instrument type.');
 const ids=new Set();let previous=-1;
 for(const point of block.points){
  if(!keys(point,['id','step','value'])||typeof point.id!=='string'||!point.id||point.id.length>128||ids.has(point.id)||!Number.isInteger(point.step)||point.step<0||point.step>bars*16||point.step<=previous||!finite(point.value)||point.value<parameter.min||point.value>parameter.max)errors.push('Cutoff points need distinct IDs, increasing positions inside the Beat and values from 50 to 14000 Hz.');
  ids.add(point?.id);previous=point?.step;
 }
 return errors;
}
export function cutoffAt(block,step,base){
 if(!block)return base;
 const points=block.points;if(step<=points[0].step)return points[0].value;
 for(let i=1;i<points.length;i++)if(step<points[i].step){const a=points[i-1],b=points[i];return a.value*(b.value/a.value)**((step-a.step)/(b.step-a.step));}
 return points.at(-1).value;
}
export function planCutoffAutomation(block,{start,end,step,unit,limitStep}){
 if(!finite(start)||!finite(end)||end<=start||!finite(step)||step<0||!finite(unit)||unit<=0||!finite(limitStep)||limitStep<step)throw Error('Invalid automation timeline position.');
 const issues=validateCutoffAutomation(block,null,Number.MAX_SAFE_INTEGER/16);if(issues.length)throw Error(issues.join(" "));
 const points=[],add=(time,value,id)=>{if(points.at(-1)?.time===time)points.pop();points.push({time,value,id});};
 const at=position=>cutoffAt(block,Math.min(position,limitStep));
 add(start,at(step),'boundary:start');
 for(const point of block.points)if(point.step>step&&point.step<limitStep&&start+(point.step-step)*unit<end)add(start+(point.step-step)*unit,point.value,'point:'+point.id);
 const boundary=start+(limitStep-step)*unit;if(boundary>start&&boundary<end)add(boundary,at(limitStep),'boundary:limit');
 add(end,at(step+(end-start)/unit),'boundary:end');
 return {version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',points:points.map((point,order)=>({...point,order}))};
}
export function validateAutomationPlan(block){
 if(!keys(block,['version','target','unit','interpolation','points'])||block.version!==1||block.target!=='filter.cutoff'||block.unit!=='hz'||block.interpolation!=='exponential'||!Array.isArray(block.points)||block.points.length<2||block.points.length>MAX_AUTOMATION_EVENTS)return ['Unsupported automation execution plan.'];
 let previous=-1;
 for(const [order,point] of block.points.entries()){
  if(!keys(point,['time','value','id','order'])||!finite(point.time)||point.time<0||point.time<=previous||point.order!==order||!validParameterValue(parameter.id,point.value))return ['Invalid automation event.'];previous=point.time;
 }
 return [];
}
export function automationValueAt(block,time,base){
 if(!block)return base;const points=block.points;if(time<=points[0].time)return points[0].value;
 for(let i=1;i<points.length;i++)if(time<points[i].time){const a=points[i-1],b=points[i];return a.value*(b.value/a.value)**((time-a.time)/(b.time-a.time));}
 return points.at(-1).value;
}

// One resolver for browser transport, WAV export, and the native voice host.
// Captured source phase belongs to the note, not to its Song Track.
export function noteAutomation(instrument,note,timeline){
 const captured=note?.automation;
 if(!captured){const patch=instrument?.sounds?.find(sound=>sound?.id===note?.soundId)?.patch??instrument?.sounds?.[0]?.patch??instrument?.patch;
  const merged=new Map([...(patch?.automation??[]),...(instrument?.automation??[])].map(lane=>[lane.target,lane]));return {automation:merged.size?[...merged.values()]:undefined,timeline};}
 return {automation:captured.block,timeline:{
  ...timeline,step:captured.step,limitStep:captured.limitStep
 }};
}
export function validateCapturedAutomation(captured,patch){
 if(!keys(captured,['version','block','step','limitStep'])||
  captured.version!==1||
  !Number.isSafeInteger(captured.step)||captured.step<0||
  !Number.isSafeInteger(captured.limitStep)||captured.limitStep<=captured.step||
  captured.limitStep>64*16)return ["Invalid captured note automation."];
 return validateAutomation(captured.block,patch,64);
}

// Insert in the largest open musical-time gap, preserving all existing IDs.
export function insertCutoffPoint(block,id=globalThis.crypto.randomUUID()){
 if(block.points.length>=MAX_AUTOMATION_POINTS)return block;
 let gap=0,step;
 for(let i=1;i<block.points.length;i++){
  const a=block.points[i-1],b=block.points[i],width=b.step-a.step;
  if(width>gap&&width>1){gap=width;step=a.step+Math.floor(width/2);}
 }
 if(step===undefined)return block;
 return {...block,points:[...block.points,{id,step,value:cutoffAt(block,step)}].sort((a,b)=>a.step-b.step)};
}
export function removeCutoffPoint(block,id){
 if(block.points.length<=2)return block;
 return {...block,points:block.points.filter(point=>point.id!==id)};
}
