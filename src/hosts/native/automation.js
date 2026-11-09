import {compileProcessingGraph} from '../../dsp/processing-graph.js';
import {MAX_AUTOMATION_EVENTS,MAX_AUTOMATION_LANES} from '../../dsp/automation.js';
export function encodeParameterAutomation(lanes,patch,rate,u32,f64){
 if(!Array.isArray(lanes??[])||(lanes?.length??0)>MAX_AUTOMATION_LANES)throw Error('Native automation supports up to eight lanes');
 u32(lanes?.length??0);
 const graph=lanes?.some(lane=>lane.target.startsWith('processor.'))?compileProcessingGraph(patch,rate):null;
 for(const lane of lanes??[]){
  let index=lane.index;
  if(lane.target.startsWith('processor.')){const [,id,field]=lane.target.split('.'),node=graph?.nodes.findIndex(n=>n.id===id);if(node===undefined||node<0)throw Error('Automation processor is not routed');index=256+node*2+(field==='resonance'?1:0);}
  if(!['linear','exponential','step'].includes(lane.interpolation)||!Array.isArray(lane.points)||lane.points.length<2||lane.points.length>MAX_AUTOMATION_EVENTS)throw Error('Invalid native parameter lane');
  u32(index);u32(['linear','exponential','step'].indexOf(lane.interpolation));u32(lane.points.length);for(const point of lane.points){f64(point.time);f64(point.value);}
 }
}
