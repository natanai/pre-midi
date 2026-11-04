import test from "node:test";
import assert from "node:assert/strict";
import {create,clone,makeSound,id} from "../schema.js";
import {makePatch} from "../synth.js";
import {createFreeform,addFreeformInstrument,addFreeformNote,validateFreeform} from "../freeformModel.js";
import {applyFreeformPreset} from "../freeformPresets.js";
import {makeSampleAsset} from "../sampler.js";
import {encodeMonoWav} from "../recording.js";
import {createSong,validateSong,upgradeSongFeatures} from "../songModel.js";
import {exportSongProject,importSongProject} from "../songIO.js";

const synth=(name="variation")=>({name,patch:makePatch(),trigger:"pitched"});
const sample=(asset,root=60)=>({
 type:"sample",presetId:"custom",zones:[{assetId:asset.id,root}],
 followPitch:true,oneShot:false,transpose:0,gain:.9,attack:.005,
 release:.17,pan:0,strumMs:0,preserveDynamics:false
});
const asset=()=>makeSampleAsset("freeform-library-"+id(),"Recorded sample","audio/wav",
 encodeMonoWav(Float32Array.from({length:2205},(_,i)=>Math.sin(i*.08)*.15)),
 "user preset");

test("freeform preset browsing creates a new Instrument without mutating its source",()=>{
 const layer=createFreeform(),before=clone(synth());
 const result=applyFreeformPreset(layer,{mode:"add"},before);
 assert.equal(result.operation,"create-pitched");
 assert.equal(layer.instruments.length,1);
 assert.equal(layer.instruments[0].name,before.name);
 assert.deepEqual(layer.instruments[0].sounds[0].patch,before.patch);
 assert.notEqual(layer.instruments[0].id,result.soundId);
 assert.deepEqual(before,synth());
 assert.deepEqual(validateFreeform(layer),[]);
});
test("replacing pitched Sound keeps independently placed notes and blocks dropping movement",()=>{
 const layer=createFreeform(),inst=addFreeformInstrument(layer);
 const note=addFreeformNote(inst,{pitch:65,start:33,duration:34,velocity:.7});
 const originalId=inst.sounds[0].id;
 const selected={mode:"replace",instrumentId:inst.id,soundId:originalId};
 const result=applyFreeformPreset(layer,selected,synth("new timbre"));
 assert.equal(result.operation,"replace-pitched");
 assert.equal(result.soundId,originalId);
 assert.equal(inst.notes[0].id,note.id);
 assert.equal(inst.notes[0].duration,34);
 assert.equal(inst.sounds[0].name,"new timbre");
 assert.deepEqual(validateFreeform(layer),[]);
 layer.version=2;
 note.cutoffAutomation={version:1,step:0,limitStep:16,block:{
  version:1,target:"filter.cutoff",unit:"hz",interpolation:"exponential",
  points:[{id:"start",step:0,value:400},{id:"end",step:16,value:800}]
 }};
 const wave=asset();
 assert.throws(()=>applyFreeformPreset(layer,selected,{
  name:"wav",patch:sample(wave),trigger:"pitched",assets:[wave]
 }),/cutoff movement/);
 assert.equal(inst.sounds[0].name,"new timbre");
 assert.equal(layer.samples.length,0);
 assert.deepEqual(validateFreeform(layer),[]);
});
test("full preset racks create independent Sounds and row replacement preserves note identity",()=>{
 const layer=createFreeform();
 const kit=[
  makeSound("kick",makePatch(),"hit"),
  makeSound("snare",makePatch(),"hit")
 ];
 const original=clone(kit);
 const created=applyFreeformPreset(layer,{mode:"add"},{
  name:"Drums",patch:kit[0].patch,trigger:"hit",rackSounds:kit,
  settings:{volume:.45}
 });
 assert.equal(created.operation,"create-rack");
 const inst=layer.instruments[0];
 assert.equal(inst.layout,"rack");
 assert.equal(inst.sounds.length,2);
 assert.equal(inst.volume,.45);
 assert.notEqual(inst.sounds[0].id,kit[0].id);
 assert.deepEqual(kit,original);
 const hit=addFreeformNote(inst,{soundId:inst.sounds[1].id,start:32,duration:1,velocity:.8});
 const row={mode:"replace-row",instrumentId:inst.id,soundId:inst.sounds[1].id};
 const replaced=applyFreeformPreset(layer,row,{
  name:"clap",patch:makePatch(),trigger:"hit"
 });
 assert.equal(replaced.operation,"replace-row");
 assert.equal(replaced.soundId,hit.soundId);
 assert.equal(inst.sounds[1].name,"clap");
 assert.deepEqual(validateFreeform(layer),[]);
 assert.throws(()=>applyFreeformPreset(layer,row,{
  name:"whole rack",patch:kit[0].patch,trigger:"hit",rackSounds:kit
 }),/complete rack cannot replace/);
});
test("sample preset Assets deduplicate, remain external, and round-trip inside a Song",async()=>{
 const wave=asset(),patch=sample(wave);
 const layer=createFreeform();
 const preset={name:"audio",patch,trigger:"pitched",assets:[wave]};
 const first=applyFreeformPreset(layer,{mode:"add"},preset);
 const second=applyFreeformPreset(layer,{mode:"add"},preset);
 assert.equal(layer.samples.length,1);
 const song=createSong(create());song.tracks[0].freeform=layer;
 addFreeformNote(layer.instruments[0],{pitch:60,start:16,duration:4,velocity:.8});
 upgradeSongFeatures(song);
 assert.deepEqual(validateSong(song),[]);
 const packageFile=exportSongProject(song);
 assert.match(packageFile.name,/\.zip$/);
 const restored=await importSongProject({
  name:packageFile.name,size:packageFile.blob.size,
  arrayBuffer:()=>packageFile.blob.arrayBuffer()
 });
 assert.deepEqual(restored,song);
 assert.ok(first.instrumentId&&second.instrumentId);
 assert.notEqual(first.instrumentId,second.instrumentId);
 const replaced=applyFreeformPreset(layer,
  {mode:"replace",instrumentId:first.instrumentId,soundId:first.soundId},
  synth("plain"));
 assert.equal(replaced.operation,"replace-pitched");
 assert.equal(layer.samples.length,1,"The second Instrument still uses this Asset.");
 assert.throws(()=>applyFreeformPreset(layer,{mode:"add"},{
  name:"lost audio",patch:sample(wave),trigger:"pitched",assets:[]
 }),/missing sample Asset|^$/);
});
