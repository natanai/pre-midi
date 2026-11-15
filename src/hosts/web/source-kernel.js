import {preparePitchCorrection,PITCH_CORRECTION_UPDATE,validPitchCorrection} from '../../dsp/pitch-correction.js';
import initialize from './vendor/signalsmith-stretch.js';
// Runs in a preparation Worker, never in the scheduling/UI or audio callback.
export async function processSourceChannels(channels,rate,p){
 if(!p||!Number.isFinite(p.time)||p.time<.5||p.time>2||!Number.isFinite(p.semitones)||Math.abs(p.semitones)>48||!Number.isFinite(p.formant)||Math.abs(p.formant)>12||typeof p.preserve!=='boolean'||typeof p.reverse!=='boolean'||!validPitchCorrection(p.tuneAmount,p.tuneResponse,p.tuneMask))throw Error('Invalid source pitch/time parameters');
 const count=channels[0]?.length??0,outputCount=Math.round(count*p.time),spectral=p.time!==1||p.semitones!==0||p.formant!==0;
 if(!count||!channels.length||channels.some(c=>c.length!==count)||!Number.isFinite(rate)||rate<8000||rate>192000||outputCount<1||outputCount>rate*602||outputCount*channels.length>128000000)throw Error('Invalid source PCM dimensions');
 if((spectral||p.tuneAmount)&&channels.length>2)throw Error('Independent pitch, time, formants and tuning support mono or stereo sources; downmix the recording first');
 if((spectral||p.tuneAmount)&&(count+outputCount)*channels.length*4>256*1024*1024)throw Error('Source processing scratch exceeds 256 MiB');
 const correction=preparePitchCorrection(channels,rate,p);
 if(!spectral&&!correction)return channels.map(c=>p.reverse?c.slice().reverse():c.slice());
 const wasm=await initialize({crypto:{getRandomValues:bytes=>{bytes.fill(0);return bytes;}}});wasm._presetDefault(channels.length,rate);wasm._setTransposeSemitones(p.semitones,8000/rate);wasm._setFormantSemitones(p.formant,Number(p.preserve));wasm._setFormantBase(0);
 const before=wasm._inputLatency(),after=wasm._outputLatency();
 const hop=correction?Math.round(rate*PITCH_CORRECTION_UPDATE):count;
 const length=Math.max(before,hop,Math.ceil(hop*p.time)+1,after),base=wasm._setBuffers(channels.length,length)/4;
 const heap=()=>new Float32Array(wasm.HEAP8.buffer),result=channels.map(()=>new Float32Array(outputCount));
 const write=(offset,size)=>{
  const data=heap();
  for(let c=0;c<channels.length;c++){
   const at=base+c*length;
   for(let i=0;i<size;i++){const n=offset+i;data[at+i]=n<count?channels[c][p.reverse?count-1-n:n]:0;}
  }
 };
 const read=(offset,size)=>{
  const from=Math.max(0,after-offset),to=Math.min(size,outputCount+after-offset);
  if(from>=to)return;
  const data=heap();
  for(let c=0;c<channels.length;c++){
   const at=base+(c+channels.length)*length;
   result[c].set(data.subarray(at+from,at+to),offset+from-after);
  }
 };
 write(0,before);wasm._seek(before,1/p.time);
 let produced=0;
 for(let offset=0;offset<count;){
  const end=Math.min(count,offset+hop),target=Math.round(end*p.time);
  if(correction)wasm._setTransposeSemitones(Math.max(-48,Math.min(48,p.semitones+correction[offset/hop])),8000/rate);
  write(before+offset,end-offset);wasm._process(end-offset,target-produced);
  read(produced,target-produced);
  offset=end;produced=target;
 }
 wasm._flush(after);read(outputCount,after);
 for(const data of result)for(const value of data)if(!Number.isFinite(value)||Math.abs(value)>32)throw Error('Source processor exceeded its finite output bound');
 return result;
}
