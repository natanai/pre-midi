import test from "node:test";
import assert from "node:assert/strict";
import {create,validate,id} from "../schema.js";
import {createStudioSession} from "../studioSession.js";
import {authoredSamplePatch} from "../phone/views/record.js";
import {encodeMonoWav,RECORDING_RATE} from "../recording.js";
import {makeSampleAsset} from "../sampler.js";
import {makeRecordingAsset,recordingBytes} from "../recordingAssets.js";
import {validateSong} from "../songModel.js";

test("phone recorded sound remains an external WAV in a valid compact Beat",()=>{
 const session=createStudioSession(create()),duration=Math.round(.15*RECORDING_RATE);
 const samples=new Float32Array(duration);
 for(let i=0;i<duration;i++)samples[i]=Math.sin(2*Math.PI*440*i/RECORDING_RATE)*.1;
 const bytes=encodeMonoWav(samples),meta=makeSampleAsset(id(),"Phone note","audio/wav",bytes,"user-recorded");
 const patch=authoredSamplePatch(meta,{root:69,followPitch:true});
 assert.equal(patch.zones[0].assetId,meta.id);
 assert.equal(session.selectCatalogSound({name:"Phone note",patch,assets:[meta],mode:"add",referencePitch:69}),true);
 assert.deepEqual(validate(session.getBeat()),[]);
 assert.equal(session.getBeat().samples.length,1);
 assert.equal(session.getBeat().samples[0].path,"assets/"+meta.id+".wav");
 assert.ok(!("bytes" in session.getBeat().samples[0]));
 assert.equal(session.getInstrument().sounds[0].patch.zones[0].root,69);
});
test("recorded voice attaches to a native Vocal Track and retains external recording identity",()=>{
 const session=createStudioSession(create());session.convertBeatToSong();
 const sound=new Float32Array(11025);sound.fill(.1);
 const bytes=encodeMonoWav(sound);
 const meta=makeRecordingAsset(id(),"Voice","audio/wav",bytes,{durationSeconds:.25,trimSeconds:0});
 assert.equal(session.attachVocalRecording(meta,{startStep:16}),true);
 const song=session.getDocument(),voice=song.tracks[0],clip=voice.clips[0];
 assert.equal(voice.kind,"vocal");assert.equal(clip.startStep,16);
 assert.equal(clip.recordingId,meta.id);assert.equal(song.recordings[0].path,meta.path);
 assert.ok(recordingBytes(meta).length===bytes.length);
 assert.deepEqual(validateSong(song),[]);
 assert.equal(session.undo(),true);
 assert.equal(session.getDocument().recordings.length,0);
});
