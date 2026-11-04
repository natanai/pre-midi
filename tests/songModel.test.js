import test from "node:test";
import assert from "node:assert/strict";
import {create,clone,resizeBeatBars,EXTENDED_BEAT_VERSION} from "../schema.js";
import {unpackBeatClip,ensureFreeform,addFreeformInstrument,addFreeformNote,createBeatFromFreeformSelection} from "../freeformModel.js";
import {renderEvents} from "../audio.js";
import {parseSong} from "../songIO.js";
import {createSong,addBeat,addSongTrack,addBeatClip,editBeatClip,eventsAtSongStep,songDurationSteps,validateSong,SONG_VERSION,EXTENDED_SONG_VERSION,CLIP_PHASE_SONG_VERSION,upgradeSongFeatures} from "../songModel.js";
const withNote=()=>{
 const beat=create();
 beat.instruments[0].chunks[0].notes.push({id:"demo-note",pitch:60,start:0,duration:1,velocity:.8});
 return beat;
};
test("Song starts by referencing one editable Beat, without changing its source",()=>{
 const source=withNote(),before=clone(source),song=createSong(source);
 assert.deepEqual(source,before);
 assert.equal(song.kind,"song");
 assert.equal(song.version,SONG_VERSION);
 assert.equal(song.beats.length,1);
 assert.equal(song.tracks[0].clips[0].beatId,source.id);
 assert.equal(song.tracks[0].clips[0].lengthSteps,source.bars*16);
 assert.deepEqual(validateSong(song),[]);
});
test("Song Clips repeat native Beat instructions without copying or stretching them",()=>{
 const song=createSong(withNote()),clip=song.tracks[0].clips[0];
 editBeatClip(song,clip.id,{lengthSteps:256});
 assert.equal(eventsAtSongStep(song,0).length,1);
 assert.equal(eventsAtSongStep(song,128).length,1);
 assert.equal(eventsAtSongStep(song,256).length,0);
 editBeatClip(song,clip.id,{startStep:8,lengthSteps:129});
 assert.equal(eventsAtSongStep(song,0).length,0);
 assert.equal(eventsAtSongStep(song,8).length,1);
 assert.equal(eventsAtSongStep(song,136).length,1);
 assert.equal(eventsAtSongStep(song,137).length,0);
 assert.equal(songDurationSteps(song),137);
 assert.deepEqual(validateSong(song),[]);
});
test("separate Beat Tracks layer on the same Song clock",()=>{
 const song=createSong(withNote());
 const second=addBeat(song,withNote());
 const lane=addSongTrack(song,"beat");
 addBeatClip(song,lane.id,second.id,0,16);
 assert.equal(eventsAtSongStep(song,0).length,2);
 assert.deepEqual(validateSong(song),[]);
});
test("linked Beat Clips all reflect changes to their one Beat",()=>{
 const song=createSong(withNote()),beat=song.beats[0],lane=song.tracks[0];
 addBeatClip(song,lane.id,beat.id,128,128);
 beat.instruments[0].chunks[0].notes[0].pitch=69;
 assert.equal(eventsAtSongStep(song,0)[0].note.pitch,69);
 assert.equal(eventsAtSongStep(song,128)[0].note.pitch,69);
});
test("Vocal Tracks always precede Beat Tracks; invalid clip identities are rejected",()=>{
 const song=createSong(withNote()),voice=addSongTrack(song,"vocal");
 assert.equal(song.tracks[0],voice);
 assert.deepEqual(validateSong(song),[]);
 song.tracks.reverse();
 assert.match(validateSong(song).join(" "),/Vocal Tracks must precede Beat Tracks/);
 song.tracks.reverse();
 const clip=song.tracks[1].clips[0];
 clip.beatId="missing";
 assert.match(validateSong(song).join(" "),/missing Beat/);
});
test("Song refuses broken input and collisions; copying a Beat requires new identity",()=>{
 const song=createSong(withNote());
 assert.throws(()=>addBeat(song,song.beats[0]),/already exists/);
 const distinct=addBeat(song,song.beats[0],{independent:true});
 assert.notEqual(distinct.id,song.beats[0].id);
 assert.deepEqual(validateSong(song),[]);
 assert.throws(()=>addBeatClip(song,song.tracks[0].id,"missing"),/missing Beat/);
 assert.throws(()=>editBeatClip(song,song.tracks[0].clips[0].id,{lengthSteps:0}),/Invalid Beat Clip/);
});

test("64-bar Beats remain source-linked in explicit Song v18",()=>{
 const beat=withNote();resizeBeatBars(beat,64);
 const inst=beat.instruments[0];inst.timeline[63]=inst.chunks[0].id;
 assert.equal(beat.version,EXTENDED_BEAT_VERSION);
 const song=createSong(beat);
 assert.equal(song.version,EXTENDED_SONG_VERSION);
 assert.equal(song.tracks[0].clips[0].lengthSteps,1024);
 assert.equal(eventsAtSongStep(song,63*16).length,1);
 assert.deepEqual(validateSong(song),[]);
 const oldVersion=clone(song);oldVersion.version=16;
 assert.match(validateSong(oldVersion).join(" "),/v18/);
 upgradeSongFeatures(song);
 assert.equal(song.version,EXTENDED_SONG_VERSION);
});

test("source-phase offsets preserve Beat timing independently of Song placement",()=>{
 const song=createSong(withNote()),beat=song.beats[0],clip=song.tracks[0].clips[0];
 beat.instruments[0].timeline[1]=beat.instruments[0].chunks[0].id;
 editBeatClip(song,clip.id,{sourceOffsetSteps:8});
 assert.equal(song.version,CLIP_PHASE_SONG_VERSION);
 assert.equal(eventsAtSongStep(song,0).length,0);
 assert.equal(eventsAtSongStep(song,8)[0].beatStep,16);
 assert.equal(eventsAtSongStep(song,120)[0].beatStep,0);
 assert.deepEqual(validateSong(song),[]);
 const downgraded=clone(song);downgraded.version=18;
 assert.match(validateSong(downgraded).join(" "),/v20/);
 const invalid=clone(song);invalid.tracks[0].clips[0].sourceOffsetSteps=-1;
 assert.match(validateSong(invalid).join(" "),/source phase/);
});

test("Song playback and offline rendering preserve note timing on full unpack",()=>{
 const song=createSong(withNote()),clip=song.tracks[0].clips[0];
 const before=renderEvents(song);
 unpackBeatClip(song,clip.id);
 const after=renderEvents(song);
 assert.deepEqual(after.map(e=>[e.kind,e.at,e.note.pitch,e.note.velocity]),
  before.map(e=>[e.kind,e.at,e.note.pitch,e.note.velocity]));
 assert.deepEqual(validateSong(song),[]);
 const layer=ensureFreeform(song.tracks[0]),inst=addFreeformInstrument(layer);
 addFreeformNote(inst,{pitch:72,start:135,duration:24,velocity:.8});
 assert.equal(songDurationSteps(song),159);
 assert.equal(eventsAtSongStep(song,135).length,1);
 assert.deepEqual(validateSong(song),[]);
});

test("Creating a reusable Beat leaves Song audio unchanged until placed in a Clip",()=>{
 const song=createSong(withNote()),track=song.tracks[0],free=ensureFreeform(track);
 const inst=addFreeformInstrument(free);
 addFreeformNote(inst,{pitch:64,start:32,duration:3,velocity:.8});
 upgradeSongFeatures(song);
 const audible=renderEvents(song).map(item=>[item.at,item.note.pitch]);
 const beat=createBeatFromFreeformSelection(song,track.id,32,48,{title:"Bridge"});
 const saved=addBeat(song,beat);
 assert.equal(saved.title,"Bridge");
 assert.equal(song.beats.length,2);
 assert.deepEqual(renderEvents(song).map(item=>[item.at,item.note.pitch]),audible,
  "The Beat is reusable but must not automatically double the Song audio");
 assert.deepEqual(validateSong(song),[]);
});

test("freeform Sound patch settings persist without a separate effects format",()=>{
 const song=createSong(withNote()),track=song.tracks[0];
 const free=ensureFreeform(track),inst=addFreeformInstrument(free);
 const note=addFreeformNote(inst,{pitch:62,start:16,duration:4,velocity:.8});
 const before=renderEvents(song).find(item=>item.note.pitch===62);
 assert.equal(before?.instrument?.sounds?.[0]?.patch?.effects?.drive,0);
 inst.sounds[0].patch.effects.drive=.43;
 inst.sounds[0].patch.envelope.attack=.17;
 inst.sounds[0].patch.filter.cutoff=950;
 inst.volume=.64;inst.sounds[0].gain=.72;
 upgradeSongFeatures(song);
 assert.deepEqual(validateSong(song),[]);
 const after=renderEvents(song).find(item=>item.note.pitch===62);
 assert.equal(after.instrument.sounds[0].patch.effects.drive,.43);
 assert.equal(after.instrument.sounds[0].patch.envelope.attack,.17);
 assert.equal(after.instrument.sounds[0].patch.filter.cutoff,950);
 assert.equal(after.instrument.volume,.64);
 assert.equal(after.note.id,note.id);
 assert.deepEqual(parseSong(JSON.stringify(song)),song);
});
