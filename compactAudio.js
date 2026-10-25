// Pure 4-bit IMA ADPCM for compact, self-contained microphone sample blobs.
// A .premidi remains normal JSON music data: the sampler owns an opaque binary
// asset payload; notes and instruments remain typed, editable instructions.
// No browser audio encoder or third-party library is required to decode it.
export const COMPACT_MIME="audio/x-premidi-adpcm";
export const COMPACT_RATE=22050;
const INDEX=[-1,-1,-1,-1,2,4,6,8];
const STEP=[7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function resampleMono(input,fromRate,toRate=COMPACT_RATE){
 if(!input?.length||!Number.isFinite(fromRate)||fromRate<8000)throw Error("No playable recording.");
 const length=Math.max(1,Math.round(input.length*toRate/fromRate));
 const output=new Float32Array(length);
 for(let i=0;i<length;i++){
  const at=i*fromRate/toRate,a=Math.min(input.length-1,Math.floor(at)),b=Math.min(input.length-1,a+1),f=at-a;
  output[i]=input[a]*(1-f)+input[b]*f;
 }
 return output;
}
export function packedSize(frames){return 4+Math.ceil(Math.max(0,frames-1)/2);}
export function encodeAdpcm(pcm){
 if(!pcm?.length||pcm.length>COMPACT_RATE*4+128)throw Error("Record up to four seconds.");
 const bytes=new Uint8Array(packedSize(pcm.length));
 let predictor=clamp(Math.round(pcm[0]*32767),-32768,32767),index=0;
 new DataView(bytes.buffer).setInt16(0,predictor,true);
 bytes[2]=0;bytes[3]=0;
 for(let i=1;i<pcm.length;i++){
  const sample=clamp(Math.round(pcm[i]*32767),-32768,32767);
  const step=STEP[index],sign=sample<predictor?8:0;
  let difference=Math.abs(sample-predictor),code=0;
  if(difference>=step){code|=4;difference-=step;}
  if(difference>=step/2){code|=2;difference-=step/2;}
  if(difference>=step/4)code|=1;
  const delta=step/8+((code&4)?step:0)+((code&2)?step/2:0)+((code&1)?step/4:0);
  predictor=clamp(Math.round(predictor+(sign?-delta:delta)),-32768,32767);
  index=clamp(index+INDEX[code],0,88);
  const nibble=sign|code,offset=4+Math.floor((i-1)/2);
  if(i%2)bytes[offset]|=nibble;
  else bytes[offset]|=nibble<<4;
 }
 return bytes;
}
export function decodeAdpcm(bytes,frames){
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(frames)||frames<1||
  frames>COMPACT_RATE*4+128||bytes.length!==packedSize(frames)||bytes[2]>88||bytes[3]!==0)
  throw Error("Invalid packed sample.");
 const result=new Float32Array(frames);
 let predictor=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getInt16(0,true);
 let index=bytes[2];result[0]=predictor/32768;
 for(let i=1;i<frames;i++){
  const packed=bytes[4+Math.floor((i-1)/2)];
  const nibble=i%2?packed&15:packed>>4;
  const step=STEP[index];
  const delta=step/8+((nibble&4)?step:0)+((nibble&2)?step/2:0)+((nibble&1)?step/4:0);
  predictor=clamp(Math.round(predictor+((nibble&8)?-delta:delta)),-32768,32767);
  index=clamp(index+INDEX[nibble&7],0,88);
  result[i]=predictor/32768;
 }
 return result;
}
