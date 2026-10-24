import test from "node:test";
import assert from "node:assert/strict";
import {create,validate,parse,clone} from "../schema.js";
test("starter score validates and round-trips without data loss",()=>{const x=create();assert.deepEqual(validate(x),[]);assert.deepEqual(parse(JSON.stringify(x)),x);});
test("invalid notes and broken arrangement references are rejected",()=>{const a=create();a.tracks[0].patterns[0].notes[0].duration=90;assert.ok(validate(a).includes("Invalid note."));const b=create();b.tracks[0].arrangement[0]="missing";assert.ok(validate(b).includes("Invalid pattern arrangement."));});
test("copy is independent",()=>{const a=create(),b=clone(a);b.tracks[0].name="Changed";assert.notEqual(a.tracks[0].name,b.tracks[0].name);});
