import {MOD_TARGETS,nativeModulationSource,lfoCyclesAt,DEFAULT_LFO_STEPS} from '../../dsp/modulation.js';
import {POST_MODULATION_BASE,POST_AUTOMATION_FIELDS} from '../../dsp/processor-automation.js';

// Pack the canonical source phase before a voice is rebased to a native page.
export function encodeModulation(plan,u32,f64){
 const routes=[...(plan.modulation?.routes??[])].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 u32(routes.length);
 for(const {target,source,polarity,depth,smoothing} of routes){
  let index=MOD_TARGETS.findIndex(value=>value.id===target);
  if(target.startsWith('processor.')){
   const [,id,field]=target.split('.'),slot=plan.postProcessing?.findIndex(node=>node.id===id),at=POST_AUTOMATION_FIELDS.indexOf(field);
   if(slot===undefined||slot<0||at<0||field==='enabled')throw Error('Movement processor is not routed');
   index=POST_MODULATION_BASE+slot*POST_AUTOMATION_FIELDS.length+at;
  }
  if(index<0)throw Error('Unsupported native movement target');
  u32(index);
  u32(nativeModulationSource(source));u32(polarity==='bipolar'?1:0);
  f64(depth);f64(smoothing);f64(source.rate??.5);
  f64(source.kind==='macro'?source.value:source.kind==='lfo'?(source.seed??1):(source.root??60));
  f64(source.span??24);
  if(source.kind==='envelope')for(const key of ['attack','decay','sustain','release'])f64(source.envelope[key]);
  if(source.kind==='lfo'){
   f64(lfoCyclesAt(source,0,plan.clockStart??0));
   if(source.shape==='steps'){
    const steps=source.steps??DEFAULT_LFO_STEPS;
    u32(steps.length);steps.forEach(f64);
   }
  }
 }
}
