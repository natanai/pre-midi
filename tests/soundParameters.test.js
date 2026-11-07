import test from "node:test";
import assert from "node:assert/strict";
import {SOUND_PARAMETERS,parameterFor,parametersFor,validParameterValue,parameterCapability} from "../src/dsp/parameters.js";
import {soundField,soundParameterPath,soundParameterId,readSoundParameter} from "../soundParameterAdapter.js";
import {makePatch,PRESETS,validatePatch} from "../synth.js";
import {makeSamplerPatch,SAMPLE_LIBRARY} from "../samples.js";
import {vocalDisplayPatch,vocalChangesFromControl} from "../vocalAudioView.js";
import {validateVocalEffects} from "../vocalEffects.js";
import {assignSoundEdit} from "../soundEditPath.js";
import {diagram} from "../soundIllustrations.js";

const vocal=()=>vocalDisplayPatch({gain:1},{id:"voice"});
test("current factory sounds retain their authored values and valid source contracts",()=>{
 assert.equal(new Set(SOUND_PARAMETERS.map(p=>p.id)).size,SOUND_PARAMETERS.length);
 for(const patch of [...PRESETS.map(p=>makePatch(p.id)),...SAMPLE_LIBRARY.map(makeSamplerPatch)]){
  const before=structuredClone(patch);
  assert.deepEqual(validatePatch(patch),[],patch.presetId);
  for(const p of parametersFor(patch.type)){
   const path=soundParameterPath(p.id,patch.type);
   assert.equal(soundParameterId(path,patch.type),p.id);
   readSoundParameter(patch,p.id);
  }
  assert.deepEqual(patch,before);
 }
});
test("shared parameter endpoints are accepted and out-of-range edits rejected in every source",()=>{
 const ids=["filter.cutoff","filter.resonance","pan","effects.drive","effects.delayMix","effects.delayTime","effects.delayFeedback","movement.depth","movement.toneRate","envelope.attack","envelope.release"];
 for(const context of ["synth","sample","vocal"])for(const id of ids){
  const p=parameterFor(id,context),field=soundField(id,context);
  assert.equal(field.min,p.min);assert.equal(field.max,p.max);
  for(const [value,accepted] of [[p.min,true],[p.max,true],[p.min-.001,false],[p.max+.001,false],[NaN,false]]){
   const patch=context==="synth"?makePatch():context==="sample"?makeSamplerPatch(SAMPLE_LIBRARY[0]):vocal();
   const path=soundParameterPath(id,context);
   if(context==="vocal"){
    const delta=vocalChangesFromControl(patch,path,value);
    assert.equal(validateVocalEffects(delta).length===0,accepted,context+" "+id+" "+value);
   }else{
    assignSoundEdit(patch,path,value);
    assert.equal(validatePatch(patch).length===0,accepted,context+" "+id+" "+value);
   }
   assert.equal(validParameterValue(id,value,context),accepted);
  }
 }
});
test("source-only, unsupported and currently inactive processing have distinct capabilities",()=>{
 assert.equal(parameterCapability("oscillators.0.wave","synth").state,"source-only");
 assert.equal(parameterCapability("oscillators.0.wave","vocal").state,"unsupported");
 assert.equal(parameterCapability("effects.drive","vocal").state,"implemented");
 assert.equal(parameterCapability("movement.rate","vocal").state,"inactive");
 assert.equal(parameterCapability("movement.rate","vocal",id=>id==="movement.depth"?12:undefined).state,"implemented");
 assert.equal(parameterCapability("filter.cutoff","vocal",id=>id==="filter"?null:undefined).reason,"the filter is off");
 assert.equal(parameterFor("envelope.attack","synth").trigger,"note-on");
 assert.equal(parameterFor("envelope.attack","vocal").trigger,"clip-start");
 for(const patch of [makePatch(),makeSamplerPatch(SAMPLE_LIBRARY[0])]){
  patch.movement.unimplementedFollower=.8;
  assert.ok(validatePatch(patch).length,"unsupported processing must not silently survive validation");
 }
 assert.ok(validateVocalEffects({movement:{unimplementedFollower:.8}}).length);
});
test("recording graph endpoints and modulation choices cannot author unsupported vocal values",()=>{
 const patch=vocal(),before=structuredClone(patch);
 const release=diagram(patch,"sample").handles.flatMap(h=>h.axes).find(a=>a.path[0]==="release");
 assert.equal(release.min,0);
 assert.deepEqual(validateVocalEffects(vocalChangesFromControl(patch,release.path,release.min)),[]);
 patch.modulation={version:1,routes:[{id:"route",source:{kind:"lfo",shape:"sine",rate:.5},target:"pan",unit:"pan",depth:.5,polarity:"bipolar",smoothing:.005}]};
 const graph=diagram(patch,"modulation",1),target=graph.actions.find(a=>a.path.at(-1)==="target"),source=graph.actions.find(a=>a.path.at(-1)==="kind");
 assert.deepEqual(target.choices,["filter.cutoff","pan"]);
 assert.deepEqual(source.choices,["lfo","envelope"]);
 for(const h of graph.handles)for(const axis of h.axes)assert.ok(Number.isFinite(axis.min)&&Number.isFinite(axis.max));
 patch.modulation=before.modulation;assert.deepEqual(patch,before);
});
