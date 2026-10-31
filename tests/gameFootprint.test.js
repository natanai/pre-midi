import test from "node:test";
import assert from "node:assert/strict";
import {measureGameFootprint} from "../scripts/measure-game-footprint.mjs";

test("saved Beats and Songs remain small instruction documents with separate Asset references",async()=>{
 const report=await measureGameFootprint();
 const names=new Set(report.cases.map(c=>c.case));
 assert.equal(names.size,report.cases.length);
 for(const required of ["init-beat-v7","one-phrase-beat-v7","modulated-beat-v9",
  "automated-beat-v11","single-beat-song-v8","modulated-song-v10",
  "automated-song-v12","external-vocal-song-v14","layered-reused-beat-song-v8",
  "studio-example/floating-signals","studio-example/neon-after-hours"])
  assert.ok(names.has(required),required);
 for(const entry of report.cases){
  assert.ok(entry.instruction_bytes>0);
  assert.ok(entry.gzip_bytes_informational>0);
  assert.equal(entry.external_asset_bytes,null);
  assert.ok(entry.instruction_bytes<=(entry.kind==="song"?8_000_000:1_000_000),
   entry.case+" exceeds the actual exported .premidi schema byte limit");
 }
 assert.ok(report.cases.find(x=>x.case==="external-vocal-song-v14").song_vocal_clips>0);
 assert.ok(report.cases.find(x=>x.case==="studio-example/porchlight").distinct_external_asset_references>0);
 assert.ok(report.cases.find(x=>x.case==="layered-reused-beat-song-v8").song_beat_clips>=3);
 console.log("PREMIDI_GAME_FOOTPRINT "+JSON.stringify(report));
});
