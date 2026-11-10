import {sampleLoopFrames} from '../../dsp/sample-loop.js';
// Weak ownership follows immutable musical snapshots, not a growing recipe
// dictionary. Cropped copies are made before playback, never in its scheduler.
const entries=new WeakMap();
export function prepareSampleLoop(context,zone,buffer,region,loop){
 if(!loop)return null;
 let sources=entries.get(zone);if(!sources){sources=new WeakMap();entries.set(zone,sources);}
 const signature=JSON.stringify([region.offset,region.sourceLength,loop]);
 const prior=sources.get(buffer);if(prior?.signature===signature)return prior;
 const rate=buffer.sampleRate,first=Math.floor(region.offset*rate+1e-7),last=Math.min(buffer.length,Math.ceil(Math.min(region.offset+region.sourceLength,loop.end)*rate-1e-7)),frames=sampleLoopFrames(loop,rate);
 if(frames.start<first||frames.end>last)throw Error('Sample loop is outside its decoded source');
 if((last-first+1)*buffer.numberOfChannels*4>256*1024*1024)throw Error('Sample loop preparation exceeds the 256 MiB PCM limit');
 const output=context.createBuffer(buffer.numberOfChannels,last-first+1,rate);
 for(let ch=0;ch<buffer.numberOfChannels;ch++){
  const raw=buffer.getChannelData(ch),data=output.getChannelData(ch);data.set(raw.subarray(first,last));
  for(let i=0;i<frames.fade;i++){const mix=i/frames.fade,tail=frames.end-frames.fade+i;data[tail-first]=raw[tail]*(1-mix)+raw[frames.start+i]*mix;}
  // Some BufferSource implementations sample the exact loop endpoint before
  // wrapping. Give that interpolation tap the same value as the loop head.
  data[frames.end-first]=data[frames.resume-first];
 }
 const result={signature,buffer:output,offset:region.offset-first/rate,start:(frames.resume-first)/rate,end:(frames.end-first)/rate};sources.set(buffer,result);return result;
}
export function preparedSampleLoop(zone,buffer,region,loop){
 if(!loop)return null;
 const result=entries.get(zone)?.get(buffer);
 if(!result||result.signature!==JSON.stringify([region.offset,region.sourceLength,loop]))throw Error('Sample loop is still preparing; try playback again');return result;
}
