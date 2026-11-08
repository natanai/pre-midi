import {eqCoefficients} from '../../dsp/equalizer.js';
export function createEq(context,eq,owner){
 if(!eq?.bands.some(b=>b.enabled))return null;
 let input,output;for(const band of eq.bands){
  if(!band.enabled)continue;const c=eqCoefficients(band,context.sampleRate),node=context.createIIRFilter(c.slice(0,3),[1,...c.slice(3)]);owner.nodes.push(node);if(output)output.connect(node);else input=node;output=node;
 }return {input,output};
}
export function cascadeFilter(context,filter,patch,owner){
 let output=filter;const filters=[filter];
 for(let i=1;i<(patch.filterStages??1);i++){
  const node=context.createBiquadFilter();node.type=patch.filter.type;node.frequency.value=0;node.Q.value=['lowpass','highpass'].includes(node.type)?-3.01029995664:Math.SQRT1_2;
  // All stages use the same audio-rate cutoff and detune controls.
  owner.nodes.push(node);filters.push(node);output.connect(node);output=node;
 }return {input:filter,output,filters};
}

export function cutoffDestination(context,filters,start,end,owner){
 const control=context.createConstantSource();control.offset.value=0;for(const f of filters)control.connect(f.detune);owner.sources.push(control);control.start(start);control.stop(end);return control.offset;
}
