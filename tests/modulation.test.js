import test from "node:test";
import assert from "node:assert/strict";
import {validateModulation,routeValueAt,combineParameter,smoothingAlpha} from "../src/dsp/modulation.js";
import {makePatch,validatePatch} from "../synth.js";
import {create,parse,upgradeBeatFeatures} from "../schema.js";
import {createSong,validateSong,upgradeSongFeatures} from "../songModel.js";
import {exportProject,importProject} from "../packageIO.js";
import {exportSongProject,importSongProject} from "../songIO.js";
const route={id:"test",source:{kind:"velocity"},target:"filter.cutoff",unit:"octaves",depth:2,polarity:"unipolar",smoothing:.005};
test("modulation has bounded explicit source, target, polarity, depth and unit contracts",()=>{
 assert.deepEqual(validateModulation({version:1,routes:[route]}),[]);
 for(const patch of [{unit:"hz"},{target:"not-a-parameter"},{depth:999},{polarity:"random"},{smoothing:NaN},{source:{kind:"lfo",rate:0,shape:"sine"}}])
  assert.ok(validateModulation({version:1,routes:[{...route,...patch}]}).length);
 assert.ok(validateModulation({version:99,routes:[]}).length);
 assert.ok(validateModulation({version:1,routes:[route,route]}).length);
 assert.equal(routeValueAt(route,{elapsed:1,gate:2,velocity:.5,pitch:60}),1);
 assert.equal(combineParameter("filter.cutoff",1000,1),2000);
 assert.equal(combineParameter("oscillators.0.level",.8,.8),1);
 assert.ok(smoothingAlpha(.005,48000)>0&&smoothingAlpha(.005,48000)<1);
});
test("v7/v8 files remain readable and unchanged; modulated native files explicitly use v9/v10",async()=>{
 const old=create();assert.equal(parse(JSON.stringify(old)).version,7);assert.equal(createSong(old).version,8);
 const modern=create();modern.instruments[0].sounds[0].patch=makePatch("touch-keys");
 assert.throws(()=>parse(JSON.stringify(modern)),/v9/);
 upgradeBeatFeatures(modern);assert.equal(modern.version,9);assert.deepEqual(validatePatch(modern.instruments[0].sounds[0].patch),[]);
 const exported=exportProject(modern),file=Object.assign(exported.blob,{name:exported.name});
 const restored=await importProject(file);assert.deepEqual(restored,modern);
 const song=createSong(modern);assert.equal(song.version,10);assert.deepEqual(validateSong(song),[]);
 song.version=8;assert.ok(validateSong(song).some(error=>error.includes("v10")));upgradeSongFeatures(song);
 const output=exportSongProject(song);assert.deepEqual(await importSongProject(Object.assign(output.blob,{name:output.name})),song);
 assert.ok(validatePatch({...makePatch(),version:99}).length);
 assert.ok(validatePatch({...makePatch(),modulation:{version:1,routes:[route]}}).length);
});
