// Decode PCM WAV at its original rate before conversion. Use a high staging
// rate for the codecs whose sample rate the browser decoder owns.
function wavSourceRate(data){
 const view=new DataView(data);
 if(view.byteLength<12||view.getUint32(0)!==0x52494646||view.getUint32(8)!==0x57415645)return null;
 for(let offset=12;offset+8<=view.byteLength;){
  const length=view.getUint32(offset+4,true);
  if(length>view.byteLength-offset-8)return null;
  if(view.getUint32(offset)===0x666d7420&&length>=16){
   const rate=view.getUint32(offset+12,true);
   return rate>=8000&&rate<=192000?rate:null;
  }
  offset+=8+length+(length&1);
 }
 return null;
}

// Match native/sample.hpp's 64-tap, 1024-phase Blackman-windowed sinc
// asset conversion. These kernels are reused across assets in one export.
const taps=64,phases=1024;
function kernelsFor(from,to){
 const kernels=new Float32Array(phases*taps),cutoff=.94*Math.min(1,to/from);
 for(let phase=0;phase<phases;phase++){
  const offset=phase*taps;let sum=0;
  for(let k=0;k<taps;k++){
   const angle=Math.PI*(k-31-phase/phases)*cutoff;
   const window=.42-.5*Math.cos(2*Math.PI*k/(taps-1))+.08*Math.cos(4*Math.PI*k/(taps-1));
   kernels[offset+k]=(Math.abs(angle)<1e-12?1:Math.sin(angle)/angle)*cutoff*window;
   sum+=kernels[offset+k];
  }
  for(let k=0;k<taps;k++)kernels[offset+k]/=sum;
 }
 return kernels;
}

async function convert(buffer,context,kernels){
 const from=buffer.sampleRate,to=context.sampleRate,length=Math.ceil(buffer.length*to/from);
 const output=context.createBuffer(buffer.numberOfChannels,length,to);
 const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>[buffer.getChannelData(i),output.getChannelData(i)]);
 for(let start=0;start<length;start+=32768){
  for(let i=start;i<Math.min(start+32768,length);i++){
   const position=i*from/to,center=Math.floor(position);
   const kernel=Math.min(phases-1,Math.floor((position-center)*phases))*taps;
   const origin=center-31,first=Math.max(0,-origin),end=Math.min(taps,buffer.length-origin);
   for(const [input,channel] of channels){
    let value=0;
    for(let k=first;k<end;k++)value+=input[origin+k]*kernels[kernel+k];
    channel[i]=value;
   }
  }
  if(start+32768<length)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return output;
}
export function createExportAssetDecoder(context){
 const decoders=new Map([[context.sampleRate,context]]),kernels=new Map();
 return async bytes=>{
  const rate=wavSourceRate(bytes)??96000;
  if(!decoders.has(rate))decoders.set(rate,new OfflineAudioContext(2,1,rate));
  const buffer=await decoders.get(rate).decodeAudioData(bytes);
  if(buffer.sampleRate===context.sampleRate)return buffer;
  if(!kernels.has(buffer.sampleRate))kernels.set(buffer.sampleRate,kernelsFor(buffer.sampleRate,context.sampleRate));
  return convert(buffer,context,kernels.get(buffer.sampleRate));
 };
}
