import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRIMARY_SYNTH_FIELDS} from "../instrumentUI.js";
import {auditionSoundInspector,bindSoundInspectorIdentity,bindSoundInspectorCatalogActions} from "../soundInspector.js";

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

test("shared Sound audition cycles Rack rows and previews pitched Sound without altering notes",async()=>{
 const button={dataset:{},title:"",setAttribute(name,value){this[name]=value;}};
 const sounds=[
  {id:"kick",name:"kick",referencePitch:36},
  {id:"snare",name:"snare",referencePitch:38}
 ];
 const instrument={id:"rack",layout:"rack",sounds};
 const calls=[],positions=new Map();
 const play=async (inst,pitch,context,options)=>calls.push({
  instrument:inst.id,pitch,context,options
 });
 for(let i=0;i<3;i++)await auditionSoundInspector({
  instrument,sound:sounds[1],context:"song",button,
  previewPositions:positions,play
 });
 assert.deepEqual(calls.map(call=>call.options.soundId),["kick","snare","kick"]);
 assert.equal(button["aria-label"],"hear kick (1 of 2)");
 assert.equal(button.dataset.previewSoundId,"kick");
 assert.deepEqual(sounds.map(sound=>sound.id),["kick","snare"]);
 instrument.layout="piano";
 await auditionSoundInspector({
  instrument,sound:sounds[1],context:"beat",button,previewPositions:positions,play
 });
 assert.equal(calls.at(-1).options.soundId,"snare");
 assert.equal(button["aria-label"],"hear current sound");
 assert.equal(calls.at(-1).context,"beat");
});
test("shared audition passes host failures to the active context",async()=>{
 const button={dataset:{},setAttribute(){}};
 const errors=[],sound={id:"sound",referencePitch:60};
 await auditionSoundInspector({
  instrument:{id:"i",layout:"piano",sounds:[sound]},sound,context:{},
  button,previewPositions:new Map(),play:()=>Promise.reject(new Error("device unavailable")),
  onError:error=>errors.push(error.message)
 });
 assert.deepEqual(errors,["device unavailable"]);
});

test("shared Sound identity has one context-owned edit per name or pitch change",()=>{
 const sound={id:"s",name:"voice",referencePitch:60};
 const nameInput={},referenceInput={},edits=[];
 bindSoundInspectorIdentity({
  sound,nameInput,referenceInput,
  onRename:value=>edits.push(["name",value]),
  onReferencePitch:value=>edits.push(["pitch",value])
 });
 assert.equal(nameInput.value,"voice");
 assert.equal(referenceInput.value,"60");
 nameInput.value="  new voice  ";nameInput.onchange();
 referenceInput.value="72";referenceInput.onchange();
 assert.deepEqual(edits,[["name","new voice"],["pitch",72]]);
 assert.equal(nameInput.value,"new voice");
 for(const bad of ["","-1","128","70.5","not a number"]){
  referenceInput.value=bad;referenceInput.onchange();
  assert.equal(referenceInput.value,"60");
 }
 assert.equal(edits.length,2,"Invalid MIDI reference pitches create no undo transactions");
});

test("shared catalog action binding preserves context-specific browser and preset intent",()=>{
 const btn=()=>({onclick:null,attributes:{},setAttribute(key,value){this.attributes[key]=value;}});
 const browse=btn(),save=btn(),rowBrowse=btn(),rowSave=btn(),rackSave=btn(),importAudio=btn();
 const actions=[],onBrowse=mode=>actions.push(["browse",mode]);
 const onSave=wholeRack=>actions.push(["save",wholeRack]);
 bindSoundInspectorCatalogActions({
  instrument:{layout:"rack"},browseButton:browse,saveButton:save,
  rowBrowseButton:rowBrowse,rowSaveButton:rowSave,rackSaveButton:rackSave,
  importButton:importAudio,onImport:()=>actions.push(["import"]),
  onBrowse,onSave
 });
 browse.onclick();save.onclick();rowBrowse.onclick();rowSave.onclick();
 rackSave.onclick();importAudio.onclick();
 assert.deepEqual(actions,[
  ["browse","replace"],["save",true],["browse","replace-row"],
  ["save",false],["save",true],["import"]
 ]);
 assert.equal(save.attributes["aria-label"],"Save rack preset");
 actions.length=0;
 bindSoundInspectorCatalogActions({
  instrument:{layout:"rack"},browseButton:browse,saveButton:save,
  browseMode:"replace-row",saveWholeRack:false,onBrowse,onSave
 });
 browse.onclick();save.onclick();
 assert.deepEqual(actions,[["browse","replace-row"],["save",false]]);
 assert.equal(save.attributes["aria-label"],"save preset");
});

test("both Sound contexts own no separate catalog or preset action handlers",()=>{
 const beat=source("studio.js"),freeform=source("freeformSoundUI.js");
 const core=source("soundInspector.js");
 assert.match(core,/export function bindSoundInspectorCatalogActions/);
 assert.match(beat,/bindSoundInspectorCatalogActions\(\{/);
 assert.match(freeform,/bindSoundInspectorCatalogActions\(\{/);
 for(const id of ["change-sound","save-sound","save-row-sound","replace-row-sound"]){
  assert.doesNotMatch(beat,new RegExp('\\$\\("'+id+'"\\)\\.addEventListener\\("click"'));
 }
 assert.doesNotMatch(freeform,/button\("browse sounds",\(\)=>onBrowseSound/);
 assert.doesNotMatch(freeform,/button\("save preset",\(\)=>onSaveSound/);
});
