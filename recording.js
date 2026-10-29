// Native browser microphone recordings become the existing WAV sample assets.
// Detection is only a suggestion: monophonic, stable tones work best. Percussion
// and chords have no guaranteed single fundamental and must never be mislabeled.
export const RECORDER_DURATIONS=[.75,1.5,3,4];
export const RECORDING_RATE=44100;
export function pitchLabel(midi){
 if(!Number.isInteger(midi)||midi<0||midi>127)return "Unknown";
 const notes=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
 return notes[midi%12]+(Math.floor(midi/12)-1);
}
export const pitchFromHz=hz=>hz>0&&Number.isFinite(hz)?
 Math.round(69+12*Math.log2(hz/440)):null;
export const hzFromPitch=pitch=>440*2**((pitch-69)/12);
export function estimatePitch(samples,sampleRate){
 if(!samples||samples.length<512||!Number.isFinite(sampleRate)||sampleRate<8000)return null;
 // YIN-style normalized difference picks the earliest plausible fundamental.
 // We examine multiple short regions, avoiding the transient at the very start
 // of plucked guitar notes. A median rejects unstable attack estimates.
 const region=Math.min(4096,Math.floor(samples.length/4));
 const firstLag=Math.max(2,Math.floor(sampleRate/1000));
 const lastLag=Math.min(region-2,Math.ceil(sampleRate/75));
 if(lastLag<=firstLag)return null;
 const guesses=[];
 const centers=[.19,.33,.50,.66].map(f=>Math.max(0,Math.floor(samples.length*f-region/2)));
 for(const offset of centers){
  if(offset+region+lastLag>=samples.length)continue;
  const frame=samples.subarray(offset,offset+region+lastLag);
  let rms=0;for(let i=0;i<region;i++)rms+=frame[i]*frame[i];
  rms=Math.sqrt(rms/region);
  if(rms<.008)continue;
  const differences=new Float64Array(lastLag+1);
  for(let lag=firstLag;lag<=lastLag;lag++){
   let diff=0;
   for(let i=0;i<region;i++){
    const error=frame[i]-frame[i+lag];
    diff+=error*error;
   }
   differences[lag]=diff;
  }
  // Cumulative mean difference, computed from 1 to avoid bias at smaller lags.
  let cumulative=0,best=-1,bestValue=Infinity;
  for(let lag=1;lag<=lastLag;lag++){
   cumulative+=differences[lag];
   if(lag<firstLag)continue;
   const normalized=differences[lag]*lag/Math.max(1e-12,cumulative);
   if(normalized<bestValue){best=lag;bestValue=normalized;}
   if(normalized<.14 && lag+1<=lastLag){
    const next=differences[lag+1]*(lag+1)/Math.max(1e-12,cumulative+differences[lag+1]);
    if(next>normalized){best=lag;bestValue=normalized;break;}
   }
  }
  if(best<0||bestValue>.20)continue;
  const l=best;
  const a=l>firstLag?differences[l-1]:differences[l],
        b=differences[l],c=l<lastLag?differences[l+1]:differences[l];
  const d=a-2*b+c;
  const refined=l+(Math.abs(d)>1e-12?.5*(a-c)/d:0);
  const hz=sampleRate/refined;
  if(hz>=75&&hz<=1000)guesses.push({hz,midi:69+12*Math.log2(hz/440),quality:1-bestValue});
 }
 if(guesses.length<2)return null;
 guesses.sort((a,b)=>a.midi-b.midi);
 const middle=guesses[Math.floor(guesses.length/2)].midi;
 const agreeing=guesses.filter(g=>Math.abs(g.midi-middle)<.55);
 if(agreeing.length<2)return null;
 const average=agreeing.reduce((sum,g)=>sum+g.midi,0)/agreeing.length;
 const accuracy=agreeing.reduce((sum,g)=>sum+g.quality,0)/agreeing.length;
 const midi=Math.round(average);
 return {
  midi,
  hz:hzFromPitch(average),
  cents:Math.round((average-midi)*100),
  confidence:Math.round(100*Math.min(1,accuracy*agreeing.length/guesses.length))
 };
}
export function encodeMonoWav(samples,sampleRate=RECORDING_RATE){
 if(!samples||!samples.length||samples.length>sampleRate*4+5)
  throw Error("Record up to four seconds of audio.");
 if(sampleRate!==RECORDING_RATE)throw Error("Unexpected sample rate.");
 const length=44+samples.length*2,buffer=new ArrayBuffer(length),view=new DataView(buffer);
 const label=(pos,value)=>{for(let i=0;i<value.length;i++)view.setUint8(pos+i,value.charCodeAt(i));};
 label(0,"RIFF");view.setUint32(4,length-8,true);label(8,"WAVE");
 label(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);
 view.setUint16(34,16,true);label(36,"data");view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  const value=Math.max(-1,Math.min(1,samples[i]));
  view.setInt16(44+i*2,value<0?Math.round(value*32768):Math.round(value*32767),true);
 }
 return new Uint8Array(buffer);
}
export function describeRecording(samples){
 if(!samples?.length)return {rms:0,peak:0,quiet:true,clipped:false};
 let peak=0,total=0,clips=0;
 for(let i=0;i<samples.length;i++){
  const v=samples[i];peak=Math.max(peak,Math.abs(v));total+=v*v;
  if(Math.abs(v)>.99)clips++;
 }
 const rms=Math.sqrt(total/samples.length);
 return {rms,peak,quiet:rms<.008,clipped:clips>samples.length*.004};
}
export async function monoFromAudioBlob(blob,AudioContextType=globalThis.AudioContext){
 if(!blob?.size)throw Error("The microphone did not capture any audio.");
 const {nativeEnabled}=await import('./src/hosts/native/session.js');
 if(nativeEnabled()){const {decodeNativeAudio}=await import('./src/hosts/native/capture.js');return (await decodeNativeAudio(await blob.arrayBuffer(),{maxSeconds:30.05})).getChannelData(0);}
 const context=new AudioContextType();
 try{
  const audio=await context.decodeAudioData(await blob.arrayBuffer());
  if(audio.duration>30.05)throw Error("Choose a WAV up to 30 seconds long, then select a short excerpt.");
  const length=Math.round(audio.duration*RECORDING_RATE);
  if(length<=0)throw Error("No playable sound was captured.");
  // Interpolate to one portable sample rate; reduce multichannel input to mono.
  const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i));
  const values=new Float32Array(length);
  for(let i=0;i<length;i++){
   const index=i*audio.sampleRate/RECORDING_RATE;
   const lo=Math.floor(index),hi=Math.min(audio.length-1,lo+1),fraction=index-lo;
   let sum=0;
   for(const channel of channels)sum+=(channel[lo]||0)*(1-fraction)+(channel[hi]||0)*fraction;
   values[i]=sum/channels.length;
  }
  return values;
 }finally{await context.close();}
}
export async function pcmFromRecordedBlob(blob,AudioContextType=globalThis.AudioContext){
 return (await monoFromAudioBlob(blob,AudioContextType)).slice(0,4*RECORDING_RATE);
}
export function recordingExcerpt(values,start,seconds){
 if(!Number.isFinite(start)||!Number.isFinite(seconds)||start<0||seconds<.06||seconds>4||
  start*RECORDING_RATE>=values.length||Math.round((start+seconds)*RECORDING_RATE)>values.length+1)
  throw Error("Choose an excerpt between 0.06 and 4 seconds within this recording.");
 return values.slice(Math.round(start*RECORDING_RATE),Math.min(values.length,Math.round((start+seconds)*RECORDING_RATE)));
}
