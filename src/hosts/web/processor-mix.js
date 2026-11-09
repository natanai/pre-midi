import {processorKind} from '../../dsp/processing-graph.js';
import {processorMix} from '../../dsp/processing-chain.js';
import {configureDriveShaper} from '../../../audioEffects.js';
const latencies=new Map();
// Hosts differ in WaveShaper oversampling latency. Measure once per sample rate
// before scheduling, never in a device callback or during a held gesture.
export async function prepareProcessorMix(context){
 const rate=context.sampleRate;if(!latencies.has(rate))latencies.set(rate,(async()=>{
  const Offline=globalThis.OfflineAudioContext;
  if(!Offline)throw Error('Offline audio is required to align processor mixes');
  const probe=new Offline(1,1024,rate),source=probe.createBufferSource(),buffer=probe.createBuffer(1,1024,rate),shaper=probe.createWaveShaper();
  buffer.getChannelData(0)[0]=.2;source.buffer=buffer;configureDriveShaper(shaper,.2);source.connect(shaper);shaper.connect(probe.destination);source.start();
  const data=(await probe.startRendering()).getChannelData(0);let peak=0;
  for(let i=1;i<data.length;i++)if(Math.abs(data[i])>Math.abs(data[peak]))peak=i;
  return peak;
 })());
 const frames=await latencies.get(rate);context.processorMixLatency=frames;return frames;
}
export function connectProcessorMix(context,signal,stage,patch,id,owner){
 const mix=processorMix(patch,id);if(mix===0)return signal;
 signal.connect(stage.input);if(mix===1)return stage.output;
 const add=node=>{owner.nodes.push(node);return node;};
 const dry=add(context.createGain()),wet=add(context.createGain()),sum=add(context.createGain());
 dry.gain.value=1-mix;wet.gain.value=mix;
 if(processorKind(patch,id)==='drive'){
  if(!Number.isInteger(context.processorMixLatency))throw Error('Prepare processor latency before mixing distortion');
  const delay=add(context.createDelay(1));delay.delayTime.value=context.processorMixLatency/context.sampleRate;
  signal.connect(delay);delay.connect(dry);
 }else signal.connect(dry);
 dry.connect(sum);stage.output.connect(wet);wet.connect(sum);return sum;
}
