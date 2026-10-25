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
const H=(row,start,velocity=.8)=>[row,start,velocity];
const chord=(pitches,start,length=8,velocity=.7)=>pitches.map(pitch=>N(pitch,start,length,velocity));
const piece=(preset,pattern,timeline,volume=.68,options={})=>({
 preset,pattern,timeline,volume,...options
});
export const EXAMPLES=[
 NEON_AFTER_HOURS,
 {
  // Three recorded steel-guitar velocity takes are used as actual audio layers.
  // A 12-step arpeggio repeats over 16-step drums without adding any new
  // instrument behavior or audio format data.
  id:"porchlight",name:"Guitar Velocity and Polymeter",tag:"SAMPLES / PHRASE REPETITION",
  description:"Recorded guitar velocity layers and a repeating three-beat phrase over four-beat bass and drums.",
  bpm:94,bars:8,accent:"#ffc266",
  voices:[
   piece("steel-guitar",{
    Light:[
     N(57,0,2,.25),N(60,3,2,.55),N(64,6,2,.9),N(67,9,2,.55)
    ],
    Accent:[
     N(57,0,2,.9),N(60,3,2,.25),N(64,6,2,.55),N(67,9,2,.9)
    ]
   },["Light","-","-","-","Accent","-","-","-"],.38,{
    name:"Steel guitar · velocity layers",
    tone:{gain:.7,attack:.003,release:.17,pan:-.12},
    placements:[
     {offset:4,length:12,every:12,repeats:5},
     null,null,null,
     {offset:0,length:12,every:12,repeats:5},
     null,null,null
    ]
   }),
   piece("sub-current",{
    A:[N(45,0,12,.75),N(52,12,4,.44)],
    F:[N(41,0,12,.75),N(48,12,4,.44)]
   },["A","A","F","F","A","A","F","F"],.42,{
    name:"Synth bass",tone:{filter:{cutoff:430},envelope:{release:.18}}
   }),
   piece("tape-strings",{
    A:chord([57,60,64,67],0,16,.44),
    F:chord([53,57,60,64],0,16,.44)
   },["A","A","F","F","A","A","F","F"],.22,{
    name:"Chord pad",
    tone:{filter:{cutoff:1300},envelope:{attack:.28,release:.7},effects:{delayMix:.09}}
   }),
   piece("glass-keys",{
    High:[N(76,7,2,.58),N(79,13,2,.43)],
    Low:[N(72,8,3,.52),N(76,13,2,.36)],
    Turn:[N(79,3,2,.59),N(81,10,3,.49)]
   },["-","-","High","-","Low","High","Turn","High"],.23,{
    name:"Synth keys",tone:{effects:{delayMix:.19,delayTime:.26}}
   }),
   {
    name:"Percussion rack",volume:.43,
    rack:[
     {key:"kick",preset:"pulse-kick",name:"Synth kick",gain:.72},
     {key:"snare",preset:"static-snare",name:"Noise snare",gain:.46},
     {key:"hat",preset:"dust-hat",name:"Noise hi-hat",gain:.29},
     {key:"bongo",preset:"hand-bongo",name:"Recorded bongo",gain:.46,
      tone:{gain:.75,pan:.16}}
    ],
    pattern:{
     Light:[
      H("kick",0,.57),H("kick",8,.43),H("hat",6,.28),H("bongo",11,.32)
     ],
     Full:[
      H("kick",0,.79),H("kick",8,.67),
      H("snare",4,.43),H("snare",12,.46),
      H("hat",2,.30),H("hat",6,.34),H("hat",10,.30),H("hat",14,.35),
      H("bongo",3,.33),H("bongo",11,.42)
     ],
     Fill:[
      H("kick",0,.79),H("kick",8,.71),
      H("snare",4,.43),H("snare",12,.53),
      H("hat",2,.31),H("hat",6,.32),H("hat",10,.30),H("hat",14,.37),
      H("bongo",3,.35),H("bongo",10,.40),H("bongo",14,.43)
     ],
     End:[
      H("kick",0,.77),H("hat",6,.26),H("bongo",10,.35),H("snare",12,.32)
     ]
    },
    timeline:["-","Light","Light","Full","Full","Full","Fill","End"]
   }
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
  // Example phrases use the same native v7 placement contract as author-made scores.
  if(def.placements){
   if(def.placements.length!==example.bars)throw Error("Example placement count must match bars.");
   instrument.placements=clone(def.placements);
  }
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
