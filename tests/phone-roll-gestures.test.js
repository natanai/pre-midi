import test from "node:test";
import assert from "node:assert/strict";
import {centerOf,spreadOf,navigationAnchor,nextNavigation,clampZoom,noteDragSteps,KEY_WIDTH} from "../phone/gestures/roll.js";

test("two-finger pinch holds the same musical step under the midpoint",()=>{
 const initial=new Map([[1,{x:120,y:200}],[2,{x:200,y:200}]]);
 const view={left:0,top:60,scrollLeft:90,scrollTop:430,zoom:42};
 const anchor=navigationAnchor(initial,view);
 const opened=new Map([[1,{x:90,y:200}],[2,{x:230,y:200}]]);
 const out=nextNavigation(anchor,opened,{left:0,top:60});
 assert.equal(out.zoom,70);
 assert.ok(out.scrollLeft>view.scrollLeft);
 assert.ok(Math.abs((out.scrollLeft+160-KEY_WIDTH)/out.zoom-anchor.stepAtCenter)<1e-9);
 assert.equal(out.scrollTop,430);
 assert.equal(clampZoom(200),70);
 assert.equal(clampZoom(-100),30);
});
test("two-finger pan changes scroll, not zoom, including vertical pitch scroll",()=>{
 const original=new Map([[1,{x:100,y:200}],[2,{x:200,y:300}]]);
 const start={left:10,top:50,scrollLeft:160,scrollTop:320,zoom:42};
 const anchor=navigationAnchor(original,start);
 const moved=new Map([[1,{x:70,y:170}],[2,{x:170,y:270}]]);
 const out=nextNavigation(anchor,moved,{left:10,top:50});
 assert.equal(out.zoom,42);
 assert.equal(out.scrollLeft,190);
 assert.equal(out.scrollTop,350);
});
test("changing finger count reanchors a one-finger navigation without jumping",()=>{
 const dual=new Map([[1,{x:100,y:120}],[2,{x:250,y:220}]]);
 const anchor=navigationAnchor(dual,{left:0,top:0,scrollLeft:180,scrollTop:400,zoom:42});
 const single=new Map([[2,{x:250,y:220}]]);
 const reanchored=navigationAnchor(single,{left:0,top:0,scrollLeft:180,scrollTop:400,zoom:42});
 assert.deepEqual(nextNavigation(reanchored,single,{left:0,top:0}),{zoom:42,scrollLeft:180,scrollTop:400});
 assert.equal(spreadOf(single),0);
 assert.deepEqual(centerOf(single),{x:250,y:220});
 assert.equal(anchor.spread>0,true);
});
test("empty contact lists, invalid drag geometry and scroll bounds are safe",()=>{
 assert.equal(centerOf(new Map()),null);
 assert.equal(nextNavigation({zoom:42},new Map(),{left:0,top:0}),null);
 const touches=new Map([[1,{x:100,y:200}]]);
 const anchor=navigationAnchor(touches,{left:0,top:0,scrollLeft:0,scrollTop:0,zoom:42});
 const moved=new Map([[1,{x:600,y:900}]]);
 const next=nextNavigation(anchor,moved,{left:0,top:0});
 assert.equal(next.scrollLeft,0);
 assert.equal(next.scrollTop,0);
 assert.equal(noteDragSteps(90,42),2);
 assert.equal(noteDragSteps(NaN,42),0);
 assert.equal(noteDragSteps(90,0),0);
});
