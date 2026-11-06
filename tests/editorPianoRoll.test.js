import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pianoRollRows,noteWindow} from "../editorPianoRoll.js";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("the actual Beat and freeform note surfaces share one renderer",()=>{
 const beat=source("studio.js"),song=source("freeformUI.js");
 // Both hosts use the same actual pitch and Rack row DOM constructor.
 for(const host of [beat,song]){
  assert.match(host,/renderPianoRollRows\(inst,\{/);
  assert.match(host,/createPianoNoteSurface\(\{/);
  assert.match(host,/applyPianoNoteState\(/);
 }
 assert.match(beat,/mode:"beat",keyboard:showPianoKeys,low:36,high:83,noteLabel/);
 assert.match(song,/mode:"song",low:PITCH_MIN,high:PITCH_MAX,noteLabel:pitchName/);
 assert.match(song,/noteWindow\(note,viewStep\(\),VIEW_BARS\*BAR_STEPS,STEP_WIDTH\)/);
});

test("one row source retains pitched-note order and Rack Sound identities",()=>{
 const pitched={layout:"pitched",sounds:[{id:"s",name:"sine"}]};
 const pitchRows=pianoRollRows(pitched,{low:60,high:64,noteLabel:n=>"P"+n});
 assert.deepEqual(pitchRows.map(r=>r.pitch),[64,63,62,61,60]);
 assert.deepEqual(pitchRows.map(r=>r.label),["P64","P63","P62","P61","P60"]);
 assert.equal(pitchRows[0].sharp,false);
 assert.equal(pitchRows[1].sharp,true);
 const rack={layout:"rack",sounds:[{id:"kick",name:"Kick"},{id:"hat",name:"Hat"}]};
 assert.deepEqual(pianoRollRows(rack).map(r=>[r.pitch,r.soundId,r.label]),
  [[null,"kick","Kick"],[null,"hat","Hat"]]);
});

test("Song-time note projection retains actual absolute steps and long sustains",()=>{
 assert.deepEqual(noteWindow({start:32,duration:40},48,32,8),{
  start:48,end:72,left:0,width:192,clippedStart:true,clippedEnd:false
 });
 assert.deepEqual(noteWindow({start:40,duration:48},48,16,8),{
  start:48,end:64,left:0,width:128,clippedStart:true,clippedEnd:true
 });
 assert.deepEqual(noteWindow({start:63,duration:2},48,16,8),{
  start:63,end:64,left:120,width:8,clippedStart:false,clippedEnd:true
 });
 assert.equal(noteWindow({start:0,duration:4},48,16,8),null);
 assert.throws(()=>noteWindow({start:1,duration:1},-1,16,8),RangeError);
});
