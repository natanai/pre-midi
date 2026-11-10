import {putAsset} from '../assetRegistry.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {makePatch} from '../synth.js';
import {auditionNative,cancelNativeTransport,prepareNativeAssets} from '../src/hosts/native/session.js';
import {create,parse,upgradeBeatFeatures} from '../schema.js';import {validatePatch} from '../synth.js';import {vocalDisplayPatch,vocalChangesFromControl,vocalEventFromPatch} from '../vocalAudioView.js';
import {sourceSettings,sourceRecipe,sourceKey,sourceRate,needsSourceProcessing,validateSourceProcessing,sampleSourceRequest} from '../src/dsp/source-processing.js';
import {vocalSourceRange} from '../vocalEffects.js';import {setSongTempo,trimVocalClip} from '../songModel.js';import {planNativeSample,planNativeVocal} from '../src/hosts/native/sample-plan.js';
import {prepareNativePlans} from '../src/hosts/native/session.js';
const settings={mode:'independent',time:1.5,formant:-2,preserveFormants:true,reverse:true};
test('source processing validates one portable recipe without rewriting original assets',()=>{
 assert.deepEqual(validateSourceProcessing(settings),[]);for(const bad of [{time:0},{mode:'other'},{formant:13},{reverse:1},{unknown:0}])assert.ok(validateSourceProcessing(bad).length);
 const recipe=sourceRecipe({transpose:12,sourceProcessing:settings},.4,2);assert.equal(recipe.semitones,12);assert.equal(sourceRate({transpose:12,sourceProcessing:settings}),1);assert.equal(sourceRate({transpose:12}),2);assert.equal(needsSourceProcessing(sourceRecipe({},0,2)),false);
 const beat=create(),patch=beat.instruments[0].sounds[0].patch;assert.equal(patch.type,'synth');assert.ok(validatePatch({...patch,sourceProcessing:settings}).length,'synthesis cannot acquire recording-only controls');
 assert.notEqual(sourceKey('a',recipe),sourceKey('a',{...recipe,reverse:false}));
});
test('vocal pitch/time, source crop, tempo changes and Inspector edits keep the same real-time mapping',()=>{
 const recording={id:'r',durationSeconds:4,trimSeconds:.5},clip={id:'c',recordingId:'r',startStep:0,lengthSteps:64,trimStartSeconds:.5,trimEndSeconds:1,effects:{transpose:12,sourceProcessing:settings}};
 const range=vocalSourceRange(recording,clip,.125);assert.equal(range.totalDuration,3);assert.equal(range.offset,1);const seek=vocalSourceRange(recording,clip,.125,4);assert.ok(Math.abs(seek.offset-(1+.5/1.5))<1e-9);
 const display=vocalDisplayPatch(clip,recording);assert.deepEqual(display.sourceProcessing,settings);assert.deepEqual(vocalChangesFromControl(display,['sourceProcessing','time'],2),{sourceProcessing:{...settings,time:2}});assert.deepEqual(vocalEventFromPatch(display,{vocal:{clip,recording}}).clip.effects.sourceProcessing,settings);
 const song={kind:'song',bpm:120,recordings:[recording],tracks:[{kind:'vocal',clips:[clip]}]};setSongTempo(song,60);assert.equal(clip.lengthSteps,12);trimVocalClip(song,'c',1,'end');assert.equal(clip.lengthSteps,12);
});
test('prepared source plans consume derived PCM while keeping source timing and normalization',()=>{
 const p={type:'sample',presetId:'custom',zones:[{assetId:'r',root:60,startSeconds:.2,durationSeconds:1}],followPitch:true,oneShot:true,transpose:0,gain:1,attack:0,release:0,pan:0,sourceProcessing:settings},note={pitch:72,velocity:1},request=sampleSourceRequest(p,note,p.zones[0],2),assets=new Map([['r',{id:1,duration:2,normalization:2}],[request.key,{id:2,duration:1.5,normalization:2}]]),plan=planNativeSample({patch:p,volume:1},note,0,1,assets);
 assert.equal(plan.asset,2);assert.equal(plan.playbackRate,1);assert.equal(plan.offset,0);assert.equal(plan.sourceLimit,1.5);assert.equal(plan.end,1.51);assert.deepEqual(validatePatch(p),[]);
 const beat=create();beat.samples=[{id:'r',name:'recording',mime:'audio/wav',path:'assets/r.wav',source:'recorded'}];beat.instruments[0].sounds[0].patch=p;upgradeBeatFeatures(beat);assert.deepEqual(parse(JSON.stringify(beat)),beat);
});
test('source preparation remains cancellable before native transport publication',async()=>{
 const previous=globalThis.__TAURI__;let release,entered;const wait=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);globalThis.__TAURI__={core:{invoke:async(_,{request})=>{assert.equal(request.action,'source');entered();await wait;return {id:9,frames:48000,rate:48000,normalization:1};}}};
 const patch={type:'sample',presetId:'custom',zones:[{assetId:'r',root:60}],followPitch:false,oneShot:true,transpose:12,gain:1,attack:0,release:0,pan:0,sourceProcessing:settings},event={kind:'note',instrument:{patch,volume:1},note:{pitch:60,velocity:1},at:0,duration:1};let current=true;
 try{const result=prepareNativePlans([event],new Map([['r',{id:71,duration:1,normalization:1}]]),.125,()=>current);await started;current=false;release();await assert.rejects(result,/cancelled/);}finally{globalThis.__TAURI__=previous;}
});

test('Stop cancels an audition whose owner reservation is still queued behind preparation',async()=>{
 const previous=globalThis.__TAURI__;let release,enter;const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>enter=resolve),calls=[];
 globalThis.__TAURI__={core:{invoke:async(_,{request})=>{calls.push(request.action);if(request.action==='status')return {sampleRate:48000,generation:1};if(request.action==='begin'){enter();await gate;return {owner:123};}if(request.action==='control')return {accepted:true};throw Error('Stale audition reached '+request.action);}}};
 try{const preview=auditionNative({patch:makePatch('sine-keys'),volume:1},[{pitch:60,velocity:1}]);await entered;await cancelNativeTransport();release();await assert.rejects(preview,/cancelled/);assert.deepEqual(calls,['status','begin','control']);}finally{release();globalThis.__TAURI__=previous;}
});

test('device and export-rate source caches coexist without re-registering identical audio',async()=>{
 const previous=globalThis.__TAURI__,calls=[];putAsset('rate-cache-test',new Uint8Array(16));globalThis.__TAURI__={core:{invoke:async(_,{request})=>{assert.equal(request.action,'asset');calls.push(request.rate);return {id:calls.length,rate:request.rate,frames:request.rate/10,normalization:1};}}};
 try{const ids=new Set(['rate-cache-test']);const first=await prepareNativeAssets(ids,{generation:444,sampleRate:48000});await prepareNativeAssets(ids,{generation:444,sampleRate:44100});const reused=await prepareNativeAssets(ids,{generation:444,sampleRate:48000});assert.deepEqual(calls,[48000,44100]);assert.equal(first.get('rate-cache-test').id,reused.get('rate-cache-test').id);}finally{globalThis.__TAURI__=previous;}
});
