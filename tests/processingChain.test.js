import {nativeSongEffectsRecipes} from '../src/hosts/native/song-stream-page.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProcessingChain,processingFlags,processingChain,withProcessorBypass,withProcessorAdded,withProcessorRemoved} from '../src/dsp/processing-chain.js';
import {makePatch,validatePatch} from '../synth.js';
import {validateVocalEffects} from '../vocalEffects.js';
import {processingFromPatch,applyProcessingToPatch} from '../recordedAudio.js';
import {vocalDisplayPatch,vocalEventFromPatch} from '../vocalAudioView.js';
import {create,parse,upgradeBeatFeatures} from '../schema.js';
import {createSong} from '../songModel.js';
import {parseSong} from '../songIO.js';
import {planNativeSample,planNativeVocal,encodeNativeSample} from '../src/hosts/native/sample-plan.js';
import {modeledToneWaveform} from '../toneIllustrationResponse.js';
import {diagram} from '../soundIllustrations.js';
const chain={version:1,order:['drive','filter'],bypass:['filter','delay']};
test('serial processor identity and bypass are strictly bounded',()=>{
 assert.deepEqual(validateProcessingChain(chain),[]);assert.equal(processingFlags({chain}),3);
 for(const bad of [{...chain,order:['filter','filter']},{...chain,order:['delay','filter']},{...chain,bypass:['drive','drive']},{...chain,bypass:['unknown']},{...chain,extra:1}])assert.ok(validateProcessingChain(bad).length);
 assert.equal(processingFlags({}),0);assert.deepEqual(processingChain({}).order,['filter','drive']);
 const patchState={chain:structuredClone(chain)},restored=withProcessorBypass(patchState,'filter',false);
 assert.deepEqual(restored.bypass,['delay']);assert.deepEqual(patchState.chain,chain);assert.notEqual(restored.order,patchState.chain.order);
 const patch=makePatch();patch.effects.drive=.7;patch.filter.cutoff=700;
 const standard=modeledToneWaveform(patch),reversed=modeledToneWaveform({...patch,chain:{version:1,order:['drive','filter'],bypass:[]}});
 assert.ok(standard.output.some((value,i)=>Math.abs(value-reversed.output[i])>.01));
 const bypassed={...patch,chain:{version:1,order:['filter','drive'],bypass:['drive']}};
 assert.ok(diagram(bypassed,'distortion').labels.some(label=>label.value==='bypassed'));
});
test('processing presets and vocal preview preserve order, authored values and bypass',()=>{
 const patch=makePatch();patch.chain=structuredClone(chain);patch.effects.drive=.6;patch.effects.delayMix=.4;const original=JSON.stringify(patch);
 const processing=processingFromPatch(patch);assert.deepEqual(processing.chain,chain);assert.equal(processing.drive,.6);assert.equal(processing.delayMix,.4);
 assert.deepEqual(validateVocalEffects(processing),[]);
 const other=makePatch();applyProcessingToPatch(other,processing);assert.deepEqual(other.chain,chain);assert.deepEqual(validatePatch(other),[]);assert.equal(JSON.stringify(patch),original);
 const clip={id:'c',gain:1,lengthSteps:8,effects:processing},recording={id:'r',durationSeconds:1,trimSeconds:0};
 const display=vocalDisplayPatch(clip,recording),event=vocalEventFromPatch(display,{vocal:{clip,recording}},1);
 assert.deepEqual(event.clip.effects.chain,chain);
 const filterOff=processingFromPatch({type:'sample',filter:null});assert.ok(filterOff.chain.bypass.includes('filter'));
 const synth=makePatch();applyProcessingToPatch(synth,filterOff);assert.ok(synth.chain.bypass.includes('filter'));
});
test('current projects and native plans retain chain identity without phantom delay tails',()=>{
 const beat=create();beat.instruments[0].sounds[0].patch.chain=structuredClone(chain);upgradeBeatFeatures(beat);
 assert.deepEqual(parse(JSON.stringify(beat)),beat);const song=createSong(beat);assert.deepEqual(parseSong(JSON.stringify(song)),song);assert.deepEqual(nativeSongEffectsRecipes(song),[],'Bypassed delay does not consume a streaming bus');
 const assets=new Map([['r',{id:1,duration:1,normalization:1}]]),effects={chain,drive:.5,delayMix:.6};
 const patch={type:'sample',presetId:'custom',zones:[{assetId:'r',root:60}],followPitch:false,oneShot:true,transpose:0,gain:1,attack:0,release:0,pan:0,...effects};
 const plans=[planNativeSample({patch,volume:1},{pitch:60,velocity:1},0,1,assets),planNativeVocal({recording:{id:'r',durationSeconds:1,trimSeconds:0},clip:{lengthSteps:8,gain:1,effects}},0,.125,assets)];
 for(const plan of plans){assert.equal(plan.delayMix,0);assert.equal(plan.tail,0);assert.equal(plan.drive,.5);assert.deepEqual(plan.chain,chain);const bytes=encodeNativeSample(plan,48000),view=new DataView(bytes.buffer);assert.equal(view.getUint32(12,true),21);assert.equal(view.getUint32(bytes.length-440,true),3);}
});

test('removing and restoring serial stages preserves settings and bounded identity',()=>{
 const patch=makePatch();patch.chain={version:1,order:['drive','filter'],bypass:['filter']};patch.effects.drive=.6;patch.filter.cutoff=713;
 const snapshot=JSON.stringify(patch),withoutFilter={...patch,chain:withProcessorRemoved(patch,'filter')};
 assert.deepEqual(withoutFilter.chain.order,['drive']);assert.equal(processingFlags(withoutFilter),3);assert.equal(withoutFilter.filter.cutoff,713);
 const empty={...withoutFilter,chain:withProcessorRemoved(withoutFilter,'drive')};
 assert.deepEqual(validatePatch(empty),[]);assert.equal(processingFlags(empty),6);assert.deepEqual(empty.chain.order,[]);
 const restored={...empty,chain:withProcessorAdded(empty,'filter')};assert.deepEqual(restored.chain.bypass,['filter']);
 restored.chain=withProcessorBypass(restored,'filter',false);assert.deepEqual(restored.chain.order,['filter']);assert.equal(processingFlags(restored),4);
 restored.chain=withProcessorAdded(restored,'drive');assert.equal(restored.effects.drive,.6);assert.equal(restored.filter.cutoff,713);
 assert.equal(withProcessorAdded(restored,'drive').order.length,2);assert.equal(JSON.stringify(patch),snapshot);
 const program=processingFromPatch(empty),target=makePatch();applyProcessingToPatch(target,program);assert.deepEqual(target.chain.order,[]);
 const beat=create();beat.instruments[0].sounds[0].patch=empty;upgradeBeatFeatures(beat);assert.deepEqual(parse(JSON.stringify(beat)),beat);
});
