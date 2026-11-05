import test from "node:test";
import assert from "node:assert/strict";
import {modeledDelayTaps,DELAY_MODEL_SAMPLE_RATE,DELAY_FEEDBACK_QUANTUM}
 from "../delayIllustrationResponse.js";
import {diagram} from "../soundIllustrations.js";
import {makePatch} from "../synth.js";

const effects=(delayMix=.5,delayTime=.2,delayFeedback=.5)=>({
 delayMix,delayTime,delayFeedback
});
const near=(actual,expected,tolerance=1e-12)=>
 assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);

test("delay diagram follows the actual dry × send × wet × feedback signal graph",()=>{
 const model=modeledDelayTaps(effects(.5,.2,.5));
 assert.equal(model.length,4);
 assert.deepEqual(model.map(t=>t.kind),["dry","echo","echo","echo"]);
 near(model[0].level,.8);
 near(model[1].level,.22);
 near(model[2].level,.11);
 near(model[3].level,.055);
 near(model[1].time,.2);
 near(model[2].time,.4+128/48000);
 near(model[3].time,.6+256/48000);
 assert.equal(DELAY_MODEL_SAMPLE_RATE,48000);
 assert.equal(DELAY_FEEDBACK_QUANTUM,128);
});
test("dry-only, no-feedback, full-wet and host sample rates are predictable",()=>{
 const dry=modeledDelayTaps(effects(0,.1,.75));
 assert.deepEqual(dry.map(t=>t.level),[1,0,0,0]);
 const noFeedback=modeledDelayTaps(effects(1,.1,0));
 near(noFeedback[0].level,.6);
 near(noFeedback[1].level,.44);
 near(noFeedback[2].level,0);
 const slower=modeledDelayTaps(effects(.5,.1,.5),{sampleRate:8000});
 near(slower[2].time,.2+.016);
 const longer=modeledDelayTaps(effects(.5,.1,.5),{wetCount:8});
 assert.equal(longer.length,9);
 for(let i=2;i<longer.length;i++)near(longer[i].level/longer[i-1].level,.5);
});
test("delay diagram's dry and echo stems show the model, while all knobs stay editable",()=>{
 const patch=makePatch("init");
 patch.effects={...patch.effects,...effects(.5,.2,.5)};
 const picture=diagram(patch,"delay");
 assert.equal(picture.paths.length>=6,true);
 const expected=modeledDelayTaps(patch.effects);
 for(let i=0;i<4;i++){
  const y=(100-72*expected[i].level).toFixed(2);
  assert.ok(picture.paths[i+1].d.endsWith("V"+y),
   "echo "+i+" uses real dry/wet gain "+y);
 }
 const knobs=new Set(picture.handles.flatMap(point=>
  point.axes.map(axis=>axis.path.join("."))));
 assert.deepEqual([...knobs].sort(),[
  "effects.delayFeedback","effects.delayMix","effects.delayTime"]);
 const altered=structuredClone(patch);
 altered.effects.delayMix=0;
 assert.equal(diagram(altered,"delay").labels.some(label=>label.value==="1"),false,
  "no audible echo is labeled when wet mix is zero");
 assert.ok(diagram(altered,"delay").handles.some(point=>point.axes.some(axis=>
  axis.path.join(".")==="effects.delayFeedback")),
 "feedback remains directly editable even if the delay send is silent");
});
test("invalid illustrative values cannot silently create plausible fake audio",()=>{
 for(const invalid of [
  effects(-1,.2,.5),effects(1.1,.2,.5),effects(.5,0,.5),
  effects(.5,1.2,.5),effects(.5,.2,-.1),effects(.5,.2,1),
  effects(.5,.2,Number.NaN)
 ])assert.throws(()=>modeledDelayTaps(invalid),RangeError);
});
