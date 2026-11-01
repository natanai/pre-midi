import test from "node:test";
import assert from "node:assert/strict";
import {nextRackPreview,resetRackPreview} from "../rackPreview.js";
import {DRUM_RACKS} from "../drumRacks.js";
import {EXAMPLE_SOUND_PRESETS,EXAMPLES} from "../examples.js";
import {PRESETS} from "../synth.js";
import {SAMPLE_LIBRARY} from "../samples.js";

test("rack preview visits every row once in order then wraps, independently per rack",()=>{
 const positions=new Map();
 const room=DRUM_RACKS.find(p=>p.id==="room-drum-rack");
 const night=DRUM_RACKS.find(p=>p.id==="night-drive-drum-rack");
 const played=Array.from({length:room.sounds.length+1},
  ()=>nextRackPreview(positions,"preset:"+room.id,room.sounds));
 assert.deepEqual(played.slice(0,-1).map(p=>p.sound.id),room.sounds.map(s=>s.id));
 assert.equal(played.at(-1).sound.id,room.sounds[0].id);
 assert.equal(played.at(-1).index,0);
 assert.equal(nextRackPreview(positions,"preset:"+night.id,night.sounds).index,0);
 assert.equal(nextRackPreview(positions,"instrument:other",room.sounds).index,0);
 resetRackPreview(positions,"preset:"+room.id);
 assert.equal(nextRackPreview(positions,"preset:"+room.id,room.sounds).index,0);
 assert.throws(()=>nextRackPreview(positions,"empty",[]),/empty rack/);
});

test("example-derived sound recipes live in matching categories without duplicate examples tab",()=>{
 const categories=new Set([...PRESETS,...SAMPLE_LIBRARY].map(p=>p.category));
 const ids=new Set();
 for(const preset of EXAMPLE_SOUND_PRESETS){
  assert.notEqual(preset.category,"Examples",preset.id);
  assert.ok(categories.has(preset.category),preset.id+" is uncategorized");
  assert.ok(!ids.has(preset.id),preset.id+" duplicated");
  ids.add(preset.id);
  assert.ok(preset.sounds?.length || preset.patch,preset.id+" missing sound definition");
  if(preset.sounds)assert.equal(preset.category,"Drums");
 }
 assert.ok(EXAMPLES.length>0,"full beat examples remain available separately");
 const rack=EXAMPLE_SOUND_PRESETS.find(p=>p.id==="example-neon-after-hours-0");
 assert.equal(rack.category,"Drums");
 const bass=EXAMPLE_SOUND_PRESETS.find(p=>p.id==="example-neon-after-hours-1");
 assert.equal(bass.category,"Bass");
});
