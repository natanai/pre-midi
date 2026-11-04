import test from "node:test";
import assert from "node:assert/strict";
import {diagram,diagramPageCount} from "../soundIllustrations.js";
import {makePatch,validatePatch} from "../synth.js";
import {harmonicRecipe} from "../harmonics.js";
import {assignSoundEdit} from "../soundEditPath.js";
import {defaultSource,MOD_TARGETS} from "../src/dsp/modulation.js";

const key=path=>path.join(".");
const handles=(patch,kind)=>Array.from({length:diagramPageCount(patch,kind)},
 (_,page)=>diagram(patch,kind,page).handles).flat();
const actions=(patch,kind)=>Array.from({length:diagramPageCount(patch,kind)},
 (_,page)=>diagram(patch,kind,page).actions).flat();
const axes=(patch,kind)=>new Set(handles(patch,kind).flatMap(h=>h.axes).map(a=>key(a.path)));
const choices=(patch,kind)=>new Set(actions(patch,kind).map(a=>key(a.path)));
const requirePaths=(set,expected,kind)=>{for(const path of expected)
 assert.ok(set.has(path),kind+" is knob-only: "+path);};
const pairs=(patch,kind)=>handles(patch,kind).filter(item=>
 item.axes.some(a=>a.mode.endsWith("X"))&&item.axes.some(a=>a.mode.endsWith("Y")));

const synth=()=>{
 const p=makePatch("init");
 p.oscillators[0].wave="harmonic";p.oscillators[0].harmonics=harmonicRecipe();
 p.oscillators[1].wave="harmonic";p.oscillators[1].harmonics=harmonicRecipe();
 p.oscillators[1].level=.4;
 return p;
};
const sample=()=>({type:"sample",zones:[{assetId:"a",root:60},{assetId:"b",root:72}],
 gain:.9,transpose:0,pan:0,strumMs:0,attack:.005,release:.17,
 followPitch:true,oneShot:false,preserveDynamics:false,drive:0,
 filter:{type:"lowpass",cutoff:9000,resonance:.7},
 movement:{glide:-2,glideTime:.3,rate:5,depth:20,delay:.2,tremolo:.2,tremoloRate:4,tone:.3,toneRate:2},
 bend:{shape:"wave",amount:2,rate:4}});
test("every synth knob has a direct path in an educational illustration",()=>{
 const p=synth();
 requirePaths(axes(p,"oscillators"),[
  "oscillators.0.level","oscillators.0.detune",
  "oscillators.1.level","oscillators.1.detune"],"oscillators");
 requirePaths(choices(p,"oscillators"),[
  "oscillators.0.wave","oscillators.0.octave",
  "oscillators.1.wave","oscillators.1.octave"],"oscillators");
 for(const index of [0,1]){
  const spectrum="harmonics"+index;
  assert.equal(diagramPageCount(p,spectrum),4);
  requirePaths(axes(p,spectrum),
   Array.from({length:32},(_,i)=>"oscillators."+index+".harmonics."+i),spectrum);
 }
 requirePaths(axes(p,"envelope"),[
  "envelope.attack","envelope.decay","envelope.sustain","envelope.release"],"envelope");
 requirePaths(axes(p,"filter"),[
  "filter.cutoff","filter.resonance","filter.sweep","filter.sweepTime",
  "noise","noiseDecay"],"filter");
 requirePaths(choices(p,"filter"),["filter.type"],"filter");
 requirePaths(axes(p,"movement"),[
  "bend.amount","bend.rate","movement.glide","movement.glideTime",
  "movement.rate","movement.depth","movement.delay",
  "movement.tremolo","movement.tremoloRate","movement.tone","movement.toneRate","pan"],"movement");
 requirePaths(choices(p,"movement"),["bend.shape"],"movement");
 requirePaths(axes(p,"distortion"),["effects.drive"],"distortion");
 requirePaths(axes(p,"delay"),["effects.delayMix","effects.delayTime","effects.delayFeedback"],"delay");
 assert.ok(pairs(p,"oscillators").length===2);
 assert.ok(pairs(p,"filter").length>=3);
 assert.ok(pairs(p,"movement").length>=4);
 assert.ok(pairs(p,"delay").length>=2);
});

test("sampler controls, switches, filters and every recorded root have diagram editing paths",()=>{
 const p=sample();
 requirePaths(axes(p,"filter"),["filter.cutoff","filter.resonance","drive"],"sample filter");
 requirePaths(choices(p,"filter"),["filter.type"],"sample filter");
 requirePaths(axes(p,"sample"),["attack","release","gain","transpose","pan","strumMs"],"sample");
 requirePaths(choices(p,"sample"),["followPitch","oneShot","preserveDynamics"],"sample");
 requirePaths(axes(p,"mapping"),["zones.0.root","zones.1.root"],"sample mapping");
 requirePaths(axes(p,"movement"),[
  "bend.amount","bend.rate","movement.glide","movement.glideTime",
  "movement.rate","movement.depth","movement.delay",
  "movement.tremolo","movement.tremoloRate"],"sample movement");
 assert.ok(pairs(p,"sample").length>=2);
});

test("modulation summary and detail pages edit each exposed source, target, and ADSR axis",()=>{
 const p=synth();
 const route=(kind,i,target="filter.cutoff")=>{
  const t=MOD_TARGETS.find(t=>t.id===target);
  return {id:"route-"+i,source:defaultSource(kind),target,
   unit:t.unit,depth:1,polarity:"bipolar",smoothing:.005};
 };
 p.modulation={version:1,routes:[
  route("lfo",0),route("envelope",1),route("velocity",2),route("keytrack",3)]};
 p.version=2;
 assert.deepEqual(validatePatch(p),[]);
 assert.equal(diagramPageCount(p,"modulation"),5);
 const a=axes(p,"modulation"),c=choices(p,"modulation");
 requirePaths(a,[
  "modulation.routes.0.source.rate",
  ...[0,1,2,3].map(i=>"modulation.routes."+i+".depth"),
  ...["attack","decay","sustain","release"].map(name=>"modulation.routes.1.source.envelope."+name),
  "modulation.routes.3.source.root","modulation.routes.3.source.span"
 ],"modulation");
 for(let i=0;i<4;i++)requirePaths(c,[
  "modulation.routes."+i+".source.kind",
  "modulation.routes."+i+".target",
  "modulation.routes."+i+".polarity"],"route "+i);
 assert.ok(pairs(p,"modulation").length>=4);
 assert.ok(diagram(p,"modulation",4).handles.length>=2,
  "fourth route's detail needs independently editable parameters");
});

test("all educational handles use actual existing bounded data and real X/Y directions",()=>{
 const p=synth();p.modulation={version:1,routes:[{
  id:"check",source:defaultSource("envelope"),
  target:"filter.cutoff",unit:"octaves",depth:2,polarity:"bipolar",smoothing:.005
 }]};
 const patches=[[p,["oscillators","harmonics0","harmonics1","envelope",
  "filter","movement","distortion","delay","modulation"]],
  [sample(),["sample","filter","movement","mapping"]]];
 for(const [patch,kinds] of patches)for(const kind of kinds){
  for(let page=0;page<diagramPageCount(patch,kind);page++){
   const graph=diagram(patch,kind,page);
   assert.ok(graph.paths.length,kind+" page "+page+" has no teaching trace");
   for(const h of graph.handles){
    assert.ok(h.x>=0&&h.x<=360&&h.y>=0&&h.y<=112,
     kind+" point outside drawing: "+h.label);
    for(const axis of h.axes){
     assert.ok(axis.mode.endsWith("X")||axis.mode.endsWith("Y"));
     assert.ok(axis.min<axis.max&&axis.step>0&&axis.from!==axis.to);
     const value=axis.path.reduce((object,id)=>object?.[id],patch);
     assert.ok(typeof value==="number"&&Number.isFinite(value),
      kind+" is not editing a real numeric parameter: "+key(axis.path));
     const updated=structuredClone(patch);
     assignSoundEdit(updated,axis.path,Math.min(axis.max,Math.max(axis.min,value+axis.step)));
     assert.ok(Number.isFinite(axis.path.reduce((o,id)=>o?.[id],updated)));
    }
   }
   for(const action of graph.actions){
    const current=action.path.reduce((o,id)=>o?.[id],patch);
    assert.ok(action.choices.length>1,kind+" discrete control has no alternatives");
    assert.ok(current===undefined||action.choices.includes(current),
     kind+" is not linked to a real selector "+key(action.path));
   }
  }
 }
});

test("cutoff automation illustrates both independent endpoints and preserves the integer sixteenth-step grid",async()=>{
 const {validateCutoffAutomation,cutoffAt}=await import("../src/dsp/automation.js");
 const block={version:1,target:"filter.cutoff",unit:"hz",interpolation:"exponential",
  points:[{id:"start",step:0,value:900},{id:"end",step:32,value:180}]};
 assert.deepEqual(validateCutoffAutomation(block,null,4),[]);
 const patch={...block,type:"automation",bars:4};
 const picture=diagram(patch,"automation");
 assert.equal(diagramPageCount(patch,"automation"),1);
 assert.equal(picture.handles.length,2);
 requirePaths(axes(patch,"automation"),[
  "points.0.step","points.0.value","points.1.step","points.1.value"],"automation");
 assert.equal(picture.handles[0].axes.find(a=>a.mode==="linearX").hardMax,31);
 assert.equal(picture.handles[1].axes.find(a=>a.mode==="linearX").hardMin,1);
 assert.ok(picture.handles[0].y<picture.handles[1].y,
  "higher cutoff sits visibly higher than lower cutoff");
 const lower=structuredClone(patch);lower.points[1].value=100;
 assert.notEqual(diagram(lower,"automation").paths[1].d,picture.paths[1].d,
  "changing an endpoint must alter the drawn exponential response");
 assert.ok(cutoffAt(block,16,0)>180&&cutoffAt(block,16,0)<900);
});

test("delay feedback stays a full-height editing axis when the effect is dry",()=>{
 const p=synth();p.effects.delayMix=0;p.effects.delayFeedback=.1;
 const quiet=diagram(p,"delay");
 const handle=quiet.handles.find(h=>h.axes.some(a=>key(a.path)==="effects.delayFeedback"));
 assert.ok(handle);
 const axis=handle.axes.find(a=>key(a.path)==="effects.delayFeedback");
 assert.equal(Math.abs(axis.from-axis.to),64,"feedback keeps its whole vertical editing range");
 p.effects.delayFeedback=.8;
 const strong=diagram(p,"delay");
 assert.ok(handle.y>strong.handles.find(h=>h.axes.some(a=>
  key(a.path)==="effects.delayFeedback")).y+40);
 assert.ok(strong.paths.some(path=>path.links.includes("effects.delayFeedback")));
});

test("vocal illustrations expose every common clip knob without sample-only controls",()=>{
 const clip={...sample(),type:"vocal",audioFilterBypassed:true};
 delete clip.strumMs;delete clip.followPitch;delete clip.oneShot;delete clip.preserveDynamics;
 assert.equal(diagramPageCount(clip,"sample"),2);
 requirePaths(axes(clip,"sample"),["gain","transpose","pan","attack","release"],
  "vocal audio");
 assert.ok(pairs(clip,"sample").length>=1,"vocal pitch and gain have a true two-axis handle");
 const vocalActions=choices(clip,"sample");
 for(const extra of ["strumMs","followPitch","oneShot","preserveDynamics"])
  assert.ok(!vocalActions.has(extra),"vocal sound editor should not offer sample-only setting "+extra);
 const filter=diagram(clip,"filter",0);
 assert.ok(filter.actions.some(action=>action.path.join(".")==="audioFilterBypassed"),
  "vocal bypass must have a direct illustration control");
 assert.ok(axes(clip,"filter").has("drive"),
  "drive stays visually editable when the filter is bypassed");
});

test("moving each numeric knob to an extreme visibly changes its linked illustration",()=>{
 const synthPatch=synth(),samplePatch=sample();
 synthPatch.modulation={version:1,routes:[
  {id:"sweep",source:defaultSource("lfo"),target:"filter.cutoff",
   unit:"octaves",depth:1,polarity:"unipolar",smoothing:.005},
  {id:"env",source:defaultSource("envelope"),target:"filter.cutoff",
   unit:"octaves",depth:1,polarity:"unipolar",smoothing:.005},
  {id:"keys",source:defaultSource("keytrack"),target:"filter.cutoff",
   unit:"octaves",depth:1,polarity:"unipolar",smoothing:.005}
 ]};
 const cases=[[synthPatch,["oscillators","harmonics0","harmonics1",
  "envelope","filter","movement","distortion","delay","modulation"]],
  [samplePatch,["filter","sample","movement","mapping"]]];
 let checked=0;
 for(const [patch,kinds] of cases)for(const kind of kinds)
  for(let page=0;page<diagramPageCount(patch,kind);page++){
   const initial=diagram(patch,kind,page);
   for(const point of initial.handles)for(const axis of point.axes){
    const current=axis.path.reduce((object,key)=>object?.[key],patch);
    if(typeof current!=="number")continue;
    const next=Math.abs(current-axis.min)>Math.abs(current-axis.max)?axis.min:axis.max;
    const edited=structuredClone(patch);assignSoundEdit(edited,axis.path,next);
    const updated=diagram(edited,kind,page);
    const before=JSON.stringify({paths:initial.paths,handles:initial.handles});
    const after=JSON.stringify({paths:updated.paths,handles:updated.handles});
    assert.notEqual(after,before,kind+" page "+page+
     " does not respond visually to "+axis.path.join("."));
    checked++;
   }
  }
 assert.ok(checked>=100,"expected the complete set of control/diagram relationships");
});

test("instrument volume is never knob-only; stereo and rack gain use two-axis illustrations",()=>{
 const pitched={type:"stage",layout:"pitched",volume:.7,pan:-.3,gain:.85};
 const rack={type:"stage",layout:"rack",volume:.7,pan:-.3,gain:.85};
 requirePaths(axes(pitched,"stage"),["volume","pan"],"stereo level");
 requirePaths(axes(rack,"stage"),["volume","gain"],"rack gain staging");
 assert.equal(pairs(pitched,"stage").length,1);
 assert.equal(pairs(rack,"stage").length,1);
 const current=diagram(rack,"stage"),next=diagram({...rack,volume:.3},"stage");
 assert.notDeepEqual(current.handles,next.handles,"rack output level responds to the actual rack-volume knob");
 assert.ok(next.labels.some(label=>label.value==="total "+Math.round(100*.3*.85)+"%"),
  "gain illustration teaches that rack and Sound levels multiply");
});
