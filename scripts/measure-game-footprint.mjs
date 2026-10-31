// Measure bytes from real studio model/export shapes, not hand-written example JSON.
// This reports uncompressed and optional gzip sizes separately from external
// audio Assets, Windows executable size and the pre-programmed runtime bundle.
import {gzipSync} from "node:zlib";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {create,parse,validate,upgradeBeatFeatures} from "../schema.js";
import {makePatch} from "../synth.js";
import {EXAMPLES,buildExample} from "../examples.js";
import {sampleAsset} from "../samples.js";
import {makeSampleAsset} from "../sampler.js";
import {referencedSampleIds} from "../soundModel.js";
import {createSong,addBeat,addSongTrack,addBeatClip,addVocalTake,validateSong} from "../songModel.js";

function sampleStub(id){
 const metadata=sampleAsset(id);
 if(!metadata)throw Error("Unknown sample ID in shipped example: "+id);
 // Only the metadata reaches the .premidi manifest. These 48 bytes are a
 // test stand-in for the external file, NOT a measured sample asset size.
 const bytes=new Uint8Array(48);
 if(metadata.mime==="audio/ogg")bytes.set([79,103,103,83],0);
 else{bytes.set([82,73,70,70],0);bytes.set([87,65,86,69],8);}
 return makeSampleAsset(id,id,metadata.mime,bytes,metadata.sourceUrl);
}
function exportedInstructions(doc){
 if(doc.kind==="song")return doc;
 // Identical descriptor pruning to packageIO.exportProject; neither path
 // embeds sound files or sample bytes in the Beat JSON.
 const used=referencedSampleIds(doc.instruments);
 return {...doc,samples:doc.samples.filter(asset=>used.has(asset.id))};
}
function assertInstructionOnly(value,path="$"){
 if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))
  throw Error("Binary audio entered .premidi at "+path);
 if(Array.isArray(value)){value.forEach((v,i)=>assertInstructionOnly(v,path+"["+i+"]"));return;}
 if(value&&typeof value==="object")for(const [key,item] of Object.entries(value)){
  if(["data","bytes","pcm","audioBase64","base64"].includes(key))
   throw Error("Embedded audio-like field in .premidi at "+path+"."+key);
  assertInstructionOnly(item,path+"."+key);
 }
}
function inspect(name,doc){
 const manuscript=exportedInstructions(doc);
 const errors=doc.kind==="song"?validateSong(doc):validate(doc);
 if(errors.length)throw Error(name+": "+errors.join("; "));
 if(doc.kind!=="song")parse(JSON.stringify(manuscript));
 assertInstructionOnly(manuscript);
 const raw=JSON.stringify(manuscript),bytes=Buffer.byteLength(raw,"utf8");
 const beats=doc.kind==="song"?doc.beats:[doc],recordings=doc.kind==="song"?(doc.recordings||[]):[];
 const assetIds=new Set([...beats.flatMap(beat=>(beat.samples||[]).map(a=>a.id)),...recordings.map(a=>a.id)]);
 return {
  case:name,kind:doc.kind==="song"?"song":"beat",version:doc.version,
  instruction_bytes:bytes,gzip_bytes_informational:gzipSync(raw,{level:9}).byteLength,
  instruments:beats.reduce((n,beat)=>n+beat.instruments.length,0),
  sounds:beats.reduce((n,beat)=>n+beat.instruments.reduce((m,i)=>m+i.sounds.length,0),0),
  chunks:beats.reduce((n,beat)=>n+beat.instruments.reduce((m,i)=>m+i.chunks.length,0),0),
  authored_note_or_hit_events:beats.reduce((n,beat)=>n+beat.instruments.reduce((m,i)=>m+i.chunks.reduce((k,c)=>k+c.notes.length,0),0),0),
  distinct_external_asset_references:assetIds.size,
  external_asset_bytes:null,
  song_beat_clips:doc.kind==="song"?doc.tracks.filter(t=>t.kind==="beat").reduce((n,t)=>n+t.clips.length,0):0,
  song_vocal_clips:doc.kind==="song"?doc.tracks.filter(t=>t.kind==="vocal").reduce((n,t)=>n+t.clips.length,0):0
 };
}
function note(id,pitch,start,duration,velocity){
 return {id,pitch,start,duration,velocity};
}
export async function measureGameFootprint(){
 const cases=[];
 const empty=create();cases.push(inspect("init-beat-v7",empty));
 const phrase=create(),first=phrase.instruments[0],chunk=first.chunks[0];
 first.timeline[0]=chunk.id;chunk.notes=[
  note("fixture-note-1",60,0,4,.8),
  note("fixture-note-2",64,4,4,.7),
  note("fixture-note-3",67,8,4,.65),
  note("fixture-note-4",72,12,4,.75)
 ];
 cases.push(inspect("one-phrase-beat-v7",phrase));
 const mod=create();mod.instruments[0].sounds[0].patch=makePatch("touch-keys");
 upgradeBeatFeatures(mod);cases.push(inspect("modulated-beat-v9",mod));
 const automated=create();automated.instruments[0].automation={
  version:1,target:"filter.cutoff",unit:"hz",interpolation:"exponential",
  points:[{id:"begin",step:0,value:400},{id:"end",step:32,value:6400}]
 };
 upgradeBeatFeatures(automated);cases.push(inspect("automated-beat-v11",automated));

 const examples=new Map();
 for(const entry of EXAMPLES){
  const score=await buildExample(entry.id,sampleStub);
  examples.set(entry.id,score);
  cases.push(inspect("studio-example/"+entry.id,score));
 }
 cases.push(inspect("single-beat-song-v8",createSong(phrase)));
 cases.push(inspect("modulated-song-v10",createSong(mod)));
 cases.push(inspect("automated-song-v12",createSong(automated)));
 const layered=createSong(examples.get("floating-signals"));
 const second=addBeat(layered,examples.get("broken-circuit"));
 const lane=addSongTrack(layered,"beat");
 addBeatClip(layered,lane.id,second.id,16,256);
 addBeatClip(layered,lane.id,second.id,288,128);
 cases.push(inspect("layered-reused-beat-song-v8",layered));
 const vocal=createSong(phrase);
 addVocalTake(vocal,{
  id:"footprint-vocal",name:"Example take",mime:"audio/wav",
  path:"assets/footprint-vocal.wav",durationSeconds:12,trimSeconds:.125
 });
 cases.push(inspect("external-vocal-song-v14",vocal));
 return {
  schema_version:1,
  measurement:"UTF-8 bytes of JSON.stringify(instruction-only .premidi export documents); gzip level 9 is informative only",
  caveats:[
   "Factory example source audio bytes are replaced by 48-byte header stubs solely to create truthful Asset descriptors; they are never included in instruction bytes",
   "Asset ZIPs and portable executable bytes are separate unknown measurements",
   "IDs are generated by existing model constructors; raw byte counts remain stable at fixed ID lengths, gzip may vary",
   "Cases are representative examples and valid versioned formats, not a complete size distribution of user projects"
  ],
  cases
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await measureGameFootprint();
 console.log("PREMIDI_GAME_FOOTPRINT "+JSON.stringify(report));
}
