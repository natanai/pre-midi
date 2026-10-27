import {cleanPatch} from "./fixtures.js";
// Shared musical instructions for graph-oracle and native/browser comparisons.
const route=(id,target,depth,source={kind:"velocity"},polarity="unipolar",smoothing=.005)=>({id,target,depth,source,polarity,smoothing,unit:target.endsWith(".detune")?"cents":target.endsWith(".level")?"linear_gain":target==="filter.cutoff"?"octaves":"pan"});
const lfo={kind:"lfo",shape:"sine",rate:7.3},env={kind:"envelope",envelope:{attack:.08,decay:.05,sustain:.3,release:.2}},key={kind:"keytrack",root:60,span:24};
export function modulationFixtures(){
 const fixtures=[
  {id:"sum-positive-clamp",routes:[route("a","oscillators.0.level",.8),route("b","oscillators.0.level",.9)]},
  {id:"sum-negative-clamp",routes:[route("a","oscillators.0.level",-.8),route("b","oscillators.0.level",-.9)]},
  {id:"cancel",routes:[route("a","filter.cutoff",4),route("b","filter.cutoff",-4)]},
  {id:"bipolar-velocity",velocity:.2,routes:[route("a","oscillators.0.level",-.8,{kind:"velocity"},"bipolar")]},
  {id:"lfo-bipolar",start:.01,routes:[route("a","oscillators.0.detune",80,lfo,"bipolar",0)]},
  {id:"lfo-unipolar-negative",routes:[route("a","filter.cutoff",-2,lfo,"unipolar",.01)]},
  {id:"envelope-release",start:.01,routes:[route("a","oscillators.0.level",.5,env,"unipolar",.005)]},
  {id:"bipolar-envelope",routes:[route("a","oscillators.1.detune",-300,env,"bipolar",.01)]},
  {id:"keytrack-low",pitch:36,routes:[route("a","filter.cutoff",2,key,"bipolar")]},
  {id:"keytrack-high",pitch:84,routes:[route("a","filter.cutoff",2,key,"unipolar")]},
  {id:"pan-clamp",routes:[route("a","pan",2),route("b","pan",2)]},
  {id:"filter-clamp",routes:[route("a","filter.cutoff",8),route("b","filter.cutoff",8)]},
  {id:"pitch-clamp",routes:[route("a","oscillators.0.detune",2400),route("b","oscillators.0.detune",2400)]},
  {id:"silent-oscillator",silent:true,routes:[route("a","oscillators.1.level",.6,env,"unipolar",.02)]},
  {id:"expression-plus-modulation",expression:{bend:{shape:"scoop",amount:2,rate:4}},glide:3,routes:[route("a","oscillators.0.detune",18,lfo,"bipolar")]},
  {id:"maximum-16",routes:Array.from({length:16},(_,i)=>route(String(i).padStart(2,"0"),["oscillators.0.level","oscillators.1.detune","filter.cutoff","pan"][i%4],[.2,-40,.3,-.2][i%4],[lfo,env,key,{kind:"velocity"}][i%4],i%3?"bipolar":"unipolar",i%2?.01:0))}
 ];
 return fixtures.map(fixture=>{
  const patch=cleanPatch();patch.version=2;patch.modulation={version:1,routes:fixture.routes};patch.oscillators[0].level=.35;patch.oscillators[1].level=fixture.silent?0:.15;patch.oscillators[1].octave=1;patch.filter.cutoff=1500;patch.envelope.release=.25;
  if(fixture.glide)patch.movement.glide=fixture.glide;
  return {...fixture,patch,pitch:fixture.pitch??60,velocity:fixture.velocity??.8};
 });
}
