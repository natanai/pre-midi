import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pianoRollRows,noteWindow,notesForPianoRow,noteAtPianoStep,noteStartingAtPianoStep} from "../editorPianoRoll.js";
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

test("Beat cells and freeform row blocks resolve the same pitched and Rack note identities",()=>{
 const notes=[
  {id:"a",pitch:60,start:4,duration:12},
  {id:"b",pitch:61,start:10,duration:3},
  {id:"c",soundId:"kick",start:4,duration:2},
  {id:"d",soundId:"hat",start:4,duration:1},
  {id:"e",pitch:60,start:6,duration:5}
 ];
 const pitched={pitch:60,soundId:null},rack={pitch:null,soundId:"kick"};
 assert.deepEqual(notesForPianoRow(notes,pitched).map(n=>n.id),["a","e"]);
 assert.deepEqual(notesForPianoRow(notes,rack).map(n=>n.id),["c"]);
 assert.equal(noteAtPianoStep(notes,pitched,4)?.id,"a");
 assert.equal(noteAtPianoStep(notes,pitched,10)?.id,"a");
 assert.equal(noteAtPianoStep(notes,pitched,16),null);
 assert.equal(noteAtPianoStep(notes,rack,5)?.id,"c");
 assert.equal(noteAtPianoStep(notes,rack,6),null);
 assert.equal(noteAtPianoStep(notes,pitched,-1),null);
});
test("Song-time resize and paint clipping retains absolute time for notes crossing a viewport",()=>{
 const from=16*10,steps=16*8,width=8;
 assert.deepEqual(noteWindow({start:from-24,duration:27},from,steps,width),{
  start:from,end:from+3,left:0,width:24,clippedStart:true,clippedEnd:false
 });
 assert.equal(noteWindow({start:from-24,duration:20},from,steps,width),null);
 assert.deepEqual(noteWindow({start:from+steps-1,duration:64},from,steps,width),{
  start:from+steps-1,end:from+steps,left:(steps-1)*width,width:8,
  clippedStart:false,clippedEnd:true
 });
});
test("Beat and Song-time editors share note membership while keeping their timing adapters",()=>{
 const beat=source("studio.js"),song=source("freeformUI.js");
 assert.match(beat,/noteAtPianoStep\(chunk\.notes,rowData,/);
 assert.match(song,/notesForPianoRow\(inst\.notes,rowData\)/);
 assert.match(song,/noteWindow\(\{\.\.\.note,duration:value\.duration\}/);
 assert.match(song,/noteWindow\(\{start:step,duration:length\}/);
});

test("Rack render shares row surfaces but triggers only on the onset cell",()=>{
 const rack={pitch:null,soundId:"snare"},notes=[
  {id:"s",soundId:"snare",start:7,duration:4},
  {id:"k",soundId:"kick",start:7,duration:1}
 ];
 assert.equal(noteAtPianoStep(notes,rack,9)?.id,"s",
  "Sustained Sound continues to occupy Song-time visual space");
 assert.equal(noteStartingAtPianoStep(notes,rack,7)?.id,"s");
 assert.equal(noteStartingAtPianoStep(notes,rack,8),null,
  "Rack grid must not display a second sample trigger on a sustain tail");
 const sourceText=source("studio.js");
 assert.match(sourceText,/for\(const rowData of pianoRollRows\(inst\)\)/);
 assert.match(sourceText,/noteStartingAtPianoStep\(chunk\.notes,rowData,step\)/);
 assert.match(sourceText,/createPianoNoteSurface\(\{className:"note rack-step"/);
 assert.match(sourceText,/applyPianoNoteState\(cell,\{/);
});
