// Deterministic, original 22,050 Hz mono / 16-bit factory WAVs.
// Run: node scripts/generate-lofi-samples.mjs
// Every source is unique; no recording is reused across these catalog sounds.
import {writeFile,mkdir} from "node:fs/promises";
const SPECS=[
  {
    "id": "felt-upright-c4",
    "root": 60,
    "duration": 2.65,
    "kind": "Keys",
    "name": "Felt Upright"
  },
  {
    "id": "worn-reed-c4",
    "root": 60,
    "duration": 2.2,
    "kind": "Keys",
    "name": "Worn Reed Keys"
  },
  {
    "id": "thumb-tines-c4",
    "root": 60,
    "duration": 1.9,
    "kind": "Keys",
    "name": "Thumb Tines"
  },
  {
    "id": "tape-celesta-c5",
    "root": 72,
    "duration": 2.8,
    "kind": "Keys",
    "name": "Tape Celesta"
  },
  {
    "id": "dusty-vibes-c4",
    "root": 60,
    "duration": 3.1,
    "kind": "Keys",
    "name": "Dusty Vibraphone"
  },
  {
    "id": "tape-kick-01",
    "root": 60,
    "duration": 0.78,
    "kind": "Drums",
    "name": "Tape Kick"
  },
  {
    "id": "cardboard-snare-01",
    "root": 60,
    "duration": 0.68,
    "kind": "Drums",
    "name": "Cardboard Snare"
  },
  {
    "id": "brushed-snare-01",
    "root": 60,
    "duration": 0.92,
    "kind": "Drums",
    "name": "Brush Snare"
  },
  {
    "id": "soft-hat-01",
    "root": 60,
    "duration": 0.32,
    "kind": "Drums",
    "name": "Soft Hat"
  },
  {
    "id": "washed-hat-01",
    "root": 60,
    "duration": 1.02,
    "kind": "Drums",
    "name": "Washed Open Hat"
  },
  {
    "id": "vinyl-rim-01",
    "root": 60,
    "duration": 0.34,
    "kind": "Drums",
    "name": "Vinyl Rim"
  },
  {
    "id": "dusty-clap-01",
    "root": 60,
    "duration": 0.64,
    "kind": "Drums",
    "name": "Dusty Clap"
  },
  {
    "id": "loose-shaker-01",
    "root": 60,
    "duration": 0.54,
    "kind": "Drums",
    "name": "Loose Shaker"
  },
  {
    "id": "wood-tom-01",
    "root": 60,
    "duration": 0.8,
    "kind": "Drums",
    "name": "Wood Tom"
  }
];
function renderWav(spec){
 const rate=22050,N=Math.floor(rate*spec.duration),TAU=2*Math.PI;
 let seed=2166136261>>>0;
 for(const c of spec.id)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
 const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
 const f=440*2**((spec.root-69)/12);
 const env=(t,a,d)=>(1-Math.exp(-t/a))*Math.exp(-t/d);
 const s=(freq,t)=>Math.sin(TAU*freq*t);
 const values=new Float64Array(N);
 let lo=0,sub=0,prev=0,max=0;
 for(let i=0;i<N;i++){
  const t=i/rate,r=noise();
  lo+=.055*(r-lo);
  sub+=.007*(r-sub);
  const hp=r-lo, mid=lo-sub;
  const flutter=t+.00019*Math.sin(TAU*5.17*t)+.000055*Math.sin(TAU*.77*t);
  const end=Math.min(1,(N-i)/(rate*.035));
  let v=0;
  switch(spec.id){
   case "felt-upright-c4":{
    const body=(s(f*.9992,flutter)+.9*s(f*1.0007,flutter)+.3*s(2.004*f,flutter)+.15*s(3.011*f,flutter));
    v=.43*env(t,.007,1.05)*body+.075*Math.exp(-t*67)*sub+.018*Math.exp(-t*5)*lo;
    break;
   }
   case "worn-reed-c4":{
    const body=.83*s(f,flutter)+.37*s(2*f,flutter+.00013*s(4,t))+.28*s(3*f,flutter)+.14*s(5*f,flutter);
    v=.67*env(t,.004,1.65)*Math.tanh(1.9*body)+.065*Math.exp(-t*95)*hp+.017*Math.exp(-t*1.6)*mid;
    break;
   }
   case "thumb-tines-c4":{
    const fall=1+.007*Math.exp(-t*21);
    const wave=s(f*fall,t)+.51*s(f*2.76,t)*Math.exp(-t*7)+.28*s(f*5.38,t)*Math.exp(-t*18);
    v=.68*env(t,.002,.68)*wave+.075*Math.exp(-t*80)*lo;
    break;
   }
   case "tape-celesta-c5":{
    const wave=.82*s(f*.998,flutter)+.45*s(f*2.67,flutter)*Math.exp(-t*1.4)+.22*s(f*4.04,flutter)*Math.exp(-t*2.8)+.09*s(f*7.1,flutter)*Math.exp(-t*4);
    v=.61*env(t,.0018,1.45)*wave+.043*Math.exp(-t*56)*hp+.012*Math.exp(-t*1.3)*lo;
    break;
   }
   case "dusty-vibes-c4":{
    const beat=.93+.07*s(5.5,t),wave=s(f,flutter)+.36*s(f*3.99,flutter)*Math.exp(-t*.8)+.15*s(f*9.13,flutter)*Math.exp(-t*2.1);
    v=.68*env(t,.005,2.3)*beat*wave+.043*Math.exp(-t*45)*mid;
    break;
   }
   case "tape-kick-01":{
    const phase=TAU*(51*t+1.5*(1-Math.exp(-t/0.017)));
    v=.92*Math.sin(phase)*Math.exp(-t*11)+.17*sub*Math.exp(-t*38)+.045*hp*Math.exp(-t*160);
    v=Math.tanh(1.45*v);
    break;
   }
   case "cardboard-snare-01":{
    const body=.57*s(176,t)+.24*s(298,t);
    v=.57*body*Math.exp(-t*19)+(.57*mid+.20*hp)*Math.exp(-t*14)+.07*hp*Math.exp(-t*115);
    break;
   }
   case "brushed-snare-01":{
    const brush=(.59*hp+.54*mid)*(0.78+.22*s(27,t));
    v=.62*brush*Math.exp(-t*7.2)+.13*s(198,t)*Math.exp(-t*22)+.025*hp*Math.exp(-t*100);
    break;
   }
   case "soft-hat-01":{
    const metal=.08*s(4489,t)+.09*s(6331,t);
    v=(.64*hp+.31*mid+metal)*Math.exp(-t*29)*(1+.08*s(83,t));
    break;
   }
   case "washed-hat-01":{
    const metal=.11*s(3920,t)+.085*s(5194,t)+.07*s(6831,t);
    v=(.64*hp+.26*mid+metal)*Math.exp(-t*5.2)*(0.86+.14*s(14,t));
    break;
   }
   case "vinyl-rim-01":{
    const click=.45*hp*Math.exp(-t*120);
    v=click+.53*s(820,t)*Math.exp(-t*36)+.22*s(1410,t)*Math.exp(-t*69)+.19*mid*Math.exp(-t*50);
    break;
   }
   case "dusty-clap-01":{
    const bursts=Math.exp(-t*85)+.83*Math.exp(-Math.max(0,t-.018)*112)*(t>=.018)+.72*Math.exp(-Math.max(0,t-.038)*85)*(t>=.038);
    v=(.51*hp+.46*mid)*bursts+.16*mid*Math.exp(-t*7.2);
    break;
   }
   case "loose-shaker-01":{
    const grains=Math.pow(Math.max(0,Math.sin(TAU*19*t)),5);
    v=(.64*hp+.26*mid)*(.18+.82*grains)*Math.exp(-t*7.6);
    break;
   }
   case "wood-tom-01":{
    const phase=TAU*(119*t+.72*(1-Math.exp(-t/.041)));
    v=.66*Math.sin(phase)*Math.exp(-t*7.2)+.3*s(2.11*119,t)*Math.exp(-t*17)+.17*mid*Math.exp(-t*42);
    break;
   }
   default:throw Error("Unrecognized sample "+spec.id);
  }
  v*=Math.max(0,end);
  values[i]=v;
  max=Math.max(max,Math.abs(v));
 }
 if(max<.001)throw Error("Silent sample "+spec.id);
 const scale=Math.min(1.8,.82/max),bytes=new Uint8Array(44+N*2),dv=new DataView(bytes.buffer);
 const put=(o,str)=>{for(let j=0;j<str.length;j++)bytes[o+j]=str.charCodeAt(j);};
 put(0,"RIFF");dv.setUint32(4,36+N*2,true);put(8,"WAVE");put(12,"fmt ");
 dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);
 dv.setUint32(24,rate,true);dv.setUint32(28,rate*2,true);
 dv.setUint16(32,2,true);dv.setUint16(34,16,true);put(36,"data");dv.setUint32(40,N*2,true);
 for(let i=0;i<N;i++)dv.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,values[i]*scale))*32767),true);
 return bytes;
}
await mkdir(new URL("../factory-samples/",import.meta.url),{recursive:true});
for(const spec of SPECS){
 const bytes=renderWav(spec);
 await writeFile(new URL("../factory-samples/"+spec.id+".wav",import.meta.url),bytes);
 console.log(spec.id,bytes.byteLength);
}
