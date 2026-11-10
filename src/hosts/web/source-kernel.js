import initialize from './vendor/signalsmith-stretch.js';
// Runs in a preparation Worker, never in the scheduling/UI or audio callback.
export async function processSourceChannels(channels,rate,p){
 if(!p||!Number.isFinite(p.time)||p.time<.5||p.time>2||!Number.isFinite(p.semitones)||Math.abs(p.semitones)>48||!Number.isFinite(p.formant)||Math.abs(p.formant)>12||typeof p.preserve!=='boolean'||typeof p.reverse!=='boolean')throw Error('Invalid source pitch/time parameters');
 const count=channels[0]?.length??0,outputCount=Math.round(count*p.time),spectral=p.time!==1||p.semitones!==0||p.formant!==0;
 if(!count||!channels.length||channels.some(c=>c.length!==count)||!Number.isFinite(rate)||rate<8000||rate>192000||outputCount<1||outputCount>rate*602||outputCount*channels.length>128000000)throw Error('Invalid source PCM dimensions');
 if(spectral&&channels.length>2)throw Error('Independent pitch/time/formants support mono or stereo sources; downmix the recording first');
 if(!spectral)return channels.map(c=>p.reverse?c.slice().reverse():c.slice());
 if((count+outputCount)*channels.length*4>256*1024*1024)throw Error('Source processing scratch exceeds 256 MiB');
 const wasm=await initialize({crypto:{getRandomValues:bytes=>{bytes.fill(0);return bytes;}}});wasm._presetDefault(channels.length,rate);wasm._setTransposeSemitones(p.semitones,8000/rate);wasm._setFormantSemitones(p.formant,Number(p.preserve));wasm._setFormantBase(0);
 const before=wasm._inputLatency(),after=wasm._outputLatency(),length=Math.max(before,count,outputCount,after),pointer=wasm._setBuffers(channels.length,length),base=pointer/4;
 const heap=()=>new Float32Array(wasm.HEAP8.buffer);
 const write=(offset,size)=>{const data=heap();for(let c=0;c<channels.length;c++){const at=base+c*length;data.fill(0,at,at+size);for(let i=0;i<size;i++){const n=offset+i;if(n<count)data[at+i]=channels[c][p.reverse?count-1-n:n];}}};
 write(0,before);wasm._seek(before,1/p.time);write(before,count);wasm._process(count,outputCount);
 const result=channels.map((_,c)=>{const at=base+(c+channels.length)*length;return heap().slice(at+after,at+outputCount);});
 wasm._flush(after);for(let c=0;c<channels.length;c++){const out=new Float32Array(outputCount),at=base+(c+channels.length)*length;out.set(result[c]);out.set(heap().subarray(at+Math.max(0,after-outputCount),at+after),Math.max(0,outputCount-after));result[c]=out;}
 for(const data of result)for(const value of data)if(!Number.isFinite(value)||Math.abs(value)>32)throw Error('Source processor exceeded its finite output bound');
 return result;
}
