export const WAV_RATES=Object.freeze([44100,48000,96000]);
export const WAV_BIT_DEPTHS=Object.freeze([16,24,32]);
export function wavExportOptions({rate=44100,bits=16,gainDb=0,dither=false}={}){
 if(!WAV_RATES.includes(rate)||!WAV_BIT_DEPTHS.includes(bits)||!Number.isFinite(gainDb)||gainDb< -36||gainDb>6||typeof dither!=='boolean')
  throw Error('Invalid WAV export settings');
 return {rate,bits,gain:.85*10**(gainDb/20),dither:dither&&bits!==32};
}

// ITU-R BS.1770-5 Annex 2, four-phase interpolator, integer coefficients
// scaled by 2^14. Kept in sync with native/wav-render.hpp.
const phases=[
 [28,180,-322,544,-974,2250,15928,-1676,780,-436,244,-136],
 [-478,480,-848,1460,-2728,7620,12776,-3282,1664,-954,542,-310],
 [-310,542,-954,1664,-3282,12776,7620,-2728,1460,-848,480,-478],
 [-136,244,-436,780,-1676,15928,2250,-974,544,-322,180,28]
];
const tile=16384;
const dB=value=>value>0?(20*Math.log10(value)).toFixed(1):'−∞';
export function wavLevelSummary({peak,rms,truePeak,clipped},bits){
 const levels='peak '+dB(peak)+' dbfs · rms '+dB(rms)+' dbfs · true peak '+dB(truePeak)+' dbtp';
 if(clipped)return levels+' · '+clipped+' '+(bits===32?'over-range':'clipped')+' samples';
 return truePeak>1?levels+' · intersample overload':levels;
}

export async function encodeRenderedWav(channels,rate,{bits=16,dither=false,measure=true}={}){
 const frames=channels[0]?.length,count=channels.length;
 if(![1,2].includes(count)||!frames||channels.some(c=>c.length!==frames)||!WAV_BIT_DEPTHS.includes(bits)||!WAV_RATES.includes(rate))
  throw Error('Invalid WAV output dimensions');
 const float=bits===32,width=bits/8,align=count*width,dataSize=frames*align,header=float?58:44;
 const padding=dataSize%2;
 const output=new ArrayBuffer(header+dataSize+padding),view=new DataView(output);
 const text=(at,label)=>{for(let i=0;i<label.length;i++)view.setUint8(at+i,label.charCodeAt(i));};
 const u32=(at,value)=>view.setUint32(at,value,true),u16=(at,value)=>view.setUint16(at,value,true);
 text(0,'RIFF');u32(4,output.byteLength-8);text(8,'WAVE');text(12,'fmt ');
 u32(16,float?18:16);u16(20,float?3:1);u16(22,count);u32(24,rate);u32(28,rate*align);u16(32,align);u16(34,bits);
 if(float){u16(36,0);text(38,'fact');u32(42,4);u32(46,frames);}
 text(header-8,'data');u32(header-4,dataSize);
 let seed=0x17ca4f9b,peak=0,truePeak=0,sum=0,clipped=0,write=header,cursor=0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const history=measure?channels.map(()=>new Float64Array(24)):null;
 const interpolate=(c,value)=>{
  const data=history[c];data[cursor]=data[cursor+12]=value;
  for(const phase of phases){
   let total=0;
   for(let i=0;i<12;i++)total+=data[cursor+1+i]*phase[i];
   truePeak=Math.max(truePeak,Math.abs(total)/16384);
  }
 };
 const range=2**(bits-1);
 for(let start=0;start<frames;start+=tile){
  for(let i=start;i<Math.min(start+tile,frames);i++){
   for(let c=0;c<count;c++){
    const sample=channels[c][i];
    if(!Number.isFinite(sample))throw Error('WAV export produced a nonfinite sample');
    if(measure){
     const absolute=Math.abs(sample);peak=Math.max(peak,absolute);sum+=sample*sample;
     if(absolute>1)clipped++;
     interpolate(c,sample);
    }
    if(float)view.setFloat32(write,sample,true);
    else{
     const scaled=sample*(sample<0?range:range-1),noise=dither&&sample!==0?random()-random():0;
     const value=Math.max(-range,Math.min(range-1,Math.floor(scaled+noise+.5)));
     view.setInt16(write,value,true);
     if(bits===24)view.setUint8(write+2,value>>>16);
    }
    write+=width;
   }
   if(measure)cursor=(cursor+1)%12;
  }
  // Keep the transport and UI responsive during a large browser export.
  if(start+tile<frames)await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(measure)for(let i=0;i<11;i++){
  for(let c=0;c<count;c++)interpolate(c,0);
  cursor=(cursor+1)%12;
 }
 return {blob:new Blob([output],{type:'audio/wav'}),metrics:measure?{peak,rms:Math.sqrt(sum/(frames*count)),truePeak:Math.max(peak,truePeak),clipped}:null};
}
