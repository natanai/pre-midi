import test from "node:test";
import assert from "node:assert/strict";
import {envelopeLevelAt,scheduleAmplitudeEnvelope} from "../envelope.js";
import {configureDriveShaper,driveCurve,DRIVE_OVERSAMPLE} from "../audioEffects.js";
const env={attack:.2,decay:.5,sustain:.4,release:.3};
function mockParam(){
 const events=[];
 return {events,
  setValueAtTime:(value,time)=>{events.push({kind:"set",value,time});},
  linearRampToValueAtTime:(value,time)=>{events.push({kind:"ramp",value,time});}
 };
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,actual+" != "+expected);
test("release during attack starts from actual envelope level",()=>{
 const param=mockParam(),level=scheduleAmplitudeEnvelope(param,{start:1,off:1.05,peak:1,envelope:env});
 near(level,.25);
 assert.deepEqual(param.events.map(e=>e.time),[1,1.05,1.05,1.35]);
 near(param.events.at(-2).value,.25);
 assert.ok(!param.events.some(e=>e.time>1.05&&e.value===1));
});
test("release during decay preserves its instantaneous value",()=>{
 const param=mockParam(),level=scheduleAmplitudeEnvelope(param,{start:0,off:.35,peak:1,envelope:env});
 near(level,.82);
 assert.deepEqual(param.events.map(e=>e.time),[0,.2,.35,.35,.65]);
 near(param.events.at(-2).value,.82);
});
test("sustained and zero-decay notes settle at sustain without discontinuities",()=>{
 const param=mockParam(),level=scheduleAmplitudeEnvelope(param,{start:2,off:3,peak:.75,envelope:env});
 near(level,.3);
 assert.deepEqual(param.events.map(e=>e.time),[2,2.2,2.7,3,3.3]);
 near(envelopeLevelAt({...env,attack:0,decay:0},1,1),.4);
});
test("extremely short attack uses bounded ramp and note-off cannot precede note-on",()=>{
 const param=mockParam();
 scheduleAmplitudeEnvelope(param,{start:0,off:.015,peak:1,envelope:{attack:0,decay:0,sustain:.5,release:.02}});
 assert.ok(param.events.every(e=>Number.isFinite(e.time)&&Number.isFinite(e.value)));
 assert.throws(()=>scheduleAmplitudeEnvelope(mockParam(),{start:2,off:1,peak:1,envelope:env}),/Note-off/);
});
test("drive processor uses 4x anti-aliasing in synth and sampler paths",()=>{
 const processor={},result=configureDriveShaper(processor,.7);
 assert.equal(result,processor);
 assert.equal(DRIVE_OVERSAMPLE,"4x");
 assert.equal(processor.oversample,"4x");
 assert.equal(processor.curve,driveCurve(.7));
 assert.equal(processor.curve.length,1024);
});
