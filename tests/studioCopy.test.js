import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {helpForLabel} from "../dial.js";
import {scopeAmplitudeAt} from "../soundScope.js";
import {PRIMARY_SYNTH_FIELDS} from "../instrumentUI.js";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("every current synth and sampler dial has concise label help",()=>{
 const synth=read("instrumentUI.js");
 const configured=[...synth.matchAll(/label:"([^"]+)"/g)].map(match=>match[1]);
 const sampler=[
  "filter type","cutoff","resonance","distortion","glide from","glide time",
  "vibrato","vibrato speed","vibrato waits","pulse","pulse speed",
  "bend shape","bend amount","wave speed","level","attack","release",
  "transpose","pan","strum"
 ];
 const shared=["volume","rack volume","sound level","amount"];
 const all=[...new Set([...configured,...sampler,...shared])];
 for(const label of all){
  const hint=helpForLabel(label);
  assert.ok(hint, "missing label help: "+label);
  assert.equal(hint,hint.toLowerCase(),label+" must be lowercase");
  assert.ok(!/[.!?]$/.test(hint),label+" must not have terminal punctuation");
  assert.ok(hint.length<=95,label+" is too wordy");
 }
 for(let n=1;n<=32;n++)assert.ok(helpForLabel(n===1?"H1 · Root":"H"+n),"harmonic "+n+" missing help");
});

test("the quiet layout conversion controls stay explicit and reversible",()=>{
 const html=read("index.html");
 const studio=read("studio.js");
 assert.match(html,/>convert to rack<\/button>/);
 assert.match(html,/>convert to piano roll<\/button>/);
 assert.doesNotMatch(html,/use a sound row/i);
 assert.match(studio,/extract sound to piano roll/);
 assert.match(studio,/canConvertToRack/);
 assert.match(studio,/canMoveRackSoundToPianoRoll/);
});

test("unnecessary visible studio filler stays removed",()=>{
 const html=read("index.html");
 assert.doesNotMatch(html,/pre-programmed \/ music studio/i);
 assert.doesNotMatch(html,/sound parameters/i);
 assert.doesNotMatch(html,/game parity pending/i);
 assert.doesNotMatch(html,/generated synth approximation\. compare recordings/i);
});

test("promoted synth knobs use canonical filter and envelope paths",()=>{
 assert.deepEqual(PRIMARY_SYNTH_FIELDS.map(field=>field.path),[
  ["filter","cutoff"],["envelope","attack"],["envelope","release"]
 ]);
 for(const field of PRIMARY_SYNTH_FIELDS)assert.ok(helpForLabel(field.label),field.label);
});
test("sound shape responds to rise and fade for both synth and recording",()=>{
 const synth={type:"synth",envelope:{attack:.45,decay:.12,sustain:.7,release:.3}};
 const sample={type:"sample",attack:.45,release:.3};
 for(const patch of [synth,sample]){
  assert.ok(scopeAmplitudeAt(patch,.2)<scopeAmplitudeAt(patch,.5),"attack raises level");
  assert.ok(scopeAmplitudeAt(patch,1.4)>scopeAmplitudeAt(patch,1.6),"release reduces level");
  const slow=patch.type==="sample"?{...patch,release:1.5}:
   {...patch,envelope:{...patch.envelope,release:1.5}};
  assert.ok(scopeAmplitudeAt(slow,1.7)>scopeAmplitudeAt(patch,1.7),"longer release remains more audible");
 }
});
