import test from "node:test";
import assert from "node:assert/strict";
import {activeSoundPanels} from "../instrumentUI.js";
import {activeSamplePanels} from "../samplerUI.js";
import {makePatch} from "../synth.js";
import {diagram} from "../soundIllustrations.js";

test("factory init sound has no automatically expanded modules",()=>{
 assert.deepEqual([...activeSoundPanels(makePatch("init"))],[]);
});
test("only customized synth sections open, using canonical patch defaults",()=>{
 const p=makePatch("init");
 p.oscillators[0].wave="sawtooth";
 p.envelope.release=1.2;
 p.filter.cutoff=3300;
 p.effects.delayMix=.32;
 p.movement.depth=35;
 const open=activeSoundPanels(p);
 for(const name of ["Oscillators","Envelope","Filter & noise","Delay","Pitch & movement"])
  assert.ok(open.has(name),name);
 assert.ok(!open.has("Distortion"));
});
test("synth sections open for nondefault noise, drive or modulation without opening unrelated modules",()=>{
 const p=makePatch("init");
 p.noise=.25;p.effects.drive=.5;
 assert.deepEqual([...activeSoundPanels(p)],["Filter & noise","Distortion"]);
 p.modulation={version:1,routes:[{id:"route",target:"filter.cutoff"}]};
 assert.ok(activeSoundPanels(p).has("movement routes"));
});
test("the single oscillator illustration follows both slots without creating a third",()=>{
 const p=makePatch("init");
 p.oscillators[1].level=0;
 const single=diagram(p,"oscillators");
 assert.equal(single.handles.length,1);
 assert.ok(single.handles[0].axes.some(axis=>axis.path[1]===0));
 p.oscillators[1].level=.4;
 const dual=diagram(p,"oscillators");
 assert.equal(dual.handles.length,2);
 assert.ok(dual.handles[1].axes.some(axis=>axis.path[1]===1));
 assert.notEqual(dual.paths.length,single.paths.length);
});
test("sample panels open only when their own sound processing differs from defaults",()=>{
 const base={type:"sample",presetId:"x",zones:[{assetId:"sample",root:60}],followPitch:true,
  oneShot:false,gain:.9,attack:.005,release:.17,transpose:0,pan:0,strumMs:0,
  preserveDynamics:false,bend:{shape:"straight",amount:2,rate:4}};
 assert.deepEqual([...activeSamplePanels(base)],[]);
 assert.deepEqual([...activeSamplePanels({...base,filter:{type:"lowpass",cutoff:2500,resonance:.7}})],["tone"]);
 assert.deepEqual([...activeSamplePanels({...base,transpose:12})],["sample"]);
 assert.deepEqual([...activeSamplePanels({...base,movement:{depth:25}})],["movement"]);
});
