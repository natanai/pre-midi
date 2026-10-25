import test from "node:test";
import assert from "node:assert/strict";
import {scrubValue,clampInteger} from "../dragNumber.js";
test("drag-adjusted placement values clamp to native schema limits",()=>{
 assert.equal(scrubValue(0,200,120,0,15),8);
 assert.equal(scrubValue(16,100,180,1,16),8);
 assert.equal(scrubValue(1,200,-500,1,32),32);
 assert.equal(scrubValue(8,200,1000,0,15),0);
 assert.equal(scrubValue(16,200,195,1,64),16);
});
test("shift-drag offers finer step control without fractional timing",()=>{
 assert.equal(scrubValue(16,200,120,1,64,true),19);
 assert.equal(scrubValue(16,200,120,1,64),24);
 assert.equal(clampInteger(3.6,0,15),4);
});
