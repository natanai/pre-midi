// Canonical visual coverage cases for the authored sound controls.
// Each case is an existing patch path and a value that must change its diagram.
// Dependencies (e.g. noise decay needs audible noise) are enabled below.
import test from "node:test";
import assert from "node:assert/strict";
import {makePatch} from "../synth.js";
import {diagram} from "../soundIllustrations.js";
import {defaultSource} from "../src/dsp/modulation.js";

const copy=value=>structuredClone(value);
const set=(patch,path,value)=>{
 let ref=patch;
 for(const key of path.slice(0,-1))ref=ref[key];
 ref[path.at(-1)]=value;
 return patch;
};
const sample=()=>({
 type:"sample",zones:[{assetId:"recording",root:60}],
 gain:.9,transpose:0,pan:0,strumMs:0,attack:.07,release:.28,
 followPitch:true,oneShot:false,preserveDynamics:false,
 movement:{rate:4,depth:24,delay:.15,glide:3,glideTime:.3,
  tremolo:.3,tremoloRate:4,tone:.3,toneRate:2},
 bend:{shape:"wave",amount:2,rate:3}
});
const synth=()=>{
 const p=makePatch("init");
 p.filter.sweep=1;p.noise=.35;p.noiseDecay=.65;
 p.movement.depth=24;p.movement.glide=3;p.movement.tremolo=.35;
 p.movement.tone=.35;p.movement.delay=.1;
 p.bend.shape="wave";p.bend.amount=3;
 p.effects.delayMix=.5;p.effects.delayFeedback=.4;
 p.oscillators[0].wave="harmonic";
 p.oscillators[0].harmonics=Array.from({length:32},(_,i)=>i===0?1:.04);
 p.oscillators[1].level=.35;
 return p;
};
const mod=kind=>{
 const p=synth();
 p.version=2;
 p.modulation={version:1,routes:[{id:"visual",
  source:defaultSource(kind),target:"filter.cutoff",unit:"octaves",
  depth:2,polarity:"bipolar",smoothing:.005}]};
 return p;
};
const cases=[
 // Source frequencies, harmonic composition, individual source gain.
 ["oscillators","oscillators.0.wave","square"],
 ["oscillators","oscillators.0.level",.27],
 ["oscillators","oscillators.0.octave",1],
 ["oscillators","oscillators.0.detune",75],
 ["oscillators","oscillators.0.harmonics.0",.2],
 ["oscillators","oscillators.0.harmonics.31",.9],
 ["oscillators","oscillators.1.wave","square"],
 ["oscillators","oscillators.1.level",.75],
 ["oscillators","oscillators.1.octave",1],
 ["oscillators","oscillators.1.detune",-63],
 ["envelope","envelope.attack",1.3],
 ["envelope","envelope.decay",.85],
 ["envelope","envelope.sustain",.12],
 ["envelope","envelope.release",1.8],
 ["filter","filter.type","highpass"],
 ["filter","filter.cutoff",1500],
 ["filter","filter.resonance",10],
 ["filter","filter.sweep",-3],
 ["filter","filter.sweepTime",2.1],
 ["filter","noise",.8],
 ["filter","noiseDecay",3.2],
 ["movement","bend.shape","fall"],
 ["movement","bend.amount",8],
 ["movement","bend.rate",10],
 ["movement","movement.rate",11],
 ["movement","movement.depth",70],
 ["movement","movement.delay",.9],
 ["movement","movement.glide",-5],
 ["movement","movement.glideTime",2.2],
 ["movement","movement.tremolo",.75],
 ["movement","movement.tremoloRate",10],
 ["movement","movement.tone",.8],
 ["movement","movement.toneRate",7],
 ["movement","pan",-.7],
 ["distortion","effects.drive",.65],
 ["delay","effects.delayMix",.85],
 ["delay","effects.delayTime",.85],
 ["delay","effects.delayFeedback",.75]
].map(([kind,path,value])=>({kind,path,value,create:synth}));
cases.push(...[
 ["filter","filter.type","notch"],
 ["filter","filter.cutoff",2000],
 ["filter","filter.resonance",10],
 ["filter","drive",.8],
 ["sample","attack",.8],
 ["sample","release",1.7],
 ["sample","gain",1.8],
 ["sample","transpose",12],
 ["sample","pan",-.8],
 ["sample","strumMs",21],
 ["sample","followPitch",false],
 ["sample","oneShot",true],
 ["sample","preserveDynamics",true],
 ["sample","zones.0.root",74],
 ["movement","bend.shape","fall"],
 ["movement","bend.amount",7],
 ["movement","bend.rate",8],
 ["movement","movement.glide",-5],
 ["movement","movement.glideTime",1.5],
 ["movement","movement.depth",75],
 ["movement","movement.rate",10],
 ["movement","movement.delay",.8],
 ["movement","movement.tremolo",.8],
 ["movement","movement.tremoloRate",9]
].map(([kind,path,value])=>({kind,path,value,create:sample})));
cases.push(...[
 ["modulation","modulation.routes.0.depth",4,()=>mod("lfo")],
 ["modulation","modulation.routes.0.polarity","unipolar",()=>mod("lfo")],
 ["modulation","modulation.routes.0.target","pan",()=>mod("lfo")],
 ["modulation","modulation.routes.0.source.rate",8,()=>mod("lfo")],
 ["modulation","modulation.routes.0.source.kind","velocity",()=>mod("lfo")],
 ["modulation","modulation.routes.0.source.envelope.attack",2,()=>mod("envelope")],
 ["modulation","modulation.routes.0.source.envelope.decay",1.4,()=>mod("envelope")],
 ["modulation","modulation.routes.0.source.envelope.sustain",.2,()=>mod("envelope")],
 ["modulation","modulation.routes.0.source.envelope.release",2.1,()=>mod("envelope")]
].map(([kind,path,value,create])=>({kind,path,value,create})));

test("every mapped sound control visibly changes its corresponding illustration",async t=>{
 for(const item of cases){
  await t.test(item.create().type+" "+item.path,()=>{
   const before=item.create(),after=copy(before),path=item.path.split(".").map(p=>/^\\d+$/.test(p)?Number(p):p);
   set(after,path,item.value);
   const a=diagram(before,item.kind),b=diagram(after,item.kind);
   const visual=o=>JSON.stringify({paths:o.paths,labels:o.labels,handles:o.handles});
   assert.notEqual(visual(a),visual(b),item.path+" does not affect "+item.kind);
  });
 }
});
test("visual control map has unique context-qualified paths",()=>{
 const seen=new Set();
 for(const item of cases){
  const key=item.create().type+"/"+item.kind+"/"+item.path;
  assert.ok(!seen.has(key),"duplicate visual coverage "+key);
  seen.add(key);
 }
});
