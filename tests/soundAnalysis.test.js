import test from "node:test";
import assert from "node:assert/strict";
import {analyzeSound,patchFromAnalysis,audioSignature,signatureDistance} from "../soundAnalysis.js";
import {validatePatch} from "../synth.js";
import {recordingExcerpt,RECORDING_RATE} from "../recording.js";
import {convertToSynth} from "../synthMatch.js";
function note(hz=220){
 return Float32Array.from({length:44100},(_,i)=>{
  const t=i/44100,envelope=Math.min(1,t/.02)*Math.min(1,(1-t)/.1);
  return .4*envelope*(Math.sin(2*Math.PI*hz*t)+.5*Math.sin(4*Math.PI*hz*t)+.2*Math.sin(6*Math.PI*hz*t));
 });
}
test("analysis recovers known independent harmonic ratios and a playable native patch",()=>{
 const analysis=analyzeSound(note(),44100);
 assert.equal(analysis.referencePitch,57);
 assert.ok(Math.abs(analysis.partials[1]-.5)<.04);
 assert.ok(Math.abs(analysis.partials[2]-.2)<.04);
 assert.ok(analysis.noise<.1);
 assert.deepEqual(validatePatch(patchFromAnalysis(analysis)),[]);
 assert.match(analysis.name,/Tone|Pluck|Swell/);
 assert.equal(signatureDistance(analysis.signature,analysis.signature),0);
 const different=audioSignature(Float32Array.from({length:22050},(_,i)=>Math.sin(2*Math.PI*800*i/22050)));
 assert.ok(signatureDistance(analysis.signature,different)>.1);
});
test("manual root selection is honored without retaining the source in the patch",()=>{
 const analysis=analyzeSound(note(),44100,{root:58}),patch=patchFromAnalysis(analysis);
 assert.equal(analysis.referencePitch,58);
 assert.deepEqual(validatePatch(patch),[]);
 assert.ok(JSON.stringify(patch).length<3000);
 assert.doesNotMatch(JSON.stringify(patch),/base64|assetId|data:|\.wav/);
});
test("ringing hits use the rack voice's attack-plus-decay gate",()=>{
 const analysis=analyzeSound(note(),44100,{kind:"hit"});
 assert.ok(Math.abs(analysis.envelope.attack+analysis.envelope.decay-analysis.hold)<.02);
 assert.deepEqual(validatePatch(patchFromAnalysis(analysis)),[]);
});
test("silent, nonfinite, overlong audio and invalid excerpts fail before conversion",()=>{
 assert.throws(()=>analyzeSound(new Float32Array(44100),44100),/silent/);
 assert.throws(()=>analyzeSound(Float32Array.of(NaN,1),44100),/invalid/);
 assert.throws(()=>analyzeSound(new Float32Array(44100*5),44100),/four seconds/);
 const source=new Float32Array(RECORDING_RATE*6);
 assert.equal(recordingExcerpt(source,2,1.5).length,RECORDING_RATE*1.5);
 for(const [start,length] of [[-1,1],[0,5],[5,2],[Infinity,1],[0,NaN]])
  assert.throws(()=>recordingExcerpt(source,start,length));
});
test("cancellation requires no audio rendering and cannot produce an instrument",async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(convertToSynth(note(),44100,{signal:controller.signal}),{name:"AbortError"});
});
