import test from "node:test";
import assert from "node:assert/strict";
import {create} from "../schema.js";
import {createSong,addSongTrack,eventsAtSongStep,upgradeSongFeatures,validateSong} from "../songModel.js";
import {attachBeatInstruments,ensureFreeform,addFreeformInstrument,addFreeformNote,
 unpackBeatClip,synchronizeLinkedFreeform,sourceForFreeformInstrument,
 resolveFreeformInstrument} from "../freeformModel.js";

test("attached Song-freeform Instrument references the original Beat Sound",()=>{
 const song=createSong(create()),track=song.tracks[0],beat=song.beats[0];
 const parent=beat.instruments[0];
 const layer=attachBeatInstruments(song,track);
 assert.equal(layer.instruments.length,beat.instruments.length);
 const linked=layer.instruments[0];
 assert.equal(linked.sourceBeatId,beat.id);
 assert.equal(linked.sourceInstrumentId,parent.id);
 assert.equal(linked.sounds[0].id,parent.sounds[0].id);
 addFreeformNote(linked,{pitch:60,start:3,duration:5,velocity:.8});
 parent.volume=.63;
 parent.sounds[0].name="Shared source";
 synchronizeLinkedFreeform(song);
 upgradeSongFeatures(song);
 const events=eventsAtSongStep(song,3);
 const note=events.find(event=>event.track.id===track.id&&event.beatStep===3);
 assert(note);
 assert.equal(note.instrument.sounds[0],parent.sounds[0]);
 assert.equal(note.instrument.volume,.63);
 assert.equal(layer.instruments[0].name,parent.name);
 assert.equal(layer.instruments[0].sounds[0].name,"Shared source");
 assert.deepEqual(validateSong(song),[]);
});
test("freeform Sound editor proxies linked Beat properties without changing Song notes",()=>{
 const song=createSong(create()),track=song.tracks[0];
 const layer=attachBeatInstruments(song,track),record=layer.instruments[0];
 const source=sourceForFreeformInstrument(song,record).instrument;
 const editor=resolveFreeformInstrument(song,record,{editable:true});
 editor.name="Edited from freeform";
 editor.sounds[0].gain=.37;
 assert.equal(source.name,"Edited from freeform");
 assert.equal(source.sounds[0].gain,.37);
 addFreeformNote(editor,{pitch:62,start:20,duration:8,velocity:.5});
 assert.equal(record.notes[0].start,20);
 assert.equal(source.notes,undefined);
 synchronizeLinkedFreeform(song);
 assert.equal(record.sounds[0].gain,.37);
});
test("unpacking the parent Beat reuses linked Instrument instead of cloning Sound",()=>{
 const song=createSong(create()),track=song.tracks[0],beat=song.beats[0];
 const source=beat.instruments[0];
 source.chunks[0].notes.push({id:"source-note",pitch:61,start:0,duration:2,velocity:.8});
 source.timeline[0]=source.chunks[0].id;
 const existing=attachBeatInstruments(song,track).instruments[0],soundId=existing.sounds[0].id;
 const clip=track.clips[0];
 unpackBeatClip(song,clip.id);
 assert.equal(track.freeform.instruments.length,1);
 assert.equal(track.freeform.instruments[0].id,existing.id);
 assert.equal(track.freeform.instruments[0].sounds[0].id,soundId);
 assert(track.freeform.instruments[0].notes.length>=1);
 assert.equal(track.clips.length,0);
 assert.deepEqual(validateSong(song),[]);
});
test("manual +track starts independent while existing unlinked Instruments stay valid",()=>{
 const song=createSong(create()),manual=addSongTrack(song,"beat");
 assert.equal(manual.clips.length,0);
 assert.equal(attachBeatInstruments(song,manual),null);
 const layer=ensureFreeform(manual),original=addFreeformInstrument(layer);
 assert(!sourceForFreeformInstrument(song,original));
 assert.equal(resolveFreeformInstrument(song,original),original);
 upgradeSongFeatures(song);
 assert.deepEqual(validateSong(song),[]);
});
