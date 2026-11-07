import {makePatch} from "../synth.js";
import {harmonicRecipe} from "../harmonics.js";
import {defaultSource,MOD_TARGETS} from "../src/dsp/modulation.js";

export function teachingFixtures(){
 const synth=makePatch("init");
 synth.oscillators.forEach((osc,i)=>Object.assign(osc,{wave:"harmonic",
  harmonics:harmonicRecipe("odd"),level:i?.35:.8,detune:i?12:-8}));
 synth.envelope={attack:.15,decay:.25,sustain:.55,release:.6};
 synth.filter={type:"lowpass",cutoff:2300,resonance:3,sweep:-2,sweepTime:.4};
 synth.noise=.4;synth.noiseDecay=.8;
 synth.movement={rate:5,depth:45,delay:.3,glide:-4,glideTime:.5,
  tremolo:.4,tremoloRate:4,tone:.35,toneRate:2};
 synth.bend={shape:"wave",amount:3,rate:4};
 synth.effects={drive:.3,delayMix:.4,delayTime:.25,delayFeedback:.35};
 synth.version=2;
 synth.modulation={version:1,routes:["lfo","envelope","velocity","keytrack"].map((kind,i)=>{
  const target=MOD_TARGETS[i];return {id:"audit-"+i,source:defaultSource(kind),
   target:target.id,unit:target.unit,depth:target.limit*.4,polarity:"bipolar",smoothing:.03};
 })};
 const sample={type:"sample",zones:Array.from({length:10},(_,i)=>({assetId:"sample-"+i,root:40+5*i})),
  gain:1.2,transpose:5,pan:-.2,strumMs:8,attack:.08,release:.3,
  followPitch:true,oneShot:false,preserveDynamics:false,
  filter:{type:"lowpass",cutoff:3200,resonance:2},drive:.25,
  movement:{...synth.movement,tone:0},bend:{...synth.bend}};
 const voice={...structuredClone(sample),type:"vocal",audioFilterBypassed:false,effects:{...synth.effects}};
 const idle=structuredClone(synth);
 idle.oscillators.forEach(osc=>osc.wave="sine");
 idle.filter.sweep=0;idle.noise=0;
 Object.assign(idle.movement,{depth:0,glide:0,tremolo:0,tone:0});
 idle.bend={shape:"straight",amount:0,rate:4};
 idle.effects.delayMix=0;
 idle.modulation.routes.forEach(route=>route.depth=0);
 const init=makePatch("init");
 return [
  {name:"synth",patch:synth,kinds:["oscillators","harmonics0","harmonics1","envelope","filter","movement","delay","modulation"]},
  {name:"sample",patch:sample,kinds:["sample","filter","movement","mapping"]},
  {name:"vocal",patch:voice,kinds:["sample","filter","movement"]},
  {name:"factory default",patch:init,kinds:["oscillators","envelope","filter","movement","delay"]},
  {name:"inactive effects",patch:idle,kinds:["filter","movement","delay","modulation"]},
  {name:"one-shot recording",patch:{...sample,oneShot:true},kinds:["sample"]},
  {name:"natural-end recording",patch:{...sample,followPitch:false},kinds:["sample"]},
  {name:"muted recording",patch:{...sample,gain:0},kinds:["sample"]},
  {name:"muted voice",patch:{...voice,gain:0,release:0},kinds:["sample"]},
  ...["pitched","rack","levels"].map(layout=>({name:layout+" gain",patch:{type:"stage",layout,volume:.65,gain:.8,pan:-.3},kinds:["stage"]})),
  ...["pitched","rack"].map(layout=>({name:layout+" muted",patch:{type:"stage",layout,volume:0,gain:0,pan:0},kinds:["stage"]})),
  {name:"cutoff automation",patch:{type:"automation",bars:4,version:1,
   target:"filter.cutoff",unit:"hz",interpolation:"exponential",
   points:[{id:"a",step:4,value:3000},{id:"b",step:48,value:300}]},kinds:["automation"]}
 ];
}
