import test from "node:test";
import assert from "node:assert/strict";
import {create,clone} from "../schema.js";
import {createSong,addBeat,addSongTrack,addBeatClip,editBeatClip,eventsAtSongStep,songDurationSteps,validateSong,SONG_VERSION} from "../songModel.js";
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
