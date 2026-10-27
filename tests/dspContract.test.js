import test from "node:test";
import assert from "node:assert/strict";
import {ENVELOPE_PARAMETERS,planAmplitudeEnvelope} from "../src/dsp/amplitude-envelope.js";
import {makePatch} from "../synth.js";
import {scheduleAmplitudeEnvelope} from "../envelope.js";
import {ENVELOPE_FIXTURES} from "./audio-quality/fixtures.js";

test("portable ADSR plans serialize without host objects and preserve event ordering",()=>{
 for(const fixture of ENVELOPE_FIXTURES){
  const envelope=structuredClone(fixture.envelope),options={start:.013,off:.013+fixture.gate,peak:.27,envelope};
  const plan=planAmplitudeEnvelope(options),actual=[];
  assert.equal(plan.version,1);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan);
  const param={setValueAtTime:(value,time)=>actual.push({kind:"set",value,time}),
   linearRampToValueAtTime:(value,time)=>actual.push({kind:"linear",value,time})};
  scheduleAmplitudeEnvelope(param,options);
  assert.deepEqual(actual,plan.events.map(({order,...event})=>event));
  assert.deepEqual(envelope,fixture.envelope);
  plan.events.forEach((event,i)=>{
   assert.equal(event.order,i);
   if(i)assert.ok(event.time>=plan.events[i-1].time);
  });
 }
});
test("stable ADSR parameter units, bounds and defaults match existing patch v1",()=>{
 const patch=makePatch();
 assert.deepEqual(ENVELOPE_PARAMETERS.map(x=>x.id),["envelope.attack","envelope.decay","envelope.sustain","envelope.release"]);
 for(const p of ENVELOPE_PARAMETERS){
  assert.equal(p.default,patch.envelope[p.id.split(".")[1]]);
  assert.ok(p.unit==="seconds"||p.unit==="linear_gain");
  assert.equal(p.interpolation,"linear");
 }
 assert.equal(ENVELOPE_PARAMETERS[0].effectiveMin,.002);
});
test("portable execution rejects invalid time, peak and envelope parameters",()=>{
 const base={start:0,off:1,peak:1,envelope:makePatch().envelope};
 for(const override of [{start:NaN},{off:Infinity},{off:0},{peak:-1},{start:-1},{envelope:{...base.envelope,attack:NaN}}])
  assert.throws(()=>planAmplitudeEnvelope({...base,...override}));
});
