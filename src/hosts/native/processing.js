import {compileProcessingGraph,PROCESSOR_KINDS} from '../../dsp/processing-graph.js';
import {processingFlags,processorMix} from '../../dsp/processing-chain.js';
import {defaultEq,eqCoefficients} from '../../dsp/equalizer.js';
export const PROCESSING_TRAILER_BYTES=388;
export function encodeProcessing(patch,rate,u32,f64){
 u32(processingFlags(patch));for(const id of ['filter','drive','eq'])f64(processorMix(patch,id));u32(patch.filterStages??1);
 const bands=(patch.eq??defaultEq()).bands;
 for(let i=0;i<8;i++)(bands[i]?eqCoefficients(bands[i],rate):[1,0,0,0,0]).forEach(f64);
 f64(patch.stereoWidth??1);f64(patch.msBalance??0);f64(patch.delayTone??20000);u32(patch.delayPingPong?1:0);
 const graph=compileProcessingGraph(patch,rate);u32(graph?.nodes.length??0);if(!graph)return;
 for(const n of graph.nodes){
  u32(PROCESSOR_KINDS.indexOf(n.kind));u32(n.primary?1:0);u32(n.bypass?1:0);f64(n.mix);
  u32(n.type);f64(n.cutoff);f64(n.resonance);u32(n.stages);f64(n.amount);
  for(const band of n.coefficients)band.forEach(f64);
 }
 const order=ids=>{u32(ids.length);ids.forEach(u32);};order(graph.order);
 u32(graph.branches.length);f64(graph.dry);for(const branch of graph.branches){f64(branch.gain);order(branch.order);}
}
