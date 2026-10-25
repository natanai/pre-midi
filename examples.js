// Optional arrangements demonstrate the *real* instrument, chunk, timeline and
// note systems. No parallel playback engine, example-only patch or save path.
import {create,makeInstrument,makeChunk,makeSound,id,validate,clone} from "./schema.js";
import {NEON_AFTER_HOURS} from "./exampleNeon.js";
import {makePatch} from "./synth.js";
import {samplePreset,makeSamplerPatch} from "./samples.js";
import {sampleForNote} from "./sampler.js";
const N=(pitch,start,duration=2,velocity=.8,bend)=>[pitch,start,duration,velocity,bend];
const line=(pitches,steps=4,duration=3,velocity=.8)=>
 pitches.map((pitch,index)=>N(pitch,index*steps,duration,velocity));
const hits=(steps,pitch=60,velocity=.85)=>steps.map(start=>N(pitch,start,1,velocity));
const chord=(pitches,start,length=8,velocity=.7)=>pitches.map(pitch=>N(pitch,start,length,velocity));
const piece=(preset,pattern,timeline,volume=.68,options={})=>({
 preset,pattern,timeline,volume,...options
});
export const EXAMPLES=[
 NEON_AFTER_HOURS,
 {
  id:"porchlight",name:"Sampled Guitar and Percussion",tag:"SAMPLES / GUITAR",
  description:"Sampled steel and nylon guitars, bongo hits, and synthesized keyboard chords.",
  bpm:94,bars:8,accent:"#ffc266",
  voices:[
   piece("steel-strum",{
    Warm:[...chord([52,59,64,67],0,7,.58),...chord([50,57,62,66],8,8,.55)],
    Turn:[...chord([48,55,60,64],0,8,.63),...chord([50,57,62,65],8,8,.6)],
    Lift:[...chord([53,60,65,69],0,8,.75),...chord([55,62,67,71],8,8,.78)]
   },["Warm","Warm","Turn","Lift","Warm","Turn","Lift","Warm"],.73),
   piece("nylon-finger",{
    Picking:[N(52,0,3,.53),N(64,3,2,.53),N(67,6,2,.67),N(71,9,2,.68),N(67,12,3,.57)],
    Answer:[N(55,0,3,.55),N(62,3,2,.58),N(66,6,3,.63),N(64,10,2,.62),N(62,13,3,.5)],
    High:[N(69,0,3,.67),N(72,4,4,.72),N(74,9,3,.64),N(71,13,3,.53)]
   },["Picking","Answer","Picking","High","Picking","Answer","High","Picking"],.71),
   piece("hand-bongo",{
    Hands:[N(60,0,1,.47),N(60,4,1,.34),N(60,8,1,.57),N(60,12,1,.39)],
    Shuffle:[N(60,0,1,.43),N(60,3,1,.26),N(60,6,1,.4),N(60,8,1,.6),N(60,12,1,.4),N(60,14,1,.28)]
   },["Hands","Hands","Shuffle","Shuffle","Hands","Hands","Shuffle","Hands"],.32),
   piece("felt-electric",{
    Evening:[...chord([60,64,67],0,8,.35),...chord([59,62,67],8,8,.37)],
    Breath:[...chord([60,65,69],0,8,.43),...chord([62,67,71],8,8,.42)]
   },["Evening","Evening","-","Breath","Evening","-","Breath","Evening"],.33)
  ]
 },
 {
  id:"floating-signals",name:"Sustained Notes and Offsets",tag:"CHUNKS / PITCH MOVEMENT",
  description:"Sustained chords, separate instrument entrances, and per-note pitch bends.",
  bpm:72,bars:16,accent:"#ba82eb",
  voices:[
   piece("violet-pad",{
    Open:chord([48,55,60,64],0,16,.68),
    Mist:chord([50,57,62,65],0,16,.7),
    Wide:chord([53,60,65,69],0,16,.8),
    Home:chord([48,55,60,67],0,16,.62)
   },["Open","Open","Mist","Mist","Open","Open","Wide","Wide","Mist","Mist","Wide","Wide","Home","Home","Home","Home"],.52),
   piece("tape-strings",{
    Shimmer:[N(72,0,16,.5),N(79,0,16,.34)],
    Answer:[N(74,0,16,.57),N(81,0,16,.43)],
    Bloom:[N(76,0,16,.6),N(83,0,16,.37)]
   },["-","Shimmer","Shimmer","-","Answer","Answer","Bloom","Bloom","Answer","Answer","Bloom","Bloom","Shimmer","Shimmer","-","Shimmer"],.38),
   piece("midnight-theremin",{
    Calling:[N(79,2,12,.66,{shape:"scoop",amount:2,rate:4})],
    Returning:[N(76,0,13,.66,{shape:"fall",amount:2,rate:4})],
    Hover:[N(81,1,15,.55,{shape:"wave",amount:.4,rate:1.1})]
   },["-","-","Calling","-","Returning","-","Hover","-","Calling","-","Returning","-","Hover","-","Calling","-"],.5),
   piece("glass-keys",{
    Stars:[N(84,0,3,.56),N(79,6,3,.46),N(81,12,4,.48)],
    Mirror:[N(76,0,4,.5),N(79,8,3,.46),N(72,13,3,.41)]
   },["Stars","-","Mirror","-","Stars","-","Mirror","-","Stars","-","Mirror","-","Stars","Mirror","Stars","Mirror"],.28)
  ]
 },
 {
  id:"broken-circuit",name:"Synth Step Patterns",tag:"SYNTH / SEQUENCING",
  description:"Synthesized kick and snare patterns, stepped bass notes, and pitch-modulated siren.",
  bpm:144,bars:8,accent:"#ff416d",
  voices:[
   piece("pulse-kick",{
    Drive:hits([0,4,8,12]),
    Disturb:hits([0,3,4,8,11,12,15])
   },["Drive","Drive","Disturb","Drive","Drive","Disturb","Drive","Disturb"],.75),
   piece("static-snare",{
    Metal:hits([4,12]),Rattle:hits([4,10,12,13,15])
   },["Metal","Metal","Rattle","Metal","Metal","Rattle","Metal","Rattle"],.55),
   piece("square-circuit",{
    Signal:[N(72,0,2),N(72,3,1),N(77,4,2),N(75,7,1),N(72,8,3),N(79,12,2)],
    Break:[N(84,0,2),N(81,2,2),N(77,6,2),N(75,10,3),N(72,14,2)]
   },["Signal","Signal","Break","-","Signal","Break","Signal","Break"],.37),
   piece("acid-line",{
    Tension:[N(40,0,2),N(40,3,2),N(43,6,2),N(46,8,3),N(40,12,2),N(48,14,2)],
    Drop:[N(36,0,4),N(39,4,2),N(42,7,2),N(43,10,3),N(36,14,2)]
   },["Tension","Tension","Drop","Tension","Tension","Drop","Tension","Drop"],.72),
   piece("broken-siren",{
    Alarm:[N(67,0,10,.76,{shape:"wail",amount:2,rate:4})],
    Disconnect:[N(70,0,8,.8,{shape:"fall",amount:4,rate:4})]
   },["-","Alarm","-","Disconnect","-","Alarm","-","Disconnect"],.44),
   piece("signal-bell",{
    Sparks:[N(84,1,3,.6),N(88,5,3,.64),N(91,13,3,.53)]
   },["Sparks","-","Sparks","Sparks","Sparks","-","Sparks","Sparks"],.38)
  ]
 },
 {
  id:"swaying-wire",name:"Sampled Guitar Pitch Movement",tag:"SAMPLES / BENDS",
  description:"Recorded steel guitar with note bends, electric-key chords, bass, and recorder.",
  bpm:80,bars:8,accent:"#ba82eb",
  voices:[
   piece("steel-lap-cry",{
    Cry:[N(64,0,12,.9,{shape:"rise",amount:3,rate:4})],
    Fall:[N(69,1,12,.73,{shape:"fall",amount:2,rate:4})],
    Sigh:[N(67,0,16,.55,{shape:"dip",amount:1.5,rate:3.3})]
   },["-","Cry","Fall","Sigh","Cry","Fall","Sigh","Cry"],.67),
   piece("felt-electric",{
    Open:[...chord([52,55,59],0,8,.6),...chord([55,59,64],8,8,.56)],
    Dusk:[...chord([50,53,57],0,8,.5),...chord([53,57,62],8,8,.59)]
   },["Open","Open","Dusk","Dusk","Open","Open","Dusk","Open"],.48),
   piece("sub-current",{
    Low:[N(40,0,8,.75),N(43,8,8,.73)],
    Move:[N(38,0,8,.77),N(45,8,8,.75)]
   },["Low","Low","Move","Move","Low","Low","Move","Low"],.62),
   piece("wood-recorder",{
    Air:[N(72,0,7,.67),N(76,9,7,.65)],
    Fading:[N(74,1,7,.54),N(71,9,7,.6)]
   },["Air","-","Fading","-","Air","-","Fading","Air"],.4)
  ]
 }
];
// Modifications are ordinary native patch values, not a second audio engine.
function withTone(patch,tone={}){
 for(const [key,value] of Object.entries(tone)){
  if(value&&typeof value==="object"&&!Array.isArray(value)&&
     patch[key]&&typeof patch[key]==="object"&&!Array.isArray(patch[key]))
   Object.assign(patch[key],clone(value));
  else patch[key]=clone(value);
 }
 return patch;
}
function exampleSound(def,trigger="pitched"){
 const sample=samplePreset(def.preset);
 const patch=withTone(sample?makeSamplerPatch(sample):makePatch(def.preset),def.tone);
 const name=def.name||sample?.name||def.preset.replaceAll("-"," ");
 const sound=makeSound(name,patch,trigger);
 sound.gain=def.gain??1;
 if(def.referencePitch!==undefined)sound.referencePitch=def.referencePitch;
 return sound;
}
const asNote = ([pitch,start,duration,velocity,bend])=>({
 id:id(),pitch,start,duration,velocity,...(bend?{bend:clone(bend)}:{})
});
function asRackHit([key,start,velocity],byKey){
 const soundId=byKey.get(key);
 if(!soundId)throw Error("Example rack references missing sound: "+key);
 return {id:id(),soundId,start,duration:1,velocity};
}
export async function buildExample(exampleId,loadAsset){
 const example=EXAMPLES.find(entry=>entry.id===exampleId);
 if(!example)throw Error("Unknown example composition.");
 const score=create();
 score.id=id();score.title=example.name;score.bpm=example.bpm;score.bars=example.bars;
 score.instruments=[];
 for(const def of example.voices){
  const isRack=Array.isArray(def.rack);
  const sound=isRack?exampleSound(def.rack[0],"hit"):exampleSound(def);
  const instrument=makeInstrument(score.instruments.length+1,example.bars,sound);
  instrument.name=def.name||sound.name;
  instrument.volume=def.volume;
  if(isRack){
   instrument.sounds=def.rack.map(row=>exampleSound(row,"hit"));
   const byKey=new Map(def.rack.map((row,index)=>[row.key,instrument.sounds[index].id]));
   if(byKey.size!==def.rack.length)throw Error("Duplicate example rack sound key.");
   instrument.chunks=Object.entries(def.pattern).map(([name,notes],index)=>({
    ...makeChunk("Chunk "+(index+1)),notes:notes.map(note=>asRackHit(note,byKey))
   }));
  }else instrument.chunks=Object.entries(def.pattern).map(([name,notes],index)=>({
   ...makeChunk("Chunk "+(index+1)),notes:notes.map(asNote)
  }));
  const lookup=new Map(Object.keys(def.pattern).map((name,index)=>[name,instrument.chunks[index].id]));
  instrument.timeline=def.timeline.map(name=>name==="-"?null:lookup.get(name)??null);
  score.instruments.push(instrument);
 }
 // Sample selection is based on the sounds *actually played*, including
 // independent rack rows. Keep .premidi metadata free from audio bytes.
 const assetIds=new Set();
 for(const instrument of score.instruments){
  const assigned=new Set(instrument.timeline.filter(Boolean));
  for(const sound of instrument.sounds){
   if(sound.patch.type!=="sample")continue;
   const ids=new Set();
   for(const chunk of instrument.chunks){
    if(!assigned.has(chunk.id))continue;
    for(const note of chunk.notes){
     if(instrument.layout==="rack"&&note.soundId!==sound.id)continue;
     const zone=sampleForNote(sound.patch,
      instrument.layout==="rack"?sound.referencePitch:note.pitch,note.velocity);
     if(zone)ids.add(zone.assetId);
    }
   }
   if(!ids.size)throw Error("Unplayed sample sound in example: "+sound.name);
   sound.patch.zones=sound.patch.zones.filter(zone=>ids.has(zone.assetId));
   for(const assetId of ids)assetIds.add(assetId);
  }
 }
 score.samples=await Promise.all([...assetIds].map(loadAsset));
 const errors=validate(score);
 if(errors.length)throw Error("Example cannot be loaded: "+errors.join(", "));
 return score;
}
