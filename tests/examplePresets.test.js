import test from "node:test";
import assert from "node:assert/strict";
import {EXAMPLES,EXAMPLE_SOUND_PRESETS,buildExample} from "../examples.js";
import {makeSampleAsset,sampleForNote} from "../sampler.js";
import {sampleAsset} from "../samples.js";
import {validatePatch} from "../synth.js";
import {create,makeInstrument,makeSound,clone,validate,parse} from "../schema.js";
import {resolveEvent} from "../soundModel.js";

const stubSample=id=>{
 const asset=sampleAsset(id);
 assert.ok(asset,"Missing library recording "+id);
 const bytes=new Uint8Array(48);
 bytes.set(new TextEncoder().encode(asset.mime==="audio/ogg"?"OggS":"RIFF"),0);
 if(asset.mime!=="audio/ogg")bytes.set(new TextEncoder().encode("WAVE"),8);
 return makeSampleAsset(id,id,asset.mime,bytes,asset.sourceUrl);
};
const withoutId=sound=>{const {id,...rest}=sound;return rest;};
test("every example instrument is a built-in preset with the same name and exact sound",async()=>{
 const expectedNames=[];
 for(const example of EXAMPLES){
  const score=await buildExample(example.id,async id=>stubSample(id));
  for(const [index,instrument] of score.instruments.entries()){
   const presetId="example-"+example.id+"-"+index;
   const preset=EXAMPLE_SOUND_PRESETS.find(p=>p.id===presetId);
   assert.ok(preset,"Missing "+presetId);
   assert.equal(preset.name,instrument.name);
   assert.equal(preset.volume,instrument.volume);
   assert.equal(preset.category,"Examples");
   assert.ok(preset.description.includes(example.name));
   expectedNames.push(preset.name);
   if(instrument.layout==="rack"){
    assert.equal(preset.layout,"rack");
    assert.equal(preset.sounds.length,instrument.sounds.length);
    assert.deepEqual(preset.sounds.map(withoutId),instrument.sounds.map(withoutId));
    for(const [rowIndex,sound] of instrument.sounds.entries()){
     const rowName=example.voices[index].rack[rowIndex].key;
     const individual=EXAMPLE_SOUND_PRESETS.find(p=>p.id===presetId+"-"+rowName);
     assert.ok(individual,"Missing individually selectable rack sound "+rowName);
     assert.equal(individual.name,sound.name);
     assert.equal(individual.trigger,"hit");
     assert.deepEqual(individual.patch,sound.patch);
     assert.equal(individual.referencePitch,sound.referencePitch);
     assert.equal(individual.gain,sound.gain);
     assert.equal(individual.volume,instrument.volume);
    }
   }else{
    const sound=instrument.sounds[0];
    assert.equal(preset.trigger,sound.trigger);
    assert.equal(preset.referencePitch,sound.referencePitch);
    assert.equal(preset.gain,sound.gain);
    assert.deepEqual(preset.patch,sound.patch);
   }
  }
 }
 assert.ok(expectedNames.length>=25,"The whole example library must be represented");
 assert.equal(EXAMPLE_SOUND_PRESETS.length,expectedNames.length+
  EXAMPLES.reduce((n,example)=>n+example.voices.reduce((n,voice)=>n+(voice.rack?.length||0),0),0));
 assert.equal(new Set(EXAMPLE_SOUND_PRESETS.map(p=>p.id)).size,EXAMPLE_SOUND_PRESETS.length);
});
test("example-derived synth and recording patches stay valid and standalone",()=>{
 for(const preset of EXAMPLE_SOUND_PRESETS){
  assert.ok(preset.name.length<=60);
  for(const sound of preset.sounds||[preset]){
   assert.deepEqual(validatePatch(sound.patch),[],preset.id);
   if(sound.patch.type==="sample"){
    assert.ok(sound.patch.zones.length,preset.id);
    for(const zone of sound.patch.zones)assert.ok(sampleAsset(zone.assetId),zone.assetId);
    const chosen=sampleForNote(sound.patch,sound.referencePitch,.8);
    assert.ok(chosen, "An example sample preset needs an audible reference note: "+preset.id);
   }
  }
 }
});
test("a copy of a built-in example rack can become a normal independently editable instrument",()=>{
 const original=EXAMPLE_SOUND_PRESETS.find(x=>x.id==="example-neon-after-hours-0");
 assert.ok(original?.sounds.length>=8);
 const score=create(),sound=makeSound(original.name,clone(original.sounds[0].patch),"hit");
 const instrument=makeInstrument(2,score.bars,sound);
 instrument.layout="rack";
 instrument.name=original.name;
 instrument.volume=original.volume;
 instrument.sounds=clone(original.sounds).map(entry=>({...entry,id:entry.id+"-copy"}));
 score.instruments=[instrument];
 score.samples=[...new Set(instrument.sounds.flatMap(s=>s.patch.type==="sample"?
  s.patch.zones.map(z=>z.assetId):[]))].map(id=>stubSample(id));
 assert.deepEqual(validate(score),[]);
 assert.deepEqual(parse(JSON.stringify(score)),score);
 assert.equal(instrument.sounds.length,original.sounds.length);
 assert.equal(instrument.volume,original.volume);
 instrument.chunks[0].notes.push({
  id:"test-event",soundId:instrument.sounds[0].id,start:0,duration:1,velocity:.9
 });
 const event=resolveEvent(instrument,instrument.chunks[0].notes[0]);
 assert.equal(event.voice.volume,original.volume*original.sounds[0].gain);
 instrument.sounds[0].patch.filter.cutoff=100;
 assert.notEqual(instrument.sounds[0].patch.filter.cutoff,original.sounds[0].patch.filter.cutoff);
 assert.deepEqual(validate(score),[]);
});
