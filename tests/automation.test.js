import test from 'node:test';import assert from 'node:assert/strict';
import {create,parse,upgradeBeatFeatures,validate} from '../schema.js';import {createSong,validateSong} from '../songModel.js';import {exportProject,importProject} from '../packageIO.js';import {exportSongProject,importSongProject} from '../songIO.js';
import {cutoffAt,planCutoffAutomation,automationValueAt,validateCutoffAutomation,noteCutoffAutomation,validateCapturedCutoffAutomation} from '../src/dsp/automation.js';import {planSynthVoice} from '../src/dsp/synth-voice.js';import {cleanPatch} from './audio-quality/fixtures.js';import {prepareNativePlan} from '../native/bridge.mjs';
const lane=()=>({version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',points:[{id:'begin',step:0,value:400},{id:'end',step:32,value:6400}]});
test('automation keeps musical positions, geometric interpolation, seek state and clip-tail hold',()=>{
 const block=lane();assert.equal(cutoffAt(block,16,999),1600);assert.equal(cutoffAt(block,-1,999),400);assert.equal(cutoffAt(block,40,999),6400);
 const plan=planCutoffAutomation(block,{start:3,end:6,step:16,unit:.125,limitStep:24});assert.equal(plan.points[0].value,1600);assert.equal(automationValueAt(plan,3.5,0),1600*2**.5);assert.equal(automationValueAt(plan,5,0),3200);
 assert.equal(plan.points.at(-1).value,3200);assert.deepEqual(plan.points.map(x=>x.order),plan.points.map((_,i)=>i));
 const bad=lane();bad.points[1].step=0;assert.ok(validateCutoffAutomation(bad,null,8).length);
});
test('automation has explicit Beat v11 / Song v12 persistence and keeps all older formats readable',async()=>{
 const beat=create();beat.instruments[0].sounds[0].patch=cleanPatch();beat.instruments[0].automation=lane();assert.ok(validate(beat).some(x=>x.includes('v11')));upgradeBeatFeatures(beat);assert.equal(beat.version,11);assert.deepEqual(validate(beat),[]);
 const out=exportProject(beat),copy=await importProject(Object.assign(out.blob,{name:out.name}));assert.deepEqual(copy,beat);assert.deepEqual(parse(JSON.stringify(beat)),beat);
 const song=createSong(beat);assert.equal(song.version,12);assert.deepEqual(validateSong(song),[]);const s=exportSongProject(song);assert.deepEqual(await importSongProject(Object.assign(s.blob,{name:s.name})),song);
 song.version=10;assert.ok(validateSong(song).some(x=>x.includes('v12')));for(const version of [7,9]){const old=create();old.version=version;assert.equal(parse(JSON.stringify(old)).version,version);}
 const a=beat.instruments[0].automation;delete beat.instruments[0].automation;upgradeBeatFeatures(beat);assert.equal(beat.version,11);beat.instruments[0].automation=a;
});
test('voice plan v3 carries sample-timed cutoff events using the same native contract',()=>{
 const patch=cleanPatch(),plan=planSynthVoice({patch,volume:.4},{pitch:60,velocity:.8},.01,.3,{automation:lane(),timeline:{step:8,unit:.125,limitStep:32}});assert.equal(plan.version,3);assert.equal(plan.modulation.routes.length,0);assert.equal(plan.automation.points[0].value,800);assert.ok(prepareNativePlan(plan,48000,48000).length>0);assert.throws(()=>prepareNativePlan({...plan,version:2},48000,48000),/requires synth voice contract v3/);
 assert.throws(()=>planSynthVoice({patch,volume:.4},{pitch:60,velocity:.8},0,.3,{automation:lane()}),/timeline/);
});

test('captured cutoff movement is a per-note source-phase override',()=>{
 const block=lane(),captured={version:1,block,step:12,limitStep:24};
 assert.deepEqual(validateCapturedCutoffAutomation(captured),[]);
 const source={automation:lane()},note={cutoffAutomation:captured};
 const selected=noteCutoffAutomation(source,note,{step:99,unit:.125,limitStep:100});
 assert.equal(selected.automation,block);
 assert.equal(selected.timeline.step,12);
 assert.equal(selected.timeline.limitStep,24);
 assert.equal(selected.timeline.unit,.125);
 assert.equal(noteCutoffAutomation(source,{}, {step:99}).automation,source.automation);
 for(const bad of [{...captured,step:-1},{...captured,limitStep:12},
  {...captured,version:10},{...captured,other:true}])
  assert.ok(validateCapturedCutoffAutomation(bad).length);
});
