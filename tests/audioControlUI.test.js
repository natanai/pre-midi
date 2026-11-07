import test from "node:test";
import assert from "node:assert/strict";
import {
 AUDIO_COMMON_CONTROLS,AUDIO_SAMPLE_EXTRA_CONTROLS,AUDIO_VOCAL_ENVELOPE_CONTROLS,
 AUDIO_MOVEMENT_CONTROLS,AUDIO_BEND_CONTROLS,AUDIO_DELAY_CONTROLS
} from "../audioControlUI.js";
import {vocalDisplayPatch,vocalChangesFromControl} from "../vocalAudioView.js";
import {diagram} from "../soundIllustrations.js";
import {validateVocalEffects} from "../vocalEffects.js";

const voice=()=>({
 recording:{id:"voice-fixture"},
 clip:{id:"clip-fixture",gain:1,effects:undefined}
});
test("audio controls use one bounded parameter catalog for sampled and vocal editing",()=>{
 const names=groups=>groups.flatMap(group=>group.map(item=>item[0]));
 const shared=names([AUDIO_COMMON_CONTROLS,AUDIO_MOVEMENT_CONTROLS,AUDIO_BEND_CONTROLS]);
 assert.ok(shared.includes("gain")&&shared.includes("transpose")&&shared.includes("glide"));
 assert.ok(names([AUDIO_SAMPLE_EXTRA_CONTROLS]).includes("strumMs"));
 assert.ok(names([AUDIO_VOCAL_ENVELOPE_CONTROLS]).includes("attack"));
 assert.ok(names([AUDIO_DELAY_CONTROLS]).includes("delayMix"));
 for(const item of [AUDIO_COMMON_CONTROLS,AUDIO_SAMPLE_EXTRA_CONTROLS,AUDIO_VOCAL_ENVELOPE_CONTROLS,
  AUDIO_MOVEMENT_CONTROLS,AUDIO_BEND_CONTROLS,AUDIO_DELAY_CONTROLS].flat()){
  assert.equal(item.length,6);
  assert.ok(Number.isFinite(item[2])&&Number.isFinite(item[3])&&item[2]<item[3]);
  assert.ok(item[4]>0);
 }
});
test("vocal sample visuals represent filter bypass without inventing a pitched sample map",()=>{
 const {clip,recording}=voice(),patch=vocalDisplayPatch(clip,recording);
 assert.equal(patch.type,"vocal");
 assert.equal(patch.audioFilterBypassed,true);
 const bypass=diagram(patch,"filter");
 assert.equal(bypass.handles.length,0,"Bypassed filter must not show an active cutoff handle");
 assert.ok(bypass.labels.some(item=>item.value==="off"));
 const sample=diagram(patch,"sample");
 assert.ok(sample.labels.some(item=>item.value==="voice"));
 assert.ok(!sample.paths.some(path=>path.links.includes("zones.0.root")||path.links.includes("strumMs")||path.links.includes("followPitch")));
 const active=structuredClone(clip);
 active.effects={filter:{type:"highpass",cutoff:2200,resonance:3}};
 const enabled=diagram(vocalDisplayPatch(active,recording),"filter");
 assert.ok(enabled.handles.some(h=>h.axes.some(axis=>axis.path.join(".")==="filter.cutoff")));
});
test("two-axis sound-graph drags are one atomic vocal edit with shared parameter values",()=>{
 const {clip,recording}=voice();
 const original=vocalDisplayPatch(clip,recording);
 const delta=vocalChangesFromControl(original,[["filter","cutoff"],["filter","resonance"]],[1750,4.5]);
 assert.deepEqual(delta,{filter:{type:"lowpass",cutoff:1750,resonance:4.5,sweep:0,sweepTime:.2}});
 assert.equal(validateVocalEffects(delta).length,0);
 assert.equal(clip.effects,undefined,"Projected editor changes never mutate Song source objects");
 const rise=vocalChangesFromControl(original,["attack"],.6);
 assert.deepEqual(rise,{attack:.6});
 const move=vocalChangesFromControl(original,["movement","depth"],80);
 assert.deepEqual(move,{movement:{...original.movement,depth:80}});
 const dryWet=vocalChangesFromControl(original,["effects","delayMix"],.42);
 assert.deepEqual(dryWet,{delayMix:.42});
 const gain=vocalChangesFromControl(original,["gain"],1.5);
 assert.deepEqual(gain,{gain:1.5});
 const filterOff=vocalChangesFromControl(original,["filter"],null);
 assert.deepEqual(filterOff,{filter:null});
 assert.throws(()=>vocalChangesFromControl(original,["zones",0,"root"],67),/Unsupported vocal control/);
});
