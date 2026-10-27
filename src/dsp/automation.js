import {SYNTH_PARAMETERS} from './parameters.js';
const parameter=SYNTH_PARAMETERS.find(item=>item.id==='filter.cutoff');
export const AUTOMATION_VERSION=1;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const keys=(object,allowed)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).every(key=>allowed.includes(key));
export function validateCutoffAutomation(block,instrument,bars){
 if(block===undefined)return [];
 const errors=[];
 if(!keys(block,['version','target','unit','interpolation','points'])||block.version!==1||block.target!==parameter.id||block.unit!==parameter.unit||block.interpolation!=='exponential'||!Array.isArray(block.points)||block.points.length!==2)return ['Unsupported cutoff automation.'];
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
 const [a,b]=block.points;if(step<=a.step)return a.value;if(step>=b.step)return b.value;
 return a.value*(b.value/a.value)**((step-a.step)/(b.step-a.step));
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
 if(!keys(block,['version','target','unit','interpolation','points'])||block.version!==1||block.target!=='filter.cutoff'||block.unit!=='hz'||block.interpolation!=='exponential'||!Array.isArray(block.points)||block.points.length<2||block.points.length>6)return ['Unsupported automation execution plan.'];
 let previous=-1;
 for(const [order,point] of block.points.entries()){
  if(!keys(point,['time','value','id','order'])||!finite(point.time)||point.time<0||point.time<=previous||point.order!==order||!finite(point.value)||point.value<50||point.value>14000)return ['Invalid automation event.'];previous=point.time;
 }
 return [];
}
export function automationValueAt(block,time,base){
 if(!block)return base;const points=block.points;if(time<=points[0].time)return points[0].value;
 for(let i=1;i<points.length;i++)if(time<points[i].time){const a=points[i-1],b=points[i];return a.value*(b.value/a.value)**((time-a.time)/(b.time-a.time));}
 return points.at(-1).value;
}
