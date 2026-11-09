// The same authored lanes and prepared clocks drive every browser source.
export function applyParameterLane(param,lane,{offset=0,cancel=true}={}){
 const points=lane.points;if(cancel)param.cancelScheduledValues(points[0].time);
 param.setValueAtTime(points[0].value-offset,points[0].time);
 for(const point of points.slice(1))param[lane.interpolation==='step'?'setValueAtTime':lane.interpolation==='exponential'?'exponentialRampToValueAtTime':'linearRampToValueAtTime'](point.value-offset,point.time);
}
export function scheduleParameterAutomation(context,lanes,targets,owner){
 for(const original of lanes??[]){
  const lane=original.interpolation==='step'?{...original,points:original.points.map(point=>({...point,time:Math.ceil(point.time*context.sampleRate-1e-9)/context.sampleRate}))}:original;
  const target=targets.get(lane.target);if(!target)continue;
  if(target.additive){
   const source=context.createConstantSource();owner.sources.push(source);source.offset.value=0;
   const values=lane.points;applyParameterLane(source.offset,lane);
   if(target.base!==0){const baseline=context.createConstantSource();owner.sources.push(baseline);baseline.offset.value=-target.base;baseline.connect(target.param);baseline.start(values[0].time);baseline.stop(values.at(-1).time);}
   source.connect(target.param);source.start(values[0].time);source.stop(values.at(-1).time);continue;
  }
  for(const param of Array.isArray(target)?target:[target])applyParameterLane(param,lane);
 }
}
