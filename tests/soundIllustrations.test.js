import test from "node:test";
import assert from "node:assert/strict";
import {diagram} from "../soundIllustrations.js";

const synth=()=>({
 type:"synth",
 oscillators:[
  {wave:"sine",level:.8,octave:0,detune:0,harmonics:[1]},
  {wave:"triangle",level:.2,octave:0,detune:12,harmonics:[1]}
 ],
 filter:{type:"lowpass",cutoff:2400,resonance:1,sweep:0,sweepTime:.2},
 envelope:{attack:.2,decay:.3,sustain:.7,release:.9},
 effects:{drive:.15,delayMix:.5,delayTime:.32,delayFeedback:.45},
 movement:{glide:0,glideTime:.3,depth:24,rate:5,delay:0,tremolo:0,tremoloRate:5},
 bend:{shape:"straight",amount:2,rate:4},
 modulation:{version:1,routes:[]}
});
const path=keys=>JSON.stringify(keys);
const axesFor=(chart,keys)=>chart.handles.flatMap(item=>item.axes).find(a=>path(a.path)===path(keys));

test("sound diagrams cover all real synth sections without inventing parameter paths",()=>{
 const patch=synth();
 for(const kind of ["oscillator1","oscillator2","filter","envelope","movement","delay","modulation"]){
  const chart=diagram(patch,kind);
  assert.ok(chart.paths.length,kind+" has no diagram");
  for(const point of chart.handles){
   assert.ok(point.axes.length>0);
   assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
   for(const a of point.axes){
    assert.ok(Number.isFinite(a.min)&&Number.isFinite(a.max));
    assert.ok(Number.isFinite(a.from)&&Number.isFinite(a.to));
    assert.ok(a.min<a.max);
    assert.ok(a.path.reduce((v,k)=>v?.[k],patch)!==undefined,
     kind+" invented a missing control: "+path(a.path));
   }
  }
 }
});

test("filter grab point exposes independent cutoff and resonance axes",()=>{
 const patch=synth(),first=diagram(patch,"filter");
 const point=first.handles.find(item=>item.axes.length===2);
 assert.ok(point);
 assert.ok(axesFor(first,["filter","cutoff"]).mode.endsWith("X"));
 assert.ok(axesFor(first,["filter","resonance"]).mode.endsWith("Y"));
 const brighter=diagram({...patch,filter:{...patch.filter,cutoff:7500}},"filter");
 const resonant=diagram({...patch,filter:{...patch.filter,resonance:12}},"filter");
 assert.ok(brighter.handles[0].x>point.x+10);
 assert.ok(resonant.handles[0].y<point.y-10);
 assert.notEqual(first.paths[1].d,brighter.paths[1].d);
 assert.notEqual(first.paths[1].d,resonant.paths[1].d);
});

test("oscillator handle maps detune horizontally and level vertically",()=>{
 const patch=synth();
 const original=diagram(patch,"oscillator1");
 const next=synth();next.oscillators[0].level=.3;next.oscillators[0].detune=75;
 const changed=diagram(next,"oscillator1");
 assert.ok(changed.handles[0].x>original.handles[0].x);
 assert.ok(changed.handles[0].y>original.handles[0].y);
 assert.notEqual(original.paths[1].d,changed.paths[1].d);
});

test("delay repeats track mix, spacing, and feedback rather than arbitrary ticks",()=>{
 const patch=synth();
 const first=diagram(patch,"delay");
 assert.ok(axesFor(first,["effects","delayTime"]).mode.endsWith("X"));
 assert.ok(axesFor(first,["effects","delayMix"]).mode.endsWith("Y"));
 assert.ok(axesFor(first,["effects","delayFeedback"]).mode.endsWith("Y"));
 const later=synth();later.effects.delayTime=.8;
 assert.ok(diagram(later,"delay").handles[1].x>first.handles[1].x);
 const quieter=synth();quieter.effects.delayMix=.1;
 assert.ok(diagram(quieter,"delay").handles[0].y>first.handles[0].y,
  "delay mix moves the first echo handle");
 assert.equal(diagram(quieter,"delay").handles[1].y,first.handles[1].y,
  "feedback remains independently editable when mix is reduced");
 const fading=synth();fading.effects.delayFeedback=.08;
 assert.notEqual(diagram(fading,"delay").paths[3].d,first.paths[3].d);
});

test("recorded sounds and ADSR use compatible editable graphs",()=>{
 const patch={...synth(),type:"sample",attack:.3,release:.7};
 assert.ok(axesFor(diagram(patch,"sample"),["attack"]));
 assert.ok(axesFor(diagram(patch,"sample"),["release"]));
 assert.ok(axesFor(diagram(synth(),"envelope"),["envelope","sustain"]));
});

test("sample attack and release illustration distinguishes key-off from one-shot source tail",()=>{
 const base={...synth(),type:"sample",attack:.3,release:.7,
  oneShot:false,followPitch:true};
 const keyed=diagram(base,"sample");
 const oneShot=diagram({...base,oneShot:true},"sample");
 assert.ok(keyed.labels.some(label=>label.value==="off"),
  "keyed samples end their hold/release at key-off");
 assert.ok(!keyed.labels.some(label=>label.value==="tail"));
 assert.ok(oneShot.labels.some(label=>label.value==="tail"),
  "one-shot samples ignore note-off and naturally enter their source tail");
 assert.ok(!oneShot.labels.some(label=>label.value==="off"));
 for(const graph of [keyed,oneShot]){
  assert.ok(axesFor(graph,["attack"]));
  assert.ok(axesFor(graph,["release"]));
  assert.equal(graph.handles.length,2,
   "attack and release remain editable in both sampler modes");
 }
});

test("recording pitch illustrations show parameter geometry, never invented PCM",()=>{
 const base={...synth(),type:"sample",zones:[{assetId:"recording",root:60}],
  gain:1,transpose:0,pan:0,strumMs:0,oneShot:false,followPitch:true,
  preserveDynamics:false,attack:.005,release:.17};
 const neutral=diagram(base,"sample",1);
 assert.ok(neutral.labels.some(item=>item.value==="control model"));
 assert.equal(neutral.paths[1].d,"M93 60 H93.00 V60.00",
  "neutral onset and pitch offsets meet at the control origin");
 assert.deepEqual(neutral.paths[1].links,["transpose","strumMs"],
  "the timing/pitch map only links its real inputs");
 assert.ok(!neutral.paths[1].d.includes("L"),
  "a source recording does not pretend to be a generated oscillator");
 const shifted=diagram({...base,transpose:12,strumMs:20},"sample",1);
 assert.notEqual(shifted.paths[1].d,neutral.paths[1].d);
 assert.ok(shifted.handles[0].x>neutral.handles[0].x);
 assert.ok(shifted.handles[0].y<neutral.handles[0].y);
 for(const key of ["strumMs","transpose","pan","gain"])
  assert.ok(shifted.handles.some(point=>point.axes.some(axis=>
   axis.path.join(".")===key)),key+" remains directly editable");
 const vocal=diagram({...base,type:"vocal",transpose:-7,gain:1.4,pan:.3},"sample",1);
 assert.ok(vocal.labels.some(item=>item.value==="control model"));
 assert.ok(vocal.paths[1].d.startsWith("M93 "));
 assert.ok(!vocal.paths[1].d.includes("L"),
  "recorded speech and singing do not get fabricated sinusoidal samples");
 for(const key of ["transpose","gain","pan"])
  assert.ok(vocal.handles.some(point=>point.axes.some(axis=>
   axis.path.join(".")===key)),key+" remains directly editable for voice");
 assert.ok(vocal.handles.some(point=>point.axes.length===2),
  "voice pitch and level still support simultaneous x/y editing");
});

test("filter and distortion share a waveform comparison and two independent axes",()=>{
 const patch=synth(),first=diagram(patch,"filter",2);
 assert.ok(axesFor(first,["effects","drive"]));
 assert.ok(axesFor(first,["filter","cutoff"]).mode.endsWith("X"));
 assert.equal(first.handles[0].axes.length,2);
 const stronger=synth();stronger.effects.drive=.95;
 assert.notEqual(first.paths[2].d,diagram(stronger,"filter",2).paths[2].d);
 assert.equal(first.paths[1].d,diagram(stronger,"filter",2).paths[1].d,
  "the dry reference stays fixed while the processed waveform changes");
});

test("combined oscillator illustration keeps source traces while exposing their actual mix",()=>{
 const patch=synth();
 const combined=diagram(patch,"oscillators");
 assert.equal(combined.handles.length,2);
 assert.equal(combined.paths.length,6);
 assert.ok(combined.labels.some(x=>x.value==="mix"));
 const mix=combined.paths[1];
 assert.ok(mix.links.includes("oscillators.0.wave"));
 assert.ok(mix.links.includes("oscillators.1.detune"));
 const changed=structuredClone(patch);
 changed.oscillators[1].wave="square";
 assert.notEqual(diagram(changed,"oscillators").paths[1].d,mix.d);
 changed.oscillators[1].level=0;
 const single=diagram(changed,"oscillators");
 assert.equal(single.handles.length,1);
 assert.ok(!single.paths[1].links.includes("oscillators.1.wave"));
});
test("illustrated sound features expose parameter links without changing user-facing knob help",()=>{
 const patch=synth();
 assert.ok(diagram(patch,"filter").paths.some(p=>p.links?.includes("filter.cutoff")));
 assert.ok(diagram(patch,"envelope").paths.some(p=>p.links?.includes("envelope.attack")));
 assert.ok(diagram(patch,"movement").paths.some(p=>p.links?.includes("movement.tremolo")));
 assert.ok(diagram(patch,"filter",2).paths.some(p=>p.links?.includes("effects.drive")));
 assert.ok(diagram(patch,"delay").paths.some(p=>p.links?.includes("effects.delayTime")));
});
