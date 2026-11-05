import test from "node:test";
import assert from "node:assert/strict";
import {diagram,diagramPageCount} from "../soundIllustrations.js";
import {planAmplitudeEnvelope,envelopeLevelAt} from "../src/dsp/amplitude-envelope.js";
import {makePatch} from "../synth.js";

const off=.25;
const note=(patch)=>diagram(patch,"envelope",1);
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const pathFor=patch=>note(patch).paths[1].d;
const endLevel=(patch)=>planAmplitudeEnvelope({
 start:0,off,peak:1,envelope:patch.envelope
}).releaseLevel;
const expectedOffY=patch=>(67-40*endLevel(patch)).toFixed(2);

test("ADSR retains four editable fields and adds a real short-note example",()=>{
 const patch=makePatch("init");
 assert.equal(diagramPageCount(patch,"envelope"),2);
 const held=diagram(patch,"envelope",0),short=note(patch);
 assert.ok(held.labels.some(x=>x.value==="held note model"));
 assert.ok(short.labels.some(x=>x.value==="0.25s note"));
 assert.ok(short.labels.some(x=>x.value==="release"));
 assert.ok(short.labels.some(x=>x.value===Math.round(endLevel(patch)*100)+"%"));
 const paths=new Set(short.handles.flatMap(h=>h.axes).map(a=>a.path.join(".")));
 assert.deepEqual([...paths].sort(),[
  "envelope.attack","envelope.decay","envelope.release","envelope.sustain"
 ]);
 assert.equal(short.handles.length,2);
 assert.ok(short.handles.every(h=>h.axes.length===2));
});

test("short-note response releases from the current attack, decay or sustain level",()=>{
 const patch=makePatch("init");
 for(const [label,envelope,expected] of [
  ["attack",{attack:.8,decay:.2,sustain:.4,release:.5},.25/.8],
  ["decay",{attack:.01,decay:.6,sustain:.3,release:.5},
   1-(1-.3)*(.25-.01)/.6],
  ["sustain",{attack:.01,decay:.01,sustain:.3,release:.5},.3],
  ["instant attack",{attack:0,decay:.1,sustain:.6,release:.5},.6]
 ]){
  patch.envelope=envelope;
  const level=endLevel(patch);
  near(level,expected);
  near(level,envelopeLevelAt(envelope,1,off));
  assert.ok(pathFor(patch).includes("L218.00 "+expectedOffY(patch)),
   label+" curve must reach the real note-off level before release");
  const graph=note(patch);
  assert.ok(graph.labels.some(l=>l.value===Math.round(level*100)+"%"),
   label+" has audible note-off level readout");
 }
});

test("short-note release fades to the planner's floor and its endpoint follows release",()=>{
 const patch=makePatch("init");patch.envelope={attack:.1,decay:.3,sustain:.55,release:.5};
 const earlier=note(patch),firstPath=pathFor(patch);
 assert.ok(firstPath.endsWith("67.00"),"release ends at the planner's quiet floor");
 const a=earlier.handles.find(h=>h.label==="sustain / release");
 assert.ok(a.axes.some(axis=>axis.path.join(".")==="envelope.release"));
 assert.ok(a.axes.some(axis=>axis.path.join(".")==="envelope.sustain"));
 patch.envelope.release=2;
 const longer=note(patch);
 assert.ok(longer.handles[1].y<a.y,"longer releases remain directly editable upward");
 assert.notEqual(pathFor(patch),firstPath,"release time must move the curve endpoint");
 assert.equal(endLevel(patch),endLevel({...patch,envelope:{...patch.envelope,release:.5}}),
  "release duration cannot change note-off level");
});
