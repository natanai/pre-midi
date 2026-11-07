import test from "node:test";
import assert from "node:assert/strict";
import {diagram} from "../soundIllustrations.js";
import {activeSamplePanels} from "../samplerUI.js";
import {makePatch} from "../synth.js";
import {defaultSource} from "../src/dsp/modulation.js";

const sample=()=>({
 type:"sample",gain:.9,transpose:0,pan:0,strumMs:0,attack:.005,
 release:.17,followPitch:true,oneShot:false,preserveDynamics:false,
 zones:Array.from({length:11},(_,i)=>({assetId:"recording-"+i,root:44+i*4}))
});
const synth=()=>{
 const patch=makePatch("init");
 patch.modulation={version:1,routes:Array.from({length:11},(_,i)=>({
  id:"route-"+i,source:defaultSource("lfo"),target:"filter.cutoff",
  unit:"octaves",depth:1,polarity:"unipolar",smoothing:.005
 }))};
 return patch;
};
test("every sample zone, including zones past the first four, appears on its own mapping page",()=>{
 const patch=sample();
 const collected=[];
 for(let page=0;page<3;page++){
  const chart=diagram(patch,"mapping",page);
  assert.equal(chart.handles.length,page===2?3:4);
  for(const handle of chart.handles){
   assert.equal(handle.axes.length,1);
   assert.equal(handle.axes[0].path[0],"zones");
   assert.equal(handle.axes[0].path[2],"root");
   assert.equal(handle.axes[0].min,0);
   assert.equal(handle.axes[0].max,127);
   collected.push(handle.axes[0].path[1]);
   assert.ok(chart.paths.some(path=>path.links.includes("zones."+handle.axes[0].path[1]+".root")));
  }
 }
 assert.deepEqual(collected,Array.from({length:11},(_,i)=>i));
 const before=diagram(patch,"mapping",2);
 const changed=structuredClone(patch);
 changed.zones[9].root+=12;
 const after=diagram(changed,"mapping",2);
 assert.ok(after.handles[1].x>before.handles[1].x+25);
 assert.notEqual(after.paths.find(p=>p.links.includes("zones.9.root")).d,
  before.paths.find(p=>p.links.includes("zones.9.root")).d);
 assert.ok(activeSamplePanels(patch).has("mapping"));
});
test("a single recorded sample does not open extra mapping controls by default",()=>{
 const patch=sample();patch.zones=patch.zones.slice(0,1);
 assert.ok(!activeSamplePanels(patch).has("mapping"));
 assert.equal(diagram(patch,"mapping").handles.length,1);
});
test("all 11 modulation routes have independent readable, linked traces across pages",()=>{
 const patch=synth(),observed=[];
 for(let page=0;page<3;page++){
  const chart=diagram(patch,"modulation",page);
  assert.equal(chart.paths.filter(path=>path.links.length).length,page===2?3:4);
  observed.push(...chart.paths.flatMap(path=>path.links).filter(link=>link.startsWith("modulation.routes.")));
 }
 assert.deepEqual([...new Set(observed)].filter(key=>/^modulation\.routes\.\d+$/.test(key)),
  Array.from({length:11},(_,i)=>"modulation.routes."+i));
 const before=diagram(patch,"modulation",2);
 patch.modulation.routes[10].depth=-2;
 const after=diagram(patch,"modulation",2);
 assert.notEqual(before.paths.at(-1).d,after.paths.at(-1).d);
 assert.notEqual(diagram(patch,"modulation",0).paths.at(-1).links[0],"modulation.routes.10");
});
