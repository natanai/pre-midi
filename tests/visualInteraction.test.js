import test from "node:test";
import assert from "node:assert/strict";
import {diagram,soundPathsRelated} from "../soundIllustrations.js";
import {scopeWaveformData} from "../soundScope.js";
import {makePatch} from "../synth.js";

test("nested patch keys link to the same visual concept without matching unrelated controls",()=>{
 assert.ok(soundPathsRelated(["oscillators",1],["oscillators",1,"wave"]));
 assert.ok(soundPathsRelated(["filter","cutoff"],["filter"]));
 assert.ok(soundPathsRelated(["zones"],["zones",3,"root"]));
 assert.ok(!soundPathsRelated(["oscillators",0],["oscillators",1]));
 assert.ok(!soundPathsRelated(["effects","delayMix"],["effects","drive"]));
 assert.ok(!soundPathsRelated([],["filter"]));
 assert.ok(!soundPathsRelated(["filter"],[]));
});

test("two active oscillators display their combined shape as well as separate source traces",()=>{
 const patch=makePatch("init");
 patch.oscillators[1].level=.4;
 const first=diagram(patch,"oscillators");
 const mix=first.paths.filter(path=>path.role==="mix");
 assert.equal(mix.length,1);
 assert.deepEqual(mix[0].affects,[["oscillators"]]);
 assert.equal(first.handles.length,2);
 const changed=structuredClone(patch);
 changed.oscillators[1].wave=changed.oscillators[1].wave==="square"?"triangle":"square";
 assert.notEqual(diagram(changed,"oscillators").paths.find(p=>p.role==="mix").d,mix[0].d);
 patch.oscillators[1].level=0;
 assert.equal(diagram(patch,"oscillators").paths.filter(path=>path.role==="mix").length,0);
});

test("each important diagram stroke advertises the parameter family it actually depicts",()=>{
 const patch=makePatch("init");
 const cases=[
  ["filter",["filter","cutoff"]],
  ["envelope",["envelope","release"]],
  ["movement",["movement","rate"]],
  ["distortion",["effects","drive"]],
  ["delay",["effects","delayTime"]]
 ];
 for(const [kind,path] of cases){
  assert.ok(diagram(patch,kind).paths.some(line=>line.affects?.some(p=>soundPathsRelated(p,path))),
   kind+" has no visual target for "+path.join("."));
 }
});

test("selected real waveform instant stays deterministic and can move beyond the first held second",()=>{
 const sampleRate=44100,length=sampleRate*3;
 const data=new Float32Array(length);
 for(let i=0;i<length;i++){
  const time=i/sampleRate,freq=time<1.4?220:440;
  data[i]=.35*Math.sin(2*Math.PI*freq*time);
 }
 const audio={sampleRate,length,numberOfChannels:1,getChannelData:()=>data};
 const early=scopeWaveformData(audio,60,620,.4);
 const late=scopeWaveformData(audio,60,620,2);
 assert.ok(early.startSeconds>=.399&&early.startSeconds<.402);
 assert.ok(late.startSeconds>=1.999&&late.startSeconds<2.002);
 assert.notDeepEqual(early.channels[0],late.channels[0]);
 assert.deepEqual(scopeWaveformData(audio,60,620,.4).channels[0],early.channels[0]);
 const final=scopeWaveformData(audio,60,620,20);
 assert.ok(final.startSeconds+final.windowSeconds<=audio.length/audio.sampleRate+.001);
});
