import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRIMARY_SYNTH_FIELDS} from "../instrumentUI.js";

const source=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("Beat and Song freeform mount one canonical Sound Inspector core",()=>{
 const beat=source("studio.js"),freeform=source("freeformSoundUI.js"),
  core=source("soundInspector.js");
 assert.match(beat,/renderSoundInspectorCore\(\{/);
 assert.match(freeform,/renderSoundInspectorCore\(\{/);
 for(const file of [beat,freeform]){
  assert.doesNotMatch(file,/renderPatchEditor\(/);
  assert.doesNotMatch(file,/renderSamplerEditor\(/);
  assert.doesNotMatch(file,/illustrateSoundPanel\(/);
  assert.doesNotMatch(file,/createDial\(/);
 }
 for(const expression of [
  /renderSamplerEditor\(/,/renderPatchEditor\(/,/illustrateSoundPanel\(/,
  /createSignalDisplay\(/,/PRIMARY_SYNTH_FIELDS/,
  /data.*soundPath|dataset\.soundPath/
 ])assert.match(core,expression);
});
test("canonical Inspector retains every primary synth path and contexts keep their undo owners",()=>{
 assert.deepEqual(PRIMARY_SYNTH_FIELDS.map(x=>x.path.join(".")),[
  "filter.cutoff","envelope.attack","envelope.release"
 ]);
 const beat=source("studio.js"),freeform=source("freeformSoundUI.js");
 assert.match(beat,/onStageChange:edits=>modify\(/);
 assert.match(beat,/onPatchChange:onChange/);
 assert.match(freeform,/onStageChange:edits=>mutateSelected\(/);
 assert.match(freeform,/onPatchChange:patchChange/);
 assert.match(freeform,/renderSoundInspectorCore\(\{/);
});
test("illustrations, ordinary knobs and measured sound scope share the same patch and context",()=>{
 const core=source("soundInspector.js");
 assert.match(core,/assignSoundEdit\(next,path,value\)/);
 assert.match(core,/redraw\(next\)/);
 assert.match(core,/stagePanel\?\.draw/);
 assert.match(core,/onStageChange\(edits\)/);
 assert.match(core,/onLevelChange\("volume",value\)/);
 assert.match(core,/onLevelChange\("gain",value\)/);
 assert.match(core,/root\.dataset\.soundPath=paths\[index\]/);
 assert.match(core,/onCutoffAutomation\?\.\(modulesRoot,instrument,context\)/);
 assert.match(core,/illustration\.disposeSoundIllustration\?\.\(\)/);
});
