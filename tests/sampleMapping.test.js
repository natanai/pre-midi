import test from 'node:test';import assert from 'node:assert/strict';
import {sampleForNote,usedSampleIds} from '../sampler.js';import {sampleZoneWithRange,validateSampleRange} from '../src/dsp/sample-mapping.js';import {nativePlans,nativeRequiredAssets} from '../src/hosts/native/session.js';import {create,upgradeBeatFeatures,parse} from '../schema.js';import {validatePatch} from '../synth.js';
const soft={assetId:'soft',root:60,keyLow:48,keyHigh:72,velocityLow:0,velocityHigh:.49,velocity:.3},hard={assetId:'hard',root:60,keyLow:48,keyHigh:72,velocityLow:.5,velocityHigh:1,velocity:.8};
const patch={type:'sample',presetId:'custom',zones:[soft,hard],followPitch:true,oneShot:false,transpose:0,gain:1,attack:0,release:.1,pan:0};
test('key/velocity regions select mapped recordings and leave authored gaps silent in native plans',()=>{
 assert.deepEqual(validatePatch(patch),[]);assert.equal(sampleForNote(patch,60,.2),soft);assert.equal(sampleForNote(patch,60,.8),hard);assert.equal(sampleForNote(patch,47,.8),null);assert.equal(sampleForNote(patch,60,.495),null);
 const event={kind:'note',instrument:{patch,volume:1},note:{pitch:47,velocity:.8},at:0,duration:1};assert.deepEqual([...nativeRequiredAssets([event])],[]);assert.deepEqual(nativePlans([event]),[]);
 assert.equal(sampleForNote({...patch,transpose:12},47,.8),null,'key range follows the played note, independently of transpose');
});
test('range edits retain loop, crop and source identities and reject malformed or inverted bounds',()=>{
 const zone={...soft,startSeconds:1,durationSeconds:2,loop:{start:1.2,end:2,crossfade:.1}},next=sampleZoneWithRange(zone,{keyLow:40});assert.equal(next.assetId,'soft');assert.deepEqual(next.loop,zone.loop);assert.equal(next.startSeconds,1);assert.equal(zone.keyLow,48);
 for(const fields of [{keyLow:80},{keyHigh:40},{velocityLow:.8},{velocityHigh:-1},{keyLow:12.1},{keyHigh:128},{velocityLow:NaN},{assetId:'oops'}])assert.throws(()=>sampleZoneWithRange(zone,fields));
 assert.equal(validateSampleRange({}),null);assert.ok(validatePatch({...patch,zones:[{...soft,unsupportedLayerGain:2}]}).length,'unimplemented source fields cannot silently pass validation');
});
test('current Beat round trip and required-asset selection preserve key and velocity regions',()=>{
 const beat=create(),inst=beat.instruments[0];inst.sounds[0].patch=structuredClone(patch);inst.chunks[0].notes=[{id:'soft-note',pitch:60,start:0,duration:4,velocity:.2},{id:'gap-note',pitch:40,start:4,duration:4,velocity:.8}];beat.samples=['soft','hard'].map(id=>({id,name:id,mime:'audio/wav',path:'assets/'+id+'.wav',source:'test'}));upgradeBeatFeatures(beat);assert.deepEqual(parse(JSON.stringify(beat)),beat);assert.deepEqual([...usedSampleIds(beat)],['soft']);
});
