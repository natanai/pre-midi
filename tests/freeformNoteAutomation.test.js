import test from "node:test";
import assert from "node:assert/strict";
import {create,id,clone,validate as validateBeat} from "../schema.js";
import {createSong,upgradeSongFeatures,validateSong} from "../songModel.js";
import {createFreeformNoteCutoff,editFreeformNoteCutoff} from "../freeformNoteAutomation.js";
import {ensureFreeform,addFreeformInstrument,addFreeformNote,
 createBeatFromFreeformSelection,validateFreeform} from "../freeformModel.js";
import {renderEvents} from "../audio.js";
import {nativePlans} from "../src/hosts/native/session.js";
import {parseSong} from "../songIO.js";
import {readFileSync} from "node:fs";

test("new freeform note curve uses source-relative note steps and valid versioned bounds",()=>{
 const song=createSong(create()),layer=ensureFreeform(song.tracks[0]);
 const inst=addFreeformInstrument(layer),note=addFreeformNote(inst,{
  pitch:60,start:32,duration:10,velocity:.8
 });
 const curve=createFreeformNoteCutoff(note,inst.sounds[0].patch);
 assert.equal(curve.version,1);
 assert.deepEqual(curve.block.points.map(point=>point.step),[0,10]);
 assert.equal(curve.step,0);
 assert.equal(curve.limitStep,10);
 note.cutoffAutomation=curve;
 layer.version=2;upgradeSongFeatures(song);
 assert.deepEqual(validateFreeform(layer),[]);
 assert.deepEqual(validateSong(song),[]);
 assert.deepEqual(parseSong(JSON.stringify(song)),song);
});

test("both curve handles change the same source curve without changing its phase",()=>{
 const patch=create().instruments[0].sounds[0].patch;
 const note={pitch:60,start:12,duration:24,velocity:.8};
 const captured=createFreeformNoteCutoff(note,patch);
 const prior=clone(captured);
 const moved=editFreeformNoteCutoff(captured,["points",1,"value"],1500);
 assert.equal(moved.block.points[1].value,1500);
 assert.deepEqual(moved.block.points.map(p=>p.id),
  prior.block.points.map(p=>p.id));
 assert.equal(moved.limitStep,24);
 assert.equal(moved.step,0);
 assert.deepEqual(captured,prior,"Preview and edit cannot mutate prior undo snapshot");
 const first=editFreeformNoteCutoff(moved,["points",0,"step"],90);
 assert.equal(first.block.points[0].step,23,"Begin handle may not cross end handle");
 const second=editFreeformNoteCutoff(first,["points",1,"step"],3);
 assert.equal(second.block.points[1].step,24,"End handle may not cross begin handle");
 const movedBoth=editFreeformNoteCutoff(captured,
  [["points",1,"step"],["points",1,"value"]],[20,1700]);
 assert.equal(movedBoth.block.points[1].step,20);
 assert.equal(movedBoth.block.points[1].value,1700);
 assert.deepEqual(captured,prior,"Two-axis edits preserve the source undo snapshot");
 assert.throws(()=>editFreeformNoteCutoff(first,["points",1,"value"],10),
  /cutoff|automation|unsupported|Hz|values/i);
});

test("newly authored freeform cutoff and multi-bar sustain survive v27 extraction and native planning",()=>{
 const song=createSong(create()),track=song.tracks[0],layer=ensureFreeform(track);
 const inst=addFreeformInstrument(layer),note=addFreeformNote(inst,{
  pitch:65,start:15,duration:25,velocity:.9
 });
 note.cutoffAutomation=createFreeformNoteCutoff(note,inst.sounds[0].patch);
 layer.version=2;upgradeSongFeatures(song);
 const original=nativePlans(renderEvents(song)).filter(p=>p.expression.pitch===65);
 const beat=createBeatFromFreeformSelection(song,track.id,0,48);
 assert.equal(beat.version,27);
 assert.deepEqual(validateBeat(beat),[]);
 const extracted=nativePlans(renderEvents(beat)).filter(p=>p.expression.pitch===65);
 assert.deepEqual(extracted.map(p=>({
  start:p.start,duration:p.duration,automation:p.automation?.points
 })),original.map(p=>({
  start:p.start,duration:p.duration,automation:p.automation?.points
 })));
});

test("desktop freeform editor uses shared interactive two-axis automation instead of knob-only changes",()=>{
 const ui=readFileSync(new URL("../freeformUI.js",import.meta.url),"utf8");
 assert.match(ui,/createFreeformNoteCutoff\(current,patch\)/);
 assert.match(ui,/illustrateSoundPanel\(visualDetails,"automation"/);
 assert.match(ui,/editFreeformNoteCutoff\(current\.cutoffAutomation,path,value\)/);
 assert.match(ui,/remove cutoff movement/);
});
