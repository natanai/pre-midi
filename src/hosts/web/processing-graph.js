import {compileProcessingGraph,processorInstance,processorKind} from '../../dsp/processing-graph.js';
import {processingChain} from '../../dsp/processing-chain.js';
import {configureDriveShaper} from '../../../audioEffects.js';
import {createEq,cascadeFilter} from './equalizer.js';
import {connectProcessorMix} from './processor-mix.js';

// Source-specific adapters provide the primary stages. Added instances and
// parallel routing use this same owner and stage builder for every source.
export function connectProcessingGraph(context,signal,patch,stages,owner){
 const add=node=>{owner.nodes.push(node);return node;};
 const graph=compileProcessingGraph(patch,context.sampleRate,context.processorMixLatency??0);
 if(graph?.branches.length&&graph.nodes.some(n=>n.kind==='drive'&&!n.bypass&&n.mix>0&&n.amount>0)&&!Number.isInteger(context.processorMixLatency))throw Error('Prepare distortion latency before parallel processing');
 if(!graph){for(const id of processingChain(patch).order){const stage=stages.get(id);if(stage)signal=connectProcessorMix(context,signal,stage,patch,id,owner);}return signal;}
 for(const node of graph.nodes){
  const instance=processorInstance(patch,node.id);if(!instance||node.bypass||node.mix===0)continue;
  const p=instance.parameters;let stage;
  if(instance.kind==='filter'){
   const filter=add(context.createBiquadFilter());filter.type=p.type;filter.frequency.value=p.cutoff;filter.Q.value=p.resonance;
   stage=cascadeFilter(context,filter,{filter:p,filterStages:p.stages??1},owner);
   for(const f of stage.filters)f.frequency.value=p.cutoff;
   owner.automationTargets?.set("processor."+node.id+".cutoff",stage.filters.map(f=>f.frequency));owner.automationTargets?.set("processor."+node.id+".resonance",filter.Q);
  }else if(instance.kind==='drive'&&p.amount>0){
   const shaper=add(context.createWaveShaper()),gain=add(context.createGain());configureDriveShaper(shaper,p.amount);gain.gain.value=1/(1+p.amount*1.1);shaper.connect(gain);stage={input:shaper,output:gain};
  }else if(instance.kind==='eq')stage=createEq(context,p,owner);
  if(stage)stages.set(node.id,stage);
 }
 const serial=(input,order)=>{
  for(const index of order){const node=graph.nodes[index],stage=stages.get(node.id);if(!node.bypass&&stage)input=connectProcessorMix(context,input,stage,patch,node.id,owner);}
  return input;
 };
 signal=serial(signal,graph.order);if(!graph.branches.length)return signal;
 const sum=add(context.createGain());
 const route=(input,gain,latency)=>{
  if(!(gain>0))return;
  const width=graph.latency-latency;
  if(width){const delay=add(context.createDelay(1));delay.delayTime.value=width/context.sampleRate;input.connect(delay);input=delay;}
  const level=add(context.createGain());level.gain.value=gain;input.connect(level);level.connect(sum);
 };
 route(signal,graph.dry,0);
 for(const branch of graph.branches)route(serial(signal,branch.order),branch.gain,branch.latency);
 return sum;
}
