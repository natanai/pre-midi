import test from "node:test";
import assert from "node:assert/strict";
import {EXAMPLES,buildExample} from "../examples.js";
import {sampleAsset} from "../samples.js";
import {makeSampleAsset} from "../sampler.js";
test("examples present technical labels without genre narratives",async()=>{
 const expected=[
  ["neon-after-hours","Drum Rack and Bass"],
  ["porchlight","Sampled Guitar and Percussion"],
  ["floating-signals","Sustained Notes and Offsets"],
  ["broken-circuit","Synth Step Patterns"],
  ["swaying-wire","Sampled Guitar Pitch Movement"]
 ];
 assert.deepEqual(EXAMPLES.map(({id,name})=>[id,name]),expected);
 for(const example of EXAMPLES){
  assert.ok(example.description.length<=130);
  assert.ok(!/(haze|haunt|aching|neon|shimmer|nocturnal|retro-futur|cry|sigh|organic|cinematic)/i.test(
   example.name+" "+example.description+" "+example.tag));
  assert.ok(/(rack|synth|recorded|sampled|chord|pitch|note)/i.test(example.description));
  const doc=await buildExample(example.id,async assetId=>{
   const asset=sampleAsset(assetId);assert.ok(asset);
   const bytes=new Uint8Array(48);
   if(asset.mime==="audio/ogg")bytes.set(new TextEncoder().encode("OggS"),0);
   else{bytes.set(new TextEncoder().encode("RIFF"),0);bytes.set(new TextEncoder().encode("WAVE"),8);}
   return makeSampleAsset(assetId,assetId,asset.mime,bytes,asset.sourceUrl);
  });
  for(const inst of doc.instruments)
   assert.ok(inst.chunks.every((chunk,index)=>chunk.name==="Chunk "+(index+1)));
 }
});
