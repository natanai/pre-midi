import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveModulation,sourceValueAt,validateModulation} from '../src/dsp/modulation.js';
import {cutoffAt,planCutoffAutomation,automationValueAt,validateCutoffAutomation,validateAutomationPlan,insertCutoffPoint,removeCutoffPoint,MAX_AUTOMATION_POINTS} from '../src/dsp/automation.js';
import {planNativeSample,planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {planSynthVoice} from '../src/dsp/synth-voice.js';
import {makePatch} from '../synth.js';
import {editFreeformNoteCutoff} from '../freeformNoteAutomation.js';
import {create,parse,upgradeBeatFeatures} from '../schema.js';
import {createSong} from '../songModel.js';
import {parseSong} from '../songIO.js';
const modulation={version:1,routes:[{id:'tempo',source:{kind:'lfo',shape:'triangle',rate:7,sync:4},target:'amplitude',unit:'linear_gain',depth:.5,polarity:'bipolar',smoothing:.005}]};
const lane=()=>({version:1,target:'filter.cutoff',unit:'hz',interpolation:'exponential',points:[{id:'a',step:0,value:400},{id:'b',step:16,value:6400},{id:'c',step:32,value:100},{id:'d',step:48,value:1600}]});
test('tempo divisions resolve identically for synth, sample and vocal without changing authored Hz',()=>{
 const snapshot=JSON.stringify(modulation),assets=new Map([['voice',{id:1,duration:4,normalization:1}]]);
 for(const bpm of [40,120,240]){
  const unit=60/bpm/4,patch={type:'sample',presetId:'custom',zones:[{assetId:'voice',root:60}],followPitch:false,oneShot:true,transpose:0,gain:1,attack:0,release:0,pan:0,modulation};
  const synth=makePatch();synth.version=2;synth.modulation=modulation;
  const plans=[planNativeSample({patch,volume:1},{pitch:60,velocity:1},0,1,assets,{unit}),planNativeVocal({recording:{id:'voice',durationSeconds:4,trimSeconds:0},clip:{lengthSteps:32,gain:1,effects:{modulation}}},0,unit,assets),planSynthVoice({patch:synth,volume:1},{pitch:60,velocity:1},0,1,{unit})];
  for(const plan of plans){assert.equal(plan.modulation.routes[0].source.rate,bpm/240);assert.equal(plan.modulation.routes[0].source.sync,undefined);}
  assert.equal(sourceValueAt(modulation.routes[0].source,{elapsed:unit*8,unit}).value,1,'Half a bar reaches the triangle peak at every tempo');
 }
 assert.equal(JSON.stringify(modulation),snapshot);assert.deepEqual(validateModulation(modulation),[]);
 const bad=structuredClone(modulation);bad.routes[0].source.sync=3;assert.throws(()=>resolveModulation(bad),/division/);
 const slow=structuredClone(modulation);slow.routes[0].source.sync=16;assert.deepEqual(validateModulation(resolveModulation(slow,.375)),[]);
});
test('multipoint curves interpolate every segment and preserve seek and tail-hold boundaries',()=>{
 const block=lane();assert.deepEqual(validateCutoffAutomation(block,null,4),[]);
 for(const [step,expected] of [[8,1600],[24,800],[40,400],[100,1600]])assert.equal(cutoffAt(block,step),expected);
 const plan=planCutoffAutomation(block,{start:5,end:12,step:12,unit:.125,limitStep:40});
 assert.deepEqual(validateAutomationPlan(plan),[]);
 for(const t of [5,5.5,6,7,8,10,12])assert.ok(Math.abs(automationValueAt(plan,t)-cutoffAt(block,Math.min(40,12+(t-5)/.125)))<1e-8);
 const captured={version:1,block,step:12,limitStep:40};
 const edited=editFreeformNoteCutoff(captured,[['points',2,'step'],['points',2,'value']],[100,900]);
 assert.equal(edited.block.points[2].step,47);assert.equal(edited.block.points[2].value,900);assert.equal(edited.step,12);assert.equal(edited.limitStep,40);
 assert.equal(captured.block.points[2].step,32);
});
test('point insertion preserves the curve and stable IDs, deletion and limits stay bounded',()=>{
 const original=lane(),more=insertCutoffPoint(original,'new');
 assert.equal(original.points.length,4);assert.equal(more.points.length,5);
 for(let step=0;step<=48;step++)assert.ok(Math.abs(cutoffAt(more,step)-cutoffAt(original,step))<1e-8);
 assert.deepEqual(removeCutoffPoint(more,'new'),original);
 let full=original;for(let i=0;i<50;i++)full=insertCutoffPoint(full,'point'+i);
 assert.equal(full.points.length,MAX_AUTOMATION_POINTS);assert.equal(insertCutoffPoint(full),full);
 assert.deepEqual(validateCutoffAutomation(full,null,4),[]);
 const plan=planCutoffAutomation(full,{start:0,end:8,step:0,unit:.125,limitStep:48});assert.deepEqual(validateAutomationPlan(plan),[]);
 const beat=create();beat.instruments[0].sounds[0].patch.version=2;beat.instruments[0].sounds[0].patch.modulation=structuredClone(modulation);beat.instruments[0].automation=full;upgradeBeatFeatures(beat);
 assert.deepEqual(parse(JSON.stringify(beat)),beat);
 const song=createSong(beat);assert.deepEqual(parseSong(JSON.stringify(song)),song);
});
