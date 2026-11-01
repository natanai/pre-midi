// Factory drum racks are ordinary editable rack instruments.
// Each row points at an independently licensed sample or native synth patch;
// the .premidi format retains the same external-asset references.
import {makeSound} from "./schema.js";
import {SAMPLE_LIBRARY,makeSamplerPatch} from "./samples.js";
import {makePatch} from "./synth.js";

const recorded=new Map(SAMPLE_LIBRARY.filter(p=>p.trigger==="hit").map(p=>[p.id,p]));
function hit(presetId,name,gain=1,options={}){
 const preset=recorded.get(presetId);
 if(!preset)throw Error("Unknown factory drum recording: "+presetId);
 const patch=makeSamplerPatch(preset);
 if(options.filter)patch.filter={...options.filter};
 if(options.drive!==undefined)patch.drive=options.drive;
 const sound=makeSound(name,patch,"hit");
 sound.gain=gain;
 return sound;
}
function synthHit(presetId,name,gain=1){
 const sound=makeSound(name,makePatch(presetId),"hit");
 sound.gain=gain;
 return sound;
}
const rack=(id,name,description,sounds,volume=.74)=>({
 id,name,description,category:"Drums",layout:"rack",sounds,volume,
 // The browser keeps a full rack's sampled assets separate from its notes.
});

export const DRUM_RACKS=[
 rack("room-drum-rack","Warm Room Kit",
  "Natural kick, snare, cymbals and toms for intimate indie-rock grooves.",[
   hit("acoustic-kick","Kick",.84),
   hit("wood-snare","Wood snare",.78),
   hit("tape-snare","Soft snare",.57),
   hit("live-hat","Closed hat",.58),
   hit("open-hat","Open hat",.45),
   hit("dry-rim","Rim",.55),
   hit("floor-tom","Floor tom",.68),
   hit("mid-tom","Mid tom",.66),
   hit("high-tom","High tom",.65),
   hit("room-crash","Crash",.43),
   hit("hand-shaker","Shaker",.34)
  ],.75),
 rack("night-drive-drum-rack","Night Drive Kit",
  "Firm machine pulse and wide backbeat with acoustic accents.",[
   hit("machine-kick","Machine kick",.88),
   hit("machine-snare","Machine snare",.77),
   hit("machine-hat","Closed machine hat",.54),
   hit("machine-open-hat","Open machine hat",.42),
   hit("soft-clap","Hand clap",.6),
   hit("dry-rim","Rim accent",.48),
   hit("hand-bongo","Bongo",.48),
   hit("floor-tom","Floor tom",.53),
   hit("room-crash","Crash",.32),
   synthHit("dust-hat","Noise hat",.28)
  ],.7),
 rack("distant-static-drum-rack","Distant Static Kit",
  "Tight layered live and electronic hits for restrained, textured rhythms.",[
   hit("acoustic-kick","Recorded kick",.7),
   synthHit("pulse-kick","Sub kick",.4),
   hit("tape-snare","Tape snare",.69),
   hit("hiphop-clap","Layered clap",.43),
   hit("tight-hat","Closed hat",.46),
   hit("hand-shaker","Shaker",.36),
   hit("machine-kick","Machine kick",.51),
   hit("machine-snare","Machine snare",.55),
   hit("high-tom","High tom",.48),
   hit("soft-clap","Hand clap",.4),
   hit("room-crash","Crash",.3)
  ],.74)
];
