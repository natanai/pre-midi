import {vocalDisplayPatch,vocalChangesFromControl,vocalEventFromPatch} from '../vocalAudioView.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {defaultReverb,validateReverb,effectiveReverb,reverbTailSeconds,ReverbKernel} from '../src/dsp/reverb.js';
import {makePatch,validatePatch} from '../synth.js';import {create,upgradeBeatFeatures,parse} from '../schema.js';
import {processingFromPatch,applyProcessingToPatch} from '../recordedAudio.js';
import {withProcessorBypass} from '../src/dsp/processing-chain.js';import {createSong} from '../songModel.js';import {nativeSongEffectsRecipes} from '../src/hosts/native/song-stream-page.js';
test('room settings survive current project and source reuse; bypass retains the authored room',()=>{
 const doc=create(),patch=doc.instruments[0].sounds[0].patch;patch.reverb={...defaultReverb(),mix:.4,decay:2};
 assert.deepEqual(validatePatch(patch),[]);upgradeBeatFeatures(doc);assert.deepEqual(parse(JSON.stringify(doc)),doc);
 const fx=processingFromPatch(patch),other=makePatch('touch-keys');applyProcessingToPatch(other,fx);assert.deepEqual(other.reverb,patch.reverb);
 patch.chain=withProcessorBypass(patch,'reverb',true);assert.equal(effectiveReverb(patch).mix,0);assert.equal(patch.reverb.mix,.4);
 for(const [key,value]of [['mix',2],['preDelay',-.1],['decay',0],['width',NaN]])assert.ok(validateReverb({...defaultReverb(),[key]:value}).length);
 const song=createSong(doc);assert.ok(nativeSongEffectsRecipes(song).length===0||nativeSongEffectsRecipes(song).every(r=>r.reverb.mix===0));
 patch.chain=withProcessorBypass(patch,'reverb',false);assert.equal(effectiveReverb(patch).mix,.4);
});
test('room impulse begins after pre-delay, has a finite bounded tail and controllable stereo width',()=>{
 for(const rate of [8000,48000]){
  const recipe={...defaultReverb(),mix:1,preDelay:.03,decay:.3,damping:.9,size:.8},room=new ReverbKernel(recipe,rate);
  const first=Math.round(recipe.preDelay*rate)+Math.round(1422*(.5+recipe.size)*rate/44100);
  let peak=0,late=0,stereo=false;
  for(let i=0;i<Math.ceil((reverbTailSeconds(recipe)+.1)*rate);i++){
   room.tick(i===0?1:0,i===0?1:0);const level=Math.max(Math.abs(room.left),Math.abs(room.right));
   if(i<first)assert.equal(level,0);if(i===first)assert.ok(level>0);
   if(i>rate*.2&&room.left!==room.right)stereo=true;
   peak=Math.max(peak,level);if(i>reverbTailSeconds(recipe)*rate)late=Math.max(late,level);
   assert.ok(Number.isFinite(level));
  }
  assert.ok(peak>0&&peak<1);assert.ok(late<1e-5);assert.ok(stereo);
  const mono=new ReverbKernel({...recipe,width:0},rate);
  for(let i=0;i<rate/2;i++){mono.tick(i===0?1:0,0);assert.equal(mono.left,mono.right);}
 }
});

test('vocal Inspector edits and preview keep the complete authored room without mutating the recording',()=>{
 const recording={id:'r',durationSeconds:1,trimSeconds:0},clip={id:'c',gain:1,lengthSteps:8,effects:{}},display=vocalDisplayPatch(clip,recording);
 const change=vocalChangesFromControl(display,['reverb','mix'],.6);assert.equal(change.reverb.mix,.6);assert.deepEqual(validateReverb(change.reverb),[]);assert.deepEqual(clip.effects,{});
 const event=vocalEventFromPatch({...display,reverb:change.reverb},{vocal:{clip,recording}});assert.deepEqual(event.clip.effects.reverb,change.reverb);
});
