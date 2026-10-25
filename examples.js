// Optional arrangements demonstrate the *real* instrument, chunk, timeline and
// note systems. No parallel playback engine, example-only patch or save path.
import {create,makeInstrument,makeChunk,id,validate,clone} from "./schema.js";
import {makePatch} from "./synth.js";
import {samplePreset,makeSamplerPatch} from "./samples.js";
import {sampleForNote} from "./sampler.js";
const N=(pitch,start,duration=2,velocity=.8,bend)=>[pitch,start,duration,velocity,bend];
const line=(pitches,steps=4,duration=3,velocity=.8)=>
 pitches.map((pitch,index)=>N(pitch,index*steps,duration,velocity));
const hits=(steps,pitch=60,velocity=.85)=>steps.map(start=>N(pitch,start,1,velocity));
const chord=(pitches,start,length=8,velocity=.7)=>pitches.map(pitch=>N(pitch,start,length,velocity));
const copyNotes=patterns=>patterns;
const piece=(preset,pattern,timeline,volume=.68,options={})=>({
 preset,pattern,timeline,volume,...options
});
export const EXAMPLES=[
 {
  id:"neon-after-hours",name:"Neon After Hours",tag:"ELECTRONIC / DANCE",
  description:"A four-on-the-floor beat, syncopated bass, moving lead and glassy hooks.",
  bpm:126,bars:8,accent:"#08e4ec",
  voices:[
   piece("pulse-kick",{
    Beat:hits([0,4,8,12]),Fill:hits([0,4,8,11,12,14])
   },["Beat","Beat","Beat","Fill","Beat","Beat","Beat","Fill"],.8),
   piece("static-snare",{
    Backbeat:hits([4,12]),Roll:hits([4,11,12,14,15])
   },["Backbeat","Backbeat","Backbeat","Roll","Backbeat","Backbeat","Backbeat","Roll"],.42),
   piece("dust-hat",{
    Eighths:hits([0,2,4,6,8,10,12,14],72,.43),
    Spark:hits([0,2,4,6,8,10,11,12,14,15],72,.38)
   },["Eighths","Eighths","Eighths","Spark","Eighths","Eighths","Eighths","Spark"],.28),
   piece("sub-current",{
    Root:[N(36,0,3),N(36,6,2),N(43,8,3),N(39,12,3)],
    Rise:[N(41,0,3),N(41,6,2),N(48,8,2),N(43,11,2),N(46,14,2)]
   },["Root","Root","Root","Rise","Root","Root","Rise","Rise"],.8),
   piece("neon-lead",{
    Hook:[N(72,0,2),N(75,3,2),N(79,6,4),N(75,11,2),N(72,14,2)],
    Reply:[N(79,0,4),N(82,5,2),N(84,8,4),N(79,13,3)]
   },["-","Hook","Hook","Reply","-","Hook","Reply","Reply"],.47),
   piece("glass-keys",{
    Light:[...chord([60,63,67],0,6,.6),...chord([63,67,72],8,6,.63)],
    Shine:[...chord([65,68,72],0,8,.7),N(84,12,3,.67)]
   },["Light","-","Light","Shine","Light","-","Shine","Shine"],.43)
  ]
 },
 {
  id:"porchlight",name:"Porchlight",tag:"ACOUSTIC / FOLK",
  description:"Picked nylon melody, acoustic strummed harmony and organic hand percussion.",
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
  id:"floating-signals",name:"Floating Signals",tag:"AMBIENT / DRONE",
  description:"A slowly evolving texture: pads, shimmering keys and a singing theremin.",
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
  id:"broken-circuit",name:"Broken Circuit",tag:"INDUSTRIAL / SYNTH",
  description:"Rugged acidic bass, stuttering pulses, sirens and angular melodic accents.",
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
  id:"swaying-wire",name:"Swaying Wire",tag:"CINEMATIC / EXPRESSION",
  description:"Recorded steel-string cries, hollow chords and a restrained walking bass.",
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
const asNote = ([pitch,start,duration,velocity,bend])=>({
 id:id(),pitch,start,duration,velocity,...(bend?{bend:clone(bend)}:{})
});
export async function buildExample(exampleId,loadAsset){
 const example=EXAMPLES.find(entry=>entry.id===exampleId);
 if(!example)throw Error("Unknown example composition.");
 const score=create();
 score.id=id();score.title=example.name;score.bpm=example.bpm;score.bars=example.bars;
 score.instruments=[];
 const sounds=new Set();
 for(const def of example.voices){
  const sample=samplePreset(def.preset);
  const instrument=makeInstrument(score.instruments.length+1,example.bars);
  instrument.name=sample?.name||def.preset.replaceAll("-"," ");
  instrument.volume=def.volume;
  instrument.patch=sample?makeSamplerPatch(sample):makePatch(def.preset);
  instrument.chunks=Object.entries(def.pattern).map(([name,notes])=>({
   ...makeChunk(name),notes:notes.map(asNote)
  }));
  const lookup=new Map(instrument.chunks.map(chunk=>[chunk.name,chunk.id]));
  instrument.timeline=def.timeline.map(name=>name==="-"?null:lookup.get(name)??null);
  if(sample){
   // Record just the native sample voices this arrangement actually plays.
   // Each example remains editable, portable and well under the .premidi cap.
   const ids=new Set();
   const assigned=new Set(instrument.timeline.filter(Boolean));
   for(const chunk of instrument.chunks){
    if(!assigned.has(chunk.id))continue;
    for(const note of chunk.notes){
     const zone=sampleForNote(instrument.patch,note.pitch,note.velocity);
     if(zone)ids.add(zone.assetId);
    }
   }
   instrument.patch.zones=instrument.patch.zones.filter(zone=>ids.has(zone.assetId));
   for(const assetId of ids)sounds.add(assetId);
  }
  score.instruments.push(instrument);
 }
 const assets=await Promise.all([...sounds].map(loadAsset));
 score.samples=assets;
 const errors=validate(score);
 if(errors.length)throw Error("Example cannot be loaded: "+errors.join(", "));
 return score;
}
