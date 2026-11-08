import test from "node:test";
import assert from "node:assert/strict";
import {timelineStepAtX,attachedLanePull} from "../timelinePointer.js";
const geometry={gutter:105,barPixels:54,bars:24};
test("Song pointer positions follow bar boundaries including the visible empty tail",()=>{
 assert.equal(timelineStepAtX(105,geometry),0);
 assert.equal(timelineStepAtX(158.9,geometry),0);
 assert.equal(timelineStepAtX(159,geometry),16);
 assert.equal(timelineStepAtX(105+23*54+10,geometry),23*16);
 assert.equal(timelineStepAtX(-100,geometry),0);
 assert.equal(timelineStepAtX(5000,geometry),23*16);
});
test("Song pointer projection uses the scrolled ruler origin",()=>{
 const clientX=300,rulerLeft=-216;
 assert.equal(timelineStepAtX(clientX-rulerLeft,geometry),7*16);
 assert.equal(timelineStepAtX(clientX,geometry),3*16);
});

test("downward conversion requires a sustained pull into only the owning lane",()=>{
 const gate=attachedLanePull();
 assert.deepEqual(gate.update({inOwnLane:true,dy:30},100),{progress:0,ready:false});
 assert.equal(gate.update({inOwnLane:true,dy:30},425).progress,.5);
 assert.equal(gate.update({inOwnLane:true,dy:30},750).ready,true);
 assert.equal(gate.update({inOwnLane:false,dy:90},800).ready,false);
 assert.equal(gate.update({inOwnLane:true,dy:30},900).progress,0);
 assert.equal(gate.update({inOwnLane:true,dy:3},1600).progress,0);
 assert.equal(gate.update({inOwnLane:true,dy:30},1700).ready,false);
 gate.reset();assert.equal(gate.update({inOwnLane:true,dy:30},3000).ready,false);
});
