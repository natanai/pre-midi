import test from "node:test";
import assert from "node:assert/strict";
import {SCALE_ROOTS,SCALE_MODES,normalizeScaleGuide,scaleGuideForBeat,isPitchInScale,isPitchInScaleAtStep,scaleDirectionAtStep} from "../scaleGuide.js";
import {pianoKeyGeometry} from "../pianoKeyboard.js";

test("all twelve tonics and named modes have valid, distinct pitch-class sets",()=>{
 assert.equal(SCALE_ROOTS.length,12);
 assert.equal(SCALE_MODES.length,18);
 assert.equal(new Set(SCALE_MODES.map(mode=>mode.id)).size,SCALE_MODES.length);
 for(const mode of SCALE_MODES){
  assert.equal(mode.steps[0],0,mode.id+" must include its tonic");
  assert.deepEqual([...new Set(mode.steps)].sort((a,b)=>a-b),mode.steps);
  assert.ok(mode.steps.every(step=>Number.isInteger(step)&&step>=0&&step<12));
 }
});
test("major, minor, modal, pentatonic and blues intervals are applied at any octave",()=>{
 for(const root of [0,2,6,11]){
  for(const shift of [-24,-12,0,12,24]){
   assert.equal(isPitchInScale(root+shift,{root,mode:"major"}),true);
   assert.equal(isPitchInScale(root+shift+4,{root,mode:"major"}),true);
   assert.equal(isPitchInScale(root+shift+3,{root,mode:"major"}),false);
   assert.equal(isPitchInScale(root+shift+3,{root,mode:"natural-minor"}),true);
   assert.equal(isPitchInScale(root+shift+6,{root,mode:"blues"}),true);
   assert.equal(isPitchInScale(root+shift+6,{root,mode:"lydian"}),true);
   assert.equal(isPitchInScale(root+shift+6,{root,mode:"major-pentatonic"}),false);
  }
 }
});
test("harmonic and melodic minor are distinct from natural minor",()=>{
 assert.equal(isPitchInScale(71,{root:0,mode:"natural-minor"}),false);
 assert.equal(isPitchInScale(71,{root:0,mode:"harmonic-minor"}),true);
 assert.equal(isPitchInScale(69,{root:0,mode:"melodic-minor"}),true);
 assert.equal(isPitchInScale(68,{root:0,mode:"melodic-minor"}),true); // descending form
 assert.equal(isPitchInScale(68,{root:0,mode:"melodic-minor-jazz"}),false);
});
test("chromatic is nonrestrictive and invalid stored preferences fail safely",()=>{
 assert.deepEqual(normalizeScaleGuide(null),{root:0,mode:"chromatic",lock:false});
 assert.deepEqual(normalizeScaleGuide({root:99,mode:"unknown",lock:true}),{root:0,mode:"chromatic",lock:false});
 assert.deepEqual(normalizeScaleGuide({root:2,mode:"major",lock:true}),{root:2,mode:"major",lock:true});
 assert.equal(isPitchInScale(61,{root:0,mode:"chromatic"}),true);
 assert.equal(isPitchInScale(61,{root:0,mode:"unknown"}),true);
 assert.equal(isPitchInScale(NaN,{root:0,mode:"major"}),false);
 assert.equal(isPitchInScale(60.5,{root:0,mode:"major"}),false);
});
test("piano-roll scales are editor guidance; they never mutate note events",()=>{
 const notes=[{id:"1",pitch:60,start:0,duration:4},{id:"2",pitch:61,start:4,duration:4}];
 const original=structuredClone(notes);
 const guide=normalizeScaleGuide({root:0,mode:"major",lock:true});
 assert.equal(isPitchInScale(notes[0].pitch,guide),true);
 assert.equal(isPitchInScale(notes[1].pitch,guide),false);
 assert.deepEqual(notes,original);
});

test("classical melodic minor follows earlier melodic direction in musical time",()=>{
 const guide={root:9,mode:"melodic-minor",lock:true}; // A melodic minor
 const notes=[{pitch:69,start:0,duration:2},{pitch:72,start:4,duration:2}];
 assert.equal(isPitchInScaleAtStep(78,guide,notes,1),true); // ascending F sharp
 assert.equal(isPitchInScaleAtStep(77,guide,notes,1),false); // not ascending F natural
 assert.equal(isPitchInScaleAtStep(65,guide,notes,1),true); // descending F natural
 assert.equal(isPitchInScaleAtStep(66,guide,notes,1),false); // not descending F sharp
 assert.equal(isPitchInScaleAtStep(67,guide,notes,5),true); // G natural below C5
 assert.equal(isPitchInScaleAtStep(68,guide,notes,5),false); // G sharp below C5
 assert.equal(scaleDirectionAtStep(78,notes,1),"ascending");
 assert.equal(scaleDirectionAtStep(65,notes,1),"descending");
 assert.equal(scaleDirectionAtStep(65,notes,0),"either");
 assert.equal(isPitchInScaleAtStep(77,guide,[],0),true);
 assert.equal(isPitchInScaleAtStep(78,guide,[],0),true);
 assert.equal(isPitchInScaleAtStep(66,{root:9,mode:"melodic-minor-jazz"},notes,1),true);
});
test("directional scale context is unambiguous only when the prior onset agrees",()=>{
 const guide={root:9,mode:"melodic-minor"};
 const chord=[{start:0,pitch:60},{start:0,pitch:84}];
 assert.equal(scaleDirectionAtStep(77,chord,1),"either");
 assert.equal(isPitchInScaleAtStep(77,guide,chord,1),true);
 assert.equal(isPitchInScaleAtStep(78,guide,chord,1),true);
 const phrase=[{start:0,pitch:84},{start:3,pitch:69},{start:9,pitch:60}];
 assert.equal(scaleDirectionAtStep(78,phrase,4),"ascending");
 assert.equal(scaleDirectionAtStep(78,phrase,0),"either");
 assert.equal(scaleDirectionAtStep(78,phrase,9),"ascending"); // onset at 9 is simultaneous, not earlier
 assert.equal(scaleDirectionAtStep(78,phrase,10),"ascending");
});

test("piano keyboard geometry fills the entire roll with continuous white keys",()=>{
 const {white,black,height}=pianoKeyGeometry();
 assert.equal(height,48*23);
 assert.equal(white.length,28);
 assert.equal(black.length,20);
 assert.equal(white[0].top,0);
 assert.equal(white.at(-1).top+white.at(-1).height,height);
 for(let index=1;index<white.length;index++)
  assert.equal(white[index-1].top+white[index-1].height,white[index].top);
 for(const key of black){
  assert.ok(key.top>0 && key.top+key.height<height);
  assert.equal(key.top,(83-key.pitch)*23+1);
 }
 assert.equal(new Set([...white,...black].map(key=>key.pitch)).size,48);
});

test("scale preferences follow the Beat when switching or adding instruments",()=>{
 const beat={id:"beat-a",instruments:[{id:"first"},{id:"second"}]};
 const legacy=new Map([["beat-a:first",{root:0,mode:"dorian",lock:true}]]);
 assert.deepEqual(scaleGuideForBeat(legacy,beat),{root:0,mode:"dorian",lock:true});
 beat.instruments.push({id:"third"});
 assert.deepEqual(scaleGuideForBeat(legacy,beat),{root:0,mode:"dorian",lock:true});
 legacy.set("beat-a",{root:7,mode:"major",lock:false});
 assert.deepEqual(scaleGuideForBeat(legacy,beat),{root:7,mode:"major",lock:false});
 assert.deepEqual(scaleGuideForBeat(legacy,{id:"beat-b",instruments:[{id:"other"}]}),
  {root:0,mode:"chromatic",lock:false});
});
test("legacy Beat preferences prefer an intentional scale and preserve chromatic unlocking",()=>{
 const beat={id:"beat-a",instruments:[{id:"first"},{id:"second"}]};
 const preferences=new Map([
  ["beat-a:first",{root:0,mode:"chromatic",lock:false}],
  ["beat-a:second",{root:2,mode:"minor-pentatonic",lock:true}]
 ]);
 assert.deepEqual(scaleGuideForBeat(preferences,beat),
  {root:2,mode:"minor-pentatonic",lock:true});
 preferences.set("beat-a",{root:2,mode:"minor-pentatonic",lock:false});
 const unlocked=scaleGuideForBeat(preferences,beat);
 assert.equal(unlocked.lock,false);
 assert.equal(isPitchInScale(61,unlocked),false,"unlocked notes remain marked outside the guide");
});
