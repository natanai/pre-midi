import test from "node:test";
import assert from "node:assert/strict";
import { create, makeChunk } from "../schema.js";
import { chunkIsPlaying, pianoScrubberX } from "../pianoPlayhead.js";
import { play } from "../audio.js";
import { readFileSync } from "node:fs";

test("scrubber follows only the selected instrument's audible chunk", () => {
 const score=create(),instrument=score.instruments[0],current=instrument.chunks[0];
 const unused=makeChunk("Silent alternative");
 instrument.chunks.push(unused);
 assert.equal(chunkIsPlaying(score,instrument.id,current.id,{bar:0,step:0}),true);
 assert.equal(chunkIsPlaying(score,instrument.id,unused.id,{bar:0,step:0}),false);
 assert.equal(chunkIsPlaying(score,instrument.id,current.id,{bar:4,step:0}),false);
 instrument.timeline[4]=current.id;
 assert.equal(chunkIsPlaying(score,instrument.id,current.id,{bar:4,step:0}),true);
 assert.equal(chunkIsPlaying(score,"missing",current.id,{bar:4,step:0}),false);
 assert.equal(chunkIsPlaying(score,instrument.id,current.id,null),false);
});
test("scrubber crosses exactly the note columns, excluding pitch labels",() => {
 const width=735;
 assert.equal(pianoScrubberX(0,width),63);
 assert.equal(pianoScrubberX(8,width),399);
 assert.equal(pianoScrubberX(16,width),735);
 assert.equal(pianoScrubberX(-8,width),63);
 assert.equal(pianoScrubberX(25,width),735);
});
test("audio-clock progress is continuous between sixteenth-note boundaries", async t => {
 const score=create();
 // A silent score allows us to check the transport without a browser or real audio.
 score.instruments[0].timeline.fill(null);
 const OriginalAudioContext=globalThis.AudioContext;
 const OriginalSetInterval=globalThis.setInterval;
 const OriginalClearInterval=globalThis.clearInterval;
 let context, tick, cleared=false;
 globalThis.AudioContext=class {
  currentTime=0;
  state="running";
  constructor(){context=this;}
  async resume(){}
  createGain(){return {gain:{
   value:0,
   cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}
  },connect(){},disconnect(){}};}
 };
 globalThis.setInterval=fn=>{tick=fn;return 42;};
 globalThis.clearInterval=()=>{cleared=true;};
 t.after(()=>{globalThis.AudioContext=OriginalAudioContext;globalThis.setInterval=OriginalSetInterval;globalThis.clearInterval=OriginalClearInterval;});
 const positions=[],progress=[];
 const session=await play(score,{
  loop:true,
  onPosition:(bar,step)=>positions.push([bar,step]),
  onProgress:(bar,step)=>progress.push([bar,step]),
 });
 assert.equal(progress.length,0,"no scrubber before the first audible step");
 context.currentTime=0.08;tick();
 context.currentTime=0.13;tick();
 assert.deepEqual(positions,[[0,0]]);
 assert.equal(progress.length,2);
 assert.ok(progress[1][1]>progress[0][1]);
 assert.ok(progress[1][1]>0 && progress[1][1]<1);
 session.stop();
 assert.equal(cleared,true);
});
test("note editing auditions only when transport is not playing",() => {
 const source=readFileSync(new URL("../studio.js",import.meta.url),"utf8");
 assert.match(source,/if\(modify\(\(\)=>\{editedChunk\.notes\.push\(created\);\}\)\)\{/);
 assert.match(source,/tapPianoKey\(pitch\);\s*if\(!playback&&!pendingPlay\)\s*void audition/);
 assert.match(source,/editingNoteEffects/);
 assert.match(source,/selectedNoteId=existing\.id/);
 assert.match(source,/editedChunk\.notes=editedChunk\.notes\.filter/);
 assert.match(source,/renderNoteExpression\(/);
 assert.match(source,/onProgress: \(bar, step\) =>/);
 assert.match(source,/pianoProgress = null;/);
 assert.match(source,/playhead\.setAttribute\("aria-hidden", "true"\)/);
});
