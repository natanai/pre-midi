import test from "node:test";
import assert from "node:assert/strict";
import {diagram} from "../soundIllustrations.js";
import {planNativeSample} from "../src/hosts/native/sample-plan.js";
import {SAMPLE_LIBRARY,makeSamplerPatch} from "../samples.js";

const scene=({oneShot=false,followPitch=true}={})=>{
 const patch=makeSamplerPatch(SAMPLE_LIBRARY[0]);
 patch.oneShot=oneShot;patch.followPitch=followPitch;
 patch.attack=.05;patch.release=.7;
 const assets=new Map(patch.zones.map((zone,index)=>
  [zone.assetId,{id:index+1,duration:2,normalization:1}]));
 const note={pitch:patch.zones[0].root,velocity:.8};
 const native=planNativeSample({patch,volume:1},note,0,.3,assets);
 return {patch,native,graph:diagram(patch,"sample",0)};
};
const label=graph=>graph.labels.find(l=>["off","end","tail"].includes(l.value))?.value;
const soundPath=graph=>graph.paths[1].d;

test("sample timing guide distinguishes real native key-up, capped end, and one-shot tail",()=>{
 const keyed=scene(),capped=scene({followPitch:false}),
  oneShot=scene({followPitch:false,oneShot:true});
 assert.equal(label(keyed.graph),"off");
 assert.equal(label(capped.graph),"end");
 assert.equal(label(oneShot.graph),"tail");
 assert.ok([keyed,capped,oneShot].every(s=>
  s.graph.labels.some(l=>l.value==="time guide")));
 assert.ok(Math.abs(keyed.native.off-.3)<1e-9,
  "pitch-follow keyed sample releases at the note-off time");
 assert.ok(Math.abs(capped.native.off-.99)<1e-9,
  "pitch-follow off schedules its short fade near the capped sample end");
 assert.ok(Math.abs(oneShot.native.off-1.3)<1e-9,
  "one-shot schedules its source tail independent of note length");
});

test("non-following samples display an end taper without losing release and attack editing",()=>{
 const a=scene({followPitch:true}),b=scene({followPitch:false});
 assert.notEqual(soundPath(a.graph),soundPath(b.graph));
 assert.ok(b.graph.paths[1].d.includes("L"+(248+(b.patch.release/3)*95-6).toFixed(2)+" 23.00"),
  "the last short slope is drawn near the endpoint, not at key-off");
 const paths=new Set(b.graph.handles.flatMap(h=>h.axes.map(a=>a.path.join("."))));
 assert.ok(paths.has("attack")&&paths.has("release"));
 assert.equal(b.graph.handles.length,2);
 assert.ok(b.graph.handles.every(h=>h.axes.length===1));
 const changed={...b.patch,release:2.2};
 assert.notEqual(diagram(changed,"sample",0).paths[1].d,soundPath(b.graph),
  "the release control still changes the illustrated end");
});
