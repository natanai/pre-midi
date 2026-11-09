import test from 'node:test';import assert from 'node:assert/strict';
import {create,parse,upgradeBeatFeatures} from '../schema.js';import {createSong} from '../songModel.js';import {parseSong} from '../songIO.js';import {renderEvents} from '../audio.js';import {nativePlans} from '../src/hosts/native/session.js';
import {automationParameters,validateAutomation,laneValueAt,insertAutomationPoint,planParameterAutomation} from '../src/dsp/automation.js';
import {withInstance} from '../src/dsp/processing-graph.js';import {withProcessorRemoved} from '../src/dsp/processing-chain.js';import {unpackBeatClip,moveFreeformPassage} from '../freeformModel.js';
const lane=(target,unit,values,interpolation='linear')=>({id:target,version:1,target,unit,interpolation,points:values.map(([step,value],i)=>({id:String(i),step,value}))});
test('parameter authority controls lane targets, source support, units, bounds and interpolation',()=>{
 const patch=create().instruments[0].sounds[0].patch,pan=lane('pan','pan',[[0,-1],[16,1]]);
 assert.deepEqual(validateAutomation([pan],patch,1),[]);assert.equal(laneValueAt(pan,4),-.5);
 assert.ok(validateAutomation(pan,patch,1).length);assert.ok(validateAutomation([pan,pan],patch,1).length);
 assert.ok(validateAutomation([{...pan,unit:'hz'}],patch,1).length);assert.ok(validateAutomation([{...pan,interpolation:'exponential'}],patch,1).length);
 assert.ok(validateAutomation([lane('noise','linear_gain',[[0,0],[16,1]])],{type:'vocal'},1).length);
 assert.ok(validateAutomation([lane('filter.cutoff','hz',[[0,1],[16,100]])],patch,1).length);
 const p=automationParameters(patch);assert.equal(new Set(p.map(p=>p.automationIndex)).size,p.length);
 const full=p.slice(0,8).map(p=>lane(p.id,p.unit,[[0,p.default],[16,p.default]],p.interpolation));assert.deepEqual(validateAutomation(full,patch,1),[]);assert.ok(validateAutomation([...full,lane(p[8].id,p[8].unit,[[0,p[8].default],[16,p[8].default]])],patch,1).length);
 const more=insertAutomationPoint(pan,'middle');for(let i=0;i<=16;i++)assert.equal(laneValueAt(more,i),laneValueAt(pan,i));
});
test('Sound lanes and Instrument overrides survive Beat/Song recall and full Freeform source-phase capture',()=>{
 const beat=create(),inst=beat.instruments[0],patch=inst.sounds[0].patch;patch.automation=[lane('pan','pan',[[0,-1],[128,1]]),lane('amplitude','linear_gain',[[0,.3],[128,1.5]])];
 inst.automation=[lane('pan','pan',[[0,.4],[128,-.6]])];upgradeBeatFeatures(beat);
 assert.deepEqual(parse(JSON.stringify(beat)),beat);const song=createSong(beat);assert.deepEqual(parseSong(JSON.stringify(song)),song);
 const signature=()=>nativePlans(renderEvents(song)).map(plan=>({start:plan.start,lanes:plan.parameterAutomation}));const before=signature();
 const passage=unpackBeatClip(song,song.tracks[0].clips[0].id);assert.deepEqual(signature(),before);
 const layer=song.tracks[0].freeform;moveFreeformPassage(layer,passage.id,passage.startStep+16);
 const shifted=signature();assert.equal(shifted.length,before.length);
 for(let i=0;i<before.length;i++)assert.deepEqual(shifted[i].lanes.map(lane=>lane.points.map(p=>p.value)),before[i].lanes.map(lane=>lane.points.map(p=>p.value)));
});
test('removing an automated processor retains its parameters and lane for non-destructive restoration',()=>{
 const patch=create().instruments[0].sounds[0].patch;patch.chain=withInstance(patch,'filter');const lanes=[lane('processor.filter-1.cutoff','hz',[[0,300],[16,3000]],'exponential')],clock={start:0,end:1,step:0,unit:.125,limitStep:16};
 assert.equal(planParameterAutomation(lanes,patch,clock).length,1);patch.chain=withProcessorRemoved(patch,'filter-1');assert.deepEqual(validateAutomation(lanes,patch,1),[]);assert.equal(planParameterAutomation(lanes,patch,clock).length,0);patch.chain.order.push('filter-1');assert.equal(planParameterAutomation(lanes,patch,clock).length,1);
});
