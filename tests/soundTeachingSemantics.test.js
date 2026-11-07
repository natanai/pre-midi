import test from "node:test";
import assert from "node:assert/strict";
import {diagram,diagramPageCount,diagramPageForControl,illustrationSignal} from "../soundIllustrations.js";
import {assignSoundEdit} from "../soundEditPath.js";
import {teachingFixtures} from "./soundTeachingFixtures.js";

test("every numerical Sound task has a directly editable teaching trace, not just a moving node or number",()=>{
 const missing=[],unresponsive=[];let checked=0;
 for(const {name,patch,kinds} of teachingFixtures())for(const kind of kinds){
  const axes=new Map();
  for(let i=0;i<diagramPageCount(patch,kind);i++)
   for(const point of diagram(patch,kind,i).handles)for(const axis of point.axes)
    axes.set(axis.path.join("."),axis);
  for(const [path,axis] of axes){
   const page=diagramPageForControl(patch,kind,path,0);
   if(page===null){missing.push(name+" "+path);continue;}
   const a=structuredClone(patch),b=structuredClone(patch);
   assignSoundEdit(a,axis.path,axis.hardMin??axis.min);
   assignSoundEdit(b,axis.path,axis.hardMax??axis.max);
   if(illustrationSignal(diagram(a,kind,page),path)===
    illustrationSignal(diagram(b,kind,page),path))unresponsive.push(name+" / "+kind+" / "+path+" (view "+page+")");
   checked++;
  }
 }
 assert.deepEqual(missing,[],"knob-only tasks");
 assert.deepEqual(unresponsive,[],"these controls only move a node/readout or lack a linked teaching trace");
 assert.ok(checked>=260,"audit must cover harmonic partials, all route kinds, samples, voices, inactive effects and gain contexts");
});

test("each numerical control can reveal its directly editable illustration from every other view",()=>{
 let checked=0;
 for(const {patch,kinds} of teachingFixtures())for(const kind of kinds){
  const paths=new Set();
  const count=diagramPageCount(patch,kind);
  for(let page=0;page<count;page++)for(const point of diagram(patch,kind,page).handles)
   for(const axis of point.axes)paths.add(axis.path.join("."));
  for(const path of paths)for(let start=0;start<count;start++){
   const page=diagramPageForControl(patch,kind,path,start);
   assert.ok(page!==null&&diagram(patch,kind,page).handles.some(point=>
    point.axes.some(axis=>axis.path.join(".")===path)),kind+" "+path);
   checked++;
  }
 }
 assert.ok(checked>0);
});

test("the full movement envelope lesson includes decay after the longest attack and the release tail",()=>{
 const {patch}=teachingFixtures()[0];
 const route=patch.modulation.routes[1];route.source.envelope.attack=3;
 const before=diagram(patch,"modulation",2);
 route.source.envelope.decay=2.5;
 assert.notEqual(illustrationSignal(before,"modulation.routes.1.source.envelope.decay"),
  illustrationSignal(diagram(patch,"modulation",2),"modulation.routes.1.source.envelope.decay"));
 assert.ok(before.labels.some(label=>label.value==="6.25 s note"));
});
