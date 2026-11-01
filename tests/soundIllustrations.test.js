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
 for(const kind of ["oscillator1","oscillator2","filter","envelope","movement","effects","modulation"]){
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
 const first=diagram(patch,"effects");
 assert.ok(axesFor(first,["effects","delayTime"]).mode.endsWith("X"));
 assert.ok(axesFor(first,["effects","delayMix"]).mode.endsWith("Y"));
 assert.ok(axesFor(first,["effects","delayFeedback"]).mode.endsWith("Y"));
 const later=synth();later.effects.delayTime=.8;
 assert.ok(diagram(later,"effects").handles[1].x>first.handles[1].x);
 const quieter=synth();quieter.effects.delayMix=.1;
 assert.ok(diagram(quieter,"effects").handles[1].y>first.handles[1].y);
 const fading=synth();fading.effects.delayFeedback=.08;
 assert.notEqual(diagram(fading,"effects").paths[4].d,first.paths[4].d);
});

test("recorded sounds and ADSR use compatible editable graphs",()=>{
 const patch={...synth(),type:"sample",attack:.3,release:.7};
 assert.ok(axesFor(diagram(patch,"sample"),["attack"]));
 assert.ok(axesFor(diagram(patch,"sample"),["release"]));
 assert.ok(axesFor(diagram(synth(),"envelope"),["envelope","sustain"]));
});
