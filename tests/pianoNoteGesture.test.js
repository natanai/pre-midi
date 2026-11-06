import test from "node:test";
import assert from "node:assert/strict";
import {noteDragDelta,noteEndGrabWidth,NOTE_DRAG_THRESHOLD,
 NOTE_HOLD_MS} from "../pianoNoteGesture.js";

test("one Beat/freeform gesture quantizes horizontal steps and vertical pitches",()=>{
 assert.deepEqual(noteDragDelta(20,-41,8,20),{
  steps:3,pitches:2,distance:Math.hypot(20,-41)
 });
 assert.deepEqual(noteDragDelta(-15,20,8,20),{
  steps:-2,pitches:-1,distance:Math.hypot(-15,20)
 });
 assert.deepEqual(noteDragDelta(0,0,8,20),{steps:0,pitches:0,distance:0});
 assert.equal(NOTE_DRAG_THRESHOLD,6);
 assert.equal(NOTE_HOLD_MS,180);
});
test("resizing leaves a movable body even on a one-step freeform note",()=>{
 assert.equal(noteEndGrabWidth(8,"mouse"),3);
 assert.equal(noteEndGrabWidth(64,"mouse"),13);
 assert.equal(noteEndGrabWidth(64,"touch"),15);
 assert.equal(noteEndGrabWidth(128,"touch"),18);
 assert.equal(noteEndGrabWidth(0,"mouse"),0);
});
test("invalid drag geometry is rejected before editing either document",()=>{
 assert.throws(()=>noteDragDelta(1,1,0,20),RangeError);
 assert.throws(()=>noteDragDelta(1,1,8,0),RangeError);
});
