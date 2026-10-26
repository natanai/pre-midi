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
  // Introduce the two-bar key motif over E minor before bringing in the sampled
  // guitar. Chord-matched C and D guitar answers lead to the four-bar cycles.
  // Later 12-step guitar phrases use native placements; no special playback path.
  id:"porchlight",name:"Guitar Velocity and Polymeter",tag:"SAMPLES / PHRASE REPETITION",
  description:"Recorded guitar velocity layers, three-beat phrases against 4/4 drums, melodic variations, and section changes.",
  bpm:112,bars:16,accent:"#ffc266",
  voices:[
   piece("steel-guitar",{
    IntroC:[
     N(64,0,3,.55),N(67,6,2,.25),N(71,10,3,.55)
    ],
    IntroD:[
     N(66,0,3,.55),N(69,6,2,.25),N(74,10,3,.55)
    ],
    Second:[
     N(67,0,2,.9),N(69,2,2,.55),N(64,5,2,.25),N(62,9,3,.9)
    ],
    Third:[
     N(69,0,2,.9),N(67,3,2,.55),N(64,6,2,.9),N(59,10,2,.25)
    ],
    Break:[
     N(64,0,3,.25),N(62,6,2,.55),N(67,10,2,.55)
    ],
    Turn:[
     N(59,0,3,.9),N(63,4,2,.55),N(66,7,2,.9),N(69,11,2,.55)
    ],
    Resolve:[
     N(64,0,4,.9),N(67,7,2,.55),N(64,12,4,.25)
    ]
   },["-","-","IntroC","IntroD","Second","-","-","-",
      "Third","-","-","-","Break","-","Turn","Resolve"],.46,{
    name:"Recorded guitar · three velocity layers",
    tone:{gain:.66,attack:.006,release:.085,pan:-.17,
     filter:{type:"lowpass",cutoff:3600,resonance:.7}},
    placements:[
     null,null,null,null,
     {offset:0,length:12,every:12,repeats:5},null,null,null,
     {offset:0,length:12,every:12,repeats:5},null,null,null,
     {offset:0,length:12,every:12,repeats:3},null,
     null,null
    ]
   }),
   piece("rubber-bass",{
    E:[N(40,0,4,.9),N(47,7,2,.62),N(52,10,2,.79),N(47,14,2,.54)],
    C:[N(36,0,4,.88),N(43,7,2,.62),N(48,10,2,.79),N(43,14,2,.54)],
    G:[N(43,0,4,.9),N(50,7,2,.62),N(43,10,2,.76),N(42,14,2,.6)],
    D:[N(38,0,4,.9),N(45,7,2,.62),N(50,10,2,.78),N(42,14,2,.6)],
    B:[N(47,0,4,.92),N(42,7,3,.7),N(47,12,3,.82)],
    ThinE:[N(40,0,8,.75),N(47,12,3,.5)],
    ThinC:[N(36,0,8,.72),N(43,12,3,.49)],
    End:[N(40,0,16,.9)]
   },["ThinE","ThinE","ThinC","D","E","C","G","B",
      "E","C","G","D","ThinC","D","B","End"],.64,{
    name:"Syncopated synth bass",
    tone:{filter:{cutoff:930,resonance:3.1},
     envelope:{attack:.004,decay:.13,sustain:.52,release:.14},
     effects:{drive:.25}}
   }),
   piece("tape-strings",{
    Em:[...chord([52,55,59,62],0,16,.5)],
    C:[...chord([48,55,59,64],0,16,.49)],
    G:[...chord([43,50,54,57],0,16,.46)],
    D:[...chord([50,57,62,64],0,16,.5)],
    B:[...chord([47,54,57,63],0,16,.53)],
    IntroEm:chord([59,62,67],0,16,.38),
    IntroC:chord([60,64,67,71],0,16,.37),
    IntroD:chord([62,66,69],0,16,.4)
   },["-","IntroEm","IntroC","IntroD","Em","C","G","B",
      "Em","C","G","D","C","D","B","Em"],.23,{
    name:"Chord pad",
    tone:{filter:{cutoff:1800},envelope:{attack:.19,decay:.35,sustain:.78,release:.7},
     effects:{delayMix:.12,delayTime:.37}}
   }),
   piece("felt-electric",{
    Intro:[N(76,0,3,.72),N(71,5,2,.55),N(67,8,3,.64),N(71,13,2,.48)],
    Variation:[N(67,0,3,.67),N(71,4,2,.55),N(76,8,3,.68),N(74,13,2,.5)],
    E:[N(76,0,2,.75),N(79,5,2,.56),N(74,11,3,.71)],
    C:[N(72,1,3,.73),N(76,6,2,.62),N(79,13,2,.68)],
    G:[N(74,2,2,.7),N(78,8,2,.59),N(81,13,2,.76)],
    D:[N(76,0,2,.68),N(74,6,2,.74),N(78,12,3,.72)],
    B:[N(75,3,2,.7),N(78,9,3,.77)],
    UpE:[N(76,0,2,.8),N(79,3,2,.65),N(83,7,3,.86),N(86,12,3,.79)],
    UpC:[N(76,0,2,.7),N(79,4,2,.78),N(84,8,3,.88),N(83,13,2,.6)],
    UpG:[N(74,0,2,.72),N(78,3,2,.77),N(81,7,2,.82),N(86,12,3,.9)],
    UpD:[N(76,0,2,.75),N(81,4,2,.79),N(86,9,2,.9),N(78,13,3,.85)],
    End:[N(76,0,4,.85),N(79,7,3,.6),N(88,12,4,.82)]
   },["Intro","Variation","-","-","E","C","G","B",
      "UpE","UpC","UpG","UpD","-","D","B","End"],.30,{
    name:"Triangle-key counter-melody",
    tone:{filter:{cutoff:2650},envelope:{decay:.35,release:.3},
     effects:{delayMix:.09,delayTime:.3,delayFeedback:.17},pan:.13}
   }),
   piece("neon-lead",{
    Pickup:[N(71,11,3,.62)],
    Call:[N(71,2,3,.69),N(74,8,2,.83),N(76,12,3,.82)],
    Response:[N(79,0,4,.76),N(76,7,3,.75),N(74,13,3,.68)],
    Peak:[N(83,0,3,.85),N(81,4,2,.72),N(79,7,2,.78),N(76,12,4,.88)],
    Fall:[N(78,1,4,.72,{shape:"fall",amount:1.5,rate:3.4})],
    Close:[N(76,0,8,.78),N(71,12,4,.5)]
   },["-","-","-","-","-","Call","Response","Call",
      "Response","Peak","Response","Peak","-","Fall","Call","Close"],.24,{
    name:"Detuned synth lead",
    tone:{filter:{cutoff:2800},envelope:{release:.27},
     effects:{delayMix:.26,delayTime:.27,delayFeedback:.28},pan:.2}
   }),
   {
    name:"Drum rack · synth and recorded hits",volume:.78,
    rack:[
     {key:"kick",preset:"pulse-kick",name:"Synth kick",gain:.93,
      tone:{effects:{drive:.4}}},
     {key:"low",preset:"acoustic-kick",name:"Recorded kick",gain:.68,
      tone:{gain:.84}},
     {key:"snare",preset:"static-snare",name:"Synth noise snare",gain:.65},
     {key:"clap",preset:"hiphop-clap",name:"Recorded clap",gain:.6},
     {key:"hat",preset:"dust-hat",name:"Synth hi-hat",gain:.33,
      tone:{filter:{cutoff:7200}}},
     {key:"closed",preset:"tight-hat",name:"Recorded closed hi-hat",gain:.44},
     {key:"open",preset:"open-hat",name:"Recorded open hi-hat",gain:.36},
     {key:"bongo",preset:"hand-bongo",name:"Recorded bongo",gain:.4}
    ],
    pattern:{
     Open:[
      H("kick",0,.62),H("closed",8,.22)
     ],
     IntroBeat:[
      H("kick",0,.69),H("kick",8,.48),
      H("closed",4,.25),H("closed",12,.29)
     ],
     Build:[
      H("kick",0,.79),H("kick",8,.61),H("low",0,.41),
      H("closed",2,.25),H("closed",6,.28),H("closed",10,.27),
      H("closed",14,.3),H("snare",12,.48)
     ],
     Approach:[
      H("kick",0,.77),H("kick",10,.52),H("low",0,.53),
      H("snare",12,.54),H("hat",2,.25),H("hat",6,.37),
      H("hat",14,.36),H("bongo",7,.45),H("bongo",15,.42)
     ],
     Full:[
      H("kick",0,.92),H("kick",8,.77),H("low",0,.65),
      H("snare",4,.81),H("snare",12,.87),H("clap",12,.7),
      H("hat",0,.43),H("hat",4,.45),H("hat",8,.44),H("hat",12,.46),
      H("closed",2,.37),H("closed",6,.42),H("closed",10,.36),H("closed",14,.43),
      H("bongo",3,.42),H("bongo",11,.5)
     ],
     Shift:[
      H("kick",0,.92),H("kick",7,.76),H("kick",11,.71),H("low",0,.67),
      H("snare",4,.8),H("snare",12,.88),H("clap",12,.75),
      H("hat",2,.38),H("hat",6,.43),H("hat",10,.42),H("hat",14,.43),
      H("closed",0,.36),H("closed",8,.43),
      H("bongo",3,.41),H("bongo",15,.53),H("open",14,.42)
     ],
     Fill:[
      H("kick",0,.9),H("kick",7,.75),H("kick",11,.79),H("low",0,.65),
      H("snare",4,.88),H("snare",10,.68),H("snare",12,.86),
      H("snare",15,.87),H("clap",12,.76),
      H("closed",2,.44),H("closed",6,.45),H("closed",10,.44),
      H("closed",14,.47),H("hat",1,.38),H("hat",5,.38),
      H("hat",9,.4),H("open",15,.57),H("bongo",13,.64)
     ],
     Half:[
      H("kick",0,.97),H("low",0,.72),H("snare",8,.83),H("clap",8,.66),
      H("closed",3,.36),H("closed",7,.32),H("closed",11,.35),
      H("closed",15,.42),H("open",14,.43)
     ],
     Break:[
      H("bongo",3,.35),H("bongo",11,.46),H("hat",15,.25)
     ],
     Restart:[
      H("kick",0,.8),H("low",0,.52),H("snare",12,.59),
      H("hat",6,.26),H("open",14,.4)
     ],
     End:[
      H("kick",0,.98),H("low",0,.77),H("snare",4,.61),
      H("clap",4,.45),H("closed",6,.38),H("bongo",11,.43)
     ]
    },
    timeline:["Open","IntroBeat","Build","Approach",
      "Full","Full","Shift","Fill",
      "Half","Shift","Full","Fill",
      "Break","Restart","Fill","End"]
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
// Example instruments and selectable sound presets share one construction
// pathway. Changes to an example patch automatically update its built-in
// preset: no hand-maintained duplicate synth recipes or sample maps.
function exampleInstrument(def,bars,index){
 const rack=Array.isArray(def.rack);
 const base=rack?exampleSound(def.rack[0],"hit"):exampleSound(def);
 const inst=makeInstrument(index+1,bars,base);
 inst.name=def.name||base.name;
 inst.volume=def.volume;
 if(rack){
  inst.sounds=def.rack.map(row=>exampleSound(row,"hit"));
  const byKey=new Map(def.rack.map((row,i)=>[row.key,inst.sounds[i].id]));
  if(byKey.size!==def.rack.length)throw Error("Duplicate example rack sound key.");
  inst.chunks=Object.entries(def.pattern).map(([name,notes],i)=>({
   ...makeChunk("Chunk "+(i+1)),notes:notes.map(note=>asRackHit(note,byKey))
  }));
 }else inst.chunks=Object.entries(def.pattern).map(([name,notes],i)=>({
  ...makeChunk("Chunk "+(i+1)),notes:notes.map(asNote)
 }));
 const lookup=new Map(Object.keys(def.pattern).map((name,i)=>[name,inst.chunks[i].id]));
 inst.timeline=def.timeline.map(name=>name==="-"?null:lookup.get(name)??null);
 if(def.placements){
  if(def.placements.length!==bars)throw Error("Example placement count must match bars.");
  inst.placements=clone(def.placements);
 }
 return inst;
}
function retainPlayedSamples(instrument){
 const assetIds=new Set(),assigned=new Set(instrument.timeline.filter(Boolean));
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
 return assetIds;
}
const presetForSound=(sourceId,name,sound,volume,description)=>({
 id:sourceId,name,category:"Examples",description,
 // Presets carry the exact authored sound values, not the factory defaults.
 patch:clone(sound.patch),trigger:sound.trigger,
 referencePitch:sound.referencePitch,gain:sound.gain,volume
});
export const EXAMPLE_SOUND_PRESETS=EXAMPLES.flatMap(example=>
 example.voices.flatMap((definition,index)=>{
  const inst=exampleInstrument(definition,example.bars,index);
  retainPlayedSamples(inst);
  const id="example-"+example.id+"-"+index;
  const description=example.name+" · "+(inst.layout==="rack"?
   inst.sounds.length+"-sound rack":"instrument");
  const whole=inst.layout==="rack"?{
   id,name:inst.name,category:"Examples",description,
   layout:"rack",sounds:clone(inst.sounds),volume:inst.volume
  }:presetForSound(id,inst.name,inst.sounds[0],inst.volume,description);
  // Rack components are also available individually, with their original
  // names, velocity, reference pitches, and processed patches.
  return inst.layout==="rack"?
   [whole,...inst.sounds.map((sound,rowIndex)=>
    presetForSound(id+"-"+definition.rack[rowIndex].key,sound.name,sound,inst.volume,
     example.name+" · "+inst.name+" · individual sound"))]:[whole];
 })
);

export async function buildExample(exampleId,loadAsset){
 const example=EXAMPLES.find(entry=>entry.id===exampleId);
 if(!example)throw Error("Unknown example beat.");
 const beat=create();
 beat.id=id();beat.title=example.name;beat.bpm=example.bpm;beat.bars=example.bars;
 beat.instruments=example.voices.map((definition,index)=>
  exampleInstrument(definition,example.bars,index));
 const assetIds=new Set();
 for(const instrument of beat.instruments)
  for(const assetId of retainPlayedSamples(instrument))assetIds.add(assetId);
 beat.samples=await Promise.all([...assetIds].map(loadAsset));
 const errors=validate(beat);
 if(errors.length)throw Error("Example cannot be loaded: "+errors.join(", "));
 return beat;
}
