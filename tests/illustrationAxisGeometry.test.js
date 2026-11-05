import test from "node:test";
import assert from "node:assert/strict";
import {diagram,diagramPageCount} from "../soundIllustrations.js";
import {makePatch} from "../synth.js";
import {harmonicRecipe} from "../harmonics.js";
import {defaultSource,MOD_TARGETS} from "../src/dsp/modulation.js";

// A diagram is an input device, not just a drawing. Its handle must appear
// where the actual value lies along each advertised X/Y axis. Otherwise a
// pointerdown on the handle immediately jumps to a different parameter value.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const at=(object,path)=>path.reduce((value,key)=>value?.[key],object);
function coordinateFor(axis,value){
 const fraction=axis.mode.startsWith("log")?
  Math.log(value/axis.min)/Math.log(axis.max/axis.min):
  (value-axis.min)/(axis.max-axis.min);
 return axis.from+(axis.to-axis.from)*clamp(fraction);
}
function assertGeometry(patch,kind){
 let axesChecked=0;
 for(let page=0;page<diagramPageCount(patch,kind);page++){
  const picture=diagram(patch,kind,page);
  for(const point of picture.handles){
   for(const axis of point.axes){
    const value=at(patch,axis.path);
    assert.ok(Number.isFinite(value),kind+" has a nonnumeric handle "+axis.path.join("."));
    const expected=coordinateFor(axis,value);
    const actual=axis.mode.endsWith("X")?point.x:point.y;
    assert.ok(Math.abs(expected-actual)<=1.5,
     kind+" page "+page+" mismaps "+axis.path.join(".")+
     ": handle "+actual.toFixed(2)+"px instead of "+expected.toFixed(2)+"px");
    axesChecked++;
   }
  }
 }
 return axesChecked;
}
function synth(){
 const patch=makePatch("init");
 patch.version=2;
 patch.oscillators[0].wave="harmonic";
 patch.oscillators[0].harmonics=harmonicRecipe();
 patch.oscillators[1].wave="harmonic";
 patch.oscillators[1].harmonics=harmonicRecipe();
 patch.oscillators[0].detune=-9;
 patch.oscillators[1].detune=16;
 const route=(kind,index)=>{
  const target=MOD_TARGETS.find(item=>item.id==="filter.cutoff");
  return {id:"geometry-"+index,source:defaultSource(kind),
   target:target.id,unit:target.unit,depth:1,polarity:"bipolar",smoothing:.005};
 };
 patch.modulation={version:1,routes:["lfo","envelope","velocity","keytrack"].map(route)};
 patch.movement={...patch.movement,glide:-3,glideTime:.44,depth:45,rate:6.2,
  delay:.32,tremolo:.38,tremoloRate:7,tone:.25,toneRate:4};
 patch.bend={shape:"wave",amount:3,rate:5};
 patch.filter={...patch.filter,cutoff:2900,resonance:3,sweep:2,sweepTime:.55};
 patch.noise=.32;patch.noiseDecay=.7;
 patch.effects={...patch.effects,drive:.35,delayMix:.33,delayTime:.39,delayFeedback:.43};
 return patch;
}
function sample(){
 return {type:"sample",zones:[{assetId:"one",root:55},{assetId:"two",root:72},
  {assetId:"three",root:85},{assetId:"four",root:108},{assetId:"five",root:40}],
  gain:1.16,transpose:-5,pan:.36,strumMs:12,attack:.26,release:.63,
  followPitch:true,oneShot:false,preserveDynamics:false,drive:.27,
  filter:{type:"bandpass",cutoff:3200,resonance:4},
  movement:{glide:-2,glideTime:.4,rate:5.7,depth:28,delay:.3,
   tremolo:.44,tremoloRate:4,tone:0,toneRate:2},
  bend:{shape:"wave",amount:5,rate:4}};
}
test("every Sound teaching handle is physically aligned with the numeric axis it edits",()=>{
 const patch=synth(),recording=sample(),voice={...sample(),type:"vocal",
  audioFilterBypassed:false};
 const automation={type:"automation",bars:4,
  version:1,target:"filter.cutoff",unit:"hz",interpolation:"exponential",
  points:[{id:"first",step:5,value:3800},{id:"last",step:42,value:500}]};
 const cases=[
  [patch,["oscillators","oscillator1","oscillator2","harmonics0","harmonics1",
   "envelope","filter","movement","distortion","delay","modulation"]],
  [recording,["filter","sample","movement","mapping"]],
  [voice,["filter","sample","movement"]],
  [automation,["automation"]],
  [{type:"stage",layout:"pitched",volume:.64,gain:.75,pan:-.3},["stage"]],
  [{type:"stage",layout:"rack",volume:.65,gain:.72,pan:0},["stage"]],
  [{type:"stage",layout:"levels",volume:.42,gain:.8,pan:0},["stage"]]
 ];
 let checked=0;
 for(const [source,kinds] of cases)for(const kind of kinds)
  checked+=assertGeometry(source,kind);
 assert.ok(checked>=140,
  "the geometry contract must cover the complete set of multidimensional and single-axis handles");
});
