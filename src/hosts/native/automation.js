import {POST_AUTOMATION_BASE,POST_AUTOMATION_FIELDS} from '../../dsp/processor-automation.js';
import {PROCESSOR_AUTOMATION_FIELDS} from '../../dsp/processing-graph.js';
import {MAX_AUTOMATION_EVENTS,MAX_AUTOMATION_LANES} from '../../dsp/automation.js';
export function encodeParameterAutomation(lanes,graph,u32,f64,post=[]){
 if(!Array.isArray(lanes??[])||(lanes?.length??0)>MAX_AUTOMATION_LANES)throw Error('Native automation supports up to eight lanes');
 u32(lanes?.length??0);
 for(const lane of lanes??[]){
  let index=lane.index;
  if(lane.target.startsWith('processor.')){
   const [,id,field]=lane.target.split('.'),postIndex=post.findIndex(node=>node.id===id);
   if(postIndex>=0)index=POST_AUTOMATION_BASE+postIndex*POST_AUTOMATION_FIELDS.length+POST_AUTOMATION_FIELDS.indexOf(field);
   else{
    const node=graph?.nodes.findIndex(node=>node.id===id);
    if(node===undefined||node<0)throw Error('Automation processor is not routed');
    index=256+node*PROCESSOR_AUTOMATION_FIELDS.length+PROCESSOR_AUTOMATION_FIELDS.indexOf(field);
   }
  }
  if(!['linear','exponential','step'].includes(lane.interpolation)||!Array.isArray(lane.points)||lane.points.length<2||lane.points.length>MAX_AUTOMATION_EVENTS)throw Error('Invalid native parameter lane');
  u32(index);u32(['linear','exponential','step'].indexOf(lane.interpolation));u32(lane.points.length);for(const point of lane.points){f64(point.time);f64(point.value);}
 }
}
