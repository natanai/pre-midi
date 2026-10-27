import test from "node:test";
import assert from "node:assert/strict";
import {validateModulation,routeValueAt,combineParameter,smoothingAlpha,sourceValueAt} from "../src/dsp/modulation.js";
import {makePatch,validatePatch} from "../synth.js";
import {modulationFixtures} from "./audio-quality/modulation-fixtures.js";
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

test("16-route sounds preserve full route identity through Beat and Song round trips",async()=>{
 const fixture=modulationFixtures().find(fixture=>fixture.id==="maximum-16"),beat=create();beat.instruments[0].sounds[0].patch=fixture.patch;upgradeBeatFeatures(beat);
 const out=exportProject(beat),copy=await importProject(Object.assign(out.blob,{name:out.name}));assert.deepEqual(copy,beat);
 const song=createSong(beat),songOut=exportSongProject(song);assert.deepEqual(await importSongProject(Object.assign(songOut.blob,{name:songOut.name})),song);
 assert.deepEqual(validateModulation(fixture.patch.modulation),[]);
 assert.ok(validateModulation({version:1,routes:[...fixture.routes,{...fixture.routes[0],id:"seventeen"}]}).length);
 assert.ok(validateModulation({version:1,routes:[{...route,source:{kind:"envelope",envelope:{attack:.1,decay:.1,sustain:.4,release:.2,unknown:1}}}]}).length);
});
test("source timing, signed ranges and destination bounds have analytical values",()=>{
 const note={elapsed:.125,gate:.2,pitch:36,velocity:.2};
 assert.ok(Math.abs(sourceValueAt({kind:"lfo",rate:2},note).value-1)<1e-12);
 assert.equal(sourceValueAt({kind:"keytrack",root:60,span:24},note).value,-1);
 assert.equal(routeValueAt({...route,depth:1,polarity:"bipolar"},note),-.6);
 assert.equal(combineParameter("pan",.8,10),1);assert.equal(combineParameter("oscillators.0.detune",17,5000),2417);assert.equal(combineParameter("filter.cutoff",1000,20),256000);
 const source={kind:"envelope",envelope:{attack:.1,decay:.1,sustain:.4,release:.2}};
 assert.ok(Math.abs(sourceValueAt(source,{...note,elapsed:.05}).value-.5)<1e-12);
 assert.ok(Math.abs(sourceValueAt(source,{...note,elapsed:.3}).value-.2000005)<1e-12);
 assert.equal(routeValueAt({...route,source},{...note,elapsed:-.1}),0);
 for(const rate of [44100,48000,96000])assert.ok(Math.abs((1-smoothingAlpha(.01,rate))**rate-Math.exp(-100))<1e-45);
});
