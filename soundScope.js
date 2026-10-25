// Live instrument-shape visualization derived from the *same authored patch*
// parameters used by the audio runtime. Pitch trace uses expression.js math.
// For sampled instruments the upper trace uses the actual decoded recording.
import {movement,pitchCents} from "./expression.js";
import {base64ToBytes} from "./sampler.js";
const NS="http://www.w3.org/2000/svg";
const node=(tag,attributes={})=>{
 const el=document.createElementNS(NS,tag);
 for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));
 return el;
};
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const wave=(type,x)=> {
 const phase=((x/(2*Math.PI))%1)+1;
 const p=phase%1;
 if(type==="sine")return Math.sin(x);
 if(type==="triangle")return 1-4*Math.abs(p-.5);
 if(type==="square")return p<.5?1:-1;
 if(type==="sawtooth")return p*2-1;
 return Math.sin(x);
};
function envelope(env,t){
 if(t<env.attack)return clamp(t/Math.max(.001,env.attack));
 if(t<env.attack+env.decay)return 1-(1-env.sustain)*clamp((t-env.attack)/Math.max(.001,env.decay));
 return env.sustain;
}
function synthWave(patch,progress){
 const t=progress*2.2;
 const m=movement(patch);
 const fundamental=2*Math.PI*7*progress;
 const a=patch.oscillators.reduce((sum,o)=>sum+o.level,0)||1;
 let result=0;
 for(const osc of patch.oscillators){
  const detune=2**((osc.detune||0)/1200);
  const phase=fundamental*2**osc.octave*detune;
  result+=osc.level*wave(osc.wave,phase);
 }
 result/=a;
 // A simple preview of spectral smoothing, NOT a claim of sample-accurate
 // biquad output. Cutoff/drive/filter and motion all visibly affect the trace.
 const cutoff=clamp(Math.log((patch.filter.cutoff||2000)/50)/Math.log(280),0,1);
 const harmonics=patch.filter.type==="lowpass"?.2+.8*cutoff:.5+.5*(1-cutoff);
 result=result*harmonics+(1-harmonics)*Math.sin(fundamental);
 const drive=patch.effects.drive||0;
 result=Math.tanh(result*(1+drive*4))/Math.tanh(1+drive*4);
 const mod=.85+.15*Math.cos(2*Math.PI*m.toneRate*t)*(m.tone||0);
 const pulse=1-(m.tremolo||0)*.45*(1+Math.cos(2*Math.PI*m.tremoloRate*t));
 return result*envelope(patch.envelope,t)*mod*pulse;
}
function sampleWave(patch,progress,samples){
 const i=Math.min(samples.length-1,Math.floor(progress*samples.length));
 const m=movement(patch);
 const t=progress*2.2;
 const pulse=1-(m.tremolo||0)*.45*(1+Math.cos(2*Math.PI*m.tremoloRate*t));
 return samples[i]*pulse*(patch.gain??1);
}
function pathFrom(values,width,height,zero,scale){
 return values.map((v,i)=>(i?"L":"M")+((i/(values.length-1))*width).toFixed(2)+" "+(zero-v*scale).toFixed(2)).join(" ");
}
export function createSignalDisplay(root,patch,score,accent){
 root.replaceChildren();
 const wrapper=document.createElement("div");wrapper.className="signal-scope";
 const head=document.createElement("div");head.className="signal-scope-header";
 const name=document.createElement("span");name.className="signal-scope-title";
 name.textContent=patch.type==="sample"?"RECORDED SOUND":"SOUND SHAPE";
 const legend=document.createElement("span");legend.className="signal-scope-legend";
 legend.textContent="PITCH / MOVEMENT";
 head.append(name,legend);
 const svg=node("svg",{viewBox:"0 0 720 164",preserveAspectRatio:"none",role:"img",
  "aria-label":"Instrument sound shape and pitch movement visualization"});
 svg.classList.add("signal-scope-graph");
 const baseline=node("path",{d:"M0 48 H720 M0 120 H720",class:"signal-scope-guides"});
 const upper=node("path",{class:"signal-wave",fill:"none","stroke-width":"1.7"});
 const lower=node("path",{class:"signal-pitch",fill:"none","stroke-width":"2"});
 const left=node("text",{x:"8",y:"12",class:"signal-axis"});left.textContent="WAVE";
 const mid=node("text",{x:"8",y:"86",class:"signal-axis"});mid.textContent="PITCH";
 svg.append(baseline,upper,lower,left,mid);
 wrapper.append(head,svg);root.append(wrapper);
 wrapper.style.setProperty("--scope-accent",accent);
 let decoded=null;
 let selectedId=patch.type==="sample"?patch.zones[Math.floor(patch.zones.length/2)]?.assetId:null;
 if(selectedId){
  const asset=score?.samples?.find(sample=>sample.id===selectedId);
  if(asset && typeof OfflineAudioContext!=="undefined"){
   // One audio file only. Multiple recordings remain untouched and unmapped.
   try {
    const context=new OfflineAudioContext(1,1,44100);
    const bytes=base64ToBytes(asset.data);
    void context.decodeAudioData(bytes.buffer.slice(0)).then(buffer=>{
     const samples=buffer.getChannelData(0),count=250;
     decoded=Array.from({length:count},(_,i)=>{
      const from=Math.floor(i*samples.length/count),to=Math.min(samples.length,Math.floor((i+1)*samples.length/count));
      let peak=0;for(let j=from;j<to;j++)if(Math.abs(samples[j])>Math.abs(peak))peak=samples[j];
      return peak;
     });
     render(currentPatch);
    }).catch(()=>{});
   }catch{}
  }
 }
 let currentPatch=patch;
 function render(nextPatch){
  currentPatch=nextPatch;
  const m=movement(nextPatch),n=250;
  const waves=Array.from({length:n},(_,i)=>{
   const p=i/(n-1);
   return nextPatch.type==="sample"?
    decoded?sampleWave(nextPatch,p,decoded):
      Math.sin(2*Math.PI*p*11)*(.4+.6*clamp(nextPatch.gain??1,0,1))*Math.exp(-p*3):
    synthWave(nextPatch,p);
  });
  const max=Math.max(.5,...waves.map(Math.abs));
  upper.setAttribute("d",pathFrom(waves,720,80,48,34/max));
  const pitch=Array.from({length:n},(_,i)=>{
   const sec=i/(n-1)*2.2;
   return pitchCents(null,m,sec,2.2)/100+
    (m.depth||0)/100*Math.sin(2*Math.PI*m.rate*sec)*clamp((sec-m.delay)/.15);
  });
  lower.setAttribute("d",pathFrom(pitch,720,80,123,Math.min(12,20/Math.max(1,...pitch.map(Math.abs)))));
 }
 render(patch);
 return render;
}
