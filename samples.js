// Licensed recordings. The manifest, not a second instrument editor, owns sources.
// All entries are CC0 1.0; SHA-1 is each upstream git *blob* checksum.
// Copies are downloaded at GitHub Pages build time to static /samples.
// Selected sources use companion audio assets, never embedded .premidi bytes.
import { GUITAR_RECORDINGS, GUITAR_PRESETS } from "./acousticGuitars.js";
import { movementDefaults } from "./expression.js";
const META="facebookincubator/Meta-open-sound";
const STARGATE="stargatedaw/stargate-sample-pack";
const VCSL="sgossner/VCSL";
export const SAMPLE_REPOS={
 [META]:"251c0be57d5d1b3242b91f53e0cde62ab1cb42d9",
 [STARGATE]:"dbfd6ec52d4ed53b60bdbea5fc6adf295127c027",
 [VCSL]:"c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e"
};
const m=(id,repo,path,sha,root,mime="audio/wav",metadata={})=>({
 id,repo,path,sha,root,mime,license:"CC0-1.0",
 licenseUrl:"https://creativecommons.org/publicdomain/zero/1.0/",
 sourceUrl:"https://github.com/"+repo+"/blob/"+SAMPLE_REPOS[repo]+"/"+path.split("/").map(encodeURIComponent).join("/"),
 ...metadata
});
export const SAMPLE_ASSETS=[
 m("piano-c3",META,"systems/instruments/meta-piano/ogg/INSPiano_Vel01_C3_01.ogg","d2a176656f06c5a16a29f0b0c14fd99d8143e095",48,"audio/ogg"),
 m("piano-c4",META,"systems/instruments/meta-piano/ogg/INSPiano_Vel01_C4_01.ogg","c2fa9485671980ff892b11e2d82264f53adfeae5",60,"audio/ogg"),
 m("nylon-c3",META,"systems/instruments/meta-nylon-guitar/ogg/INSGuitarNylon_StringA_Vel01Finger_C3_01.ogg","5f5697179fbc6fc505182c7cfe5da38a099fcd90",48,"audio/ogg"),
 m("nylon-c4",META,"systems/instruments/meta-nylon-guitar/ogg/INSGuitarNylon_StringA_Vel01Finger_C4_01.ogg","bb5b8d6dfa9b8dcc7b7f886093309803053967f8",60,"audio/ogg"),
 m("steel-c3",META,"systems/instruments/meta-steel-guitar/ogg/INSGuitarSteel_StringA_Vel01_C3_01.ogg","4a5ea03d3414499faf8fa13e8c69dac6743b7239",48,"audio/ogg"),
 m("steel-c4",META,"systems/instruments/meta-steel-guitar/ogg/INSGuitarSteel_StringA_Vel01_C4_01.ogg","24efc362c56dc3b428598ef3613b35cba94251cf",60,"audio/ogg"),
 m("kick",STARGATE,"stargate-sample-pack/freesound/drums/kick/347166__dvbeats__kick-drum-1.wav","448af31a539ab810649fbb12f062506d7056079a",60),
 m("snare",STARGATE,"stargate-sample-pack/freesound/drums/snare/212233__alexthegr81__tapesnare-5.wav","583cb7f027d2a64260126e637d82706cbcc9f2c3",60),
 m("clap",STARGATE,"stargate-sample-pack/freesound/drums/clap/448221__toxicfilmzsrsounds__hip-hop-clap.wav","63e7253c5df2e22b113e4fd9f114c4bb26746783",60),
 m("hat-closed",STARGATE,"stargate-sample-pack/freesound/drums/cymbal/closed/439766__twentytwentymusic__electronic-closed-hat-9.wav","64284c93c3a23b80f9b02bb61fe96e7d502b5cef",60),
 m("hat-open",STARGATE,"stargate-sample-pack/freesound/drums/cymbal/open/439820__twentytwentymusic__electronic-open-hat-7.wav","405e836d37030ae32f7ca1a0cdc7385c17d8861e",60),
 m("bongo",STARGATE,"stargate-sample-pack/freesound/drums/bongo/219157__jagadamba__bongo01.wav","a231d879a67d59b75a6e816ffa17b37ceefd3ffe",60),
 m("wood-snare",STARGATE,"stargate-sample-pack/freesound/drums/snare/173087__yellowtree__wood-snare-sample-3.wav","4fdb8f0b780e80a4e8e1d62b93c54f91b4864f1a",60),
 m("live-hat",STARGATE,"stargate-sample-pack/freesound/drums/cymbal/closed/339278__cabled-mess__hihat-closed-raw-03-gate-eq.wav","36bedb7a2dc6d99a1d3ea866f0bb9e128dd7324f",60),
 m("dry-rim",STARGATE,"stargate-sample-pack/freesound/drums/rimshot/455640__uberproduktion__fd808a-rimshot.wav","2481a3c01b383ad7b3dead8c4324f3026ab4cc18",60),
 m("room-crash",STARGATE,"stargate-sample-pack/freesound/drums/cymbal/crash/261413__veiler__crash.wav","af1e4b75953b6e3bc511ec013e002bfa23b239a4",60),
 m("floor-tom",STARGATE,"stargate-sample-pack/fugue-state-audio/drums/toms/sdbkit-lotom.wav","a4cb49abef7ecdf3ceaafa3b4f719489fd4e997d",60),
 m("high-tom",STARGATE,"stargate-sample-pack/fugue-state-audio/drums/toms/sdbkit-hitom.wav","5ac8dbbc4791e3a6a8499c7ea28a33ae8ea2b5b1",60),
 m("mid-tom",STARGATE,"stargate-sample-pack/fugue-state-audio/drums/toms/sdbkit-midtom.wav","2dd488e3ca598ad3267535118909208457bc9857",60),
 m("machine-kick",STARGATE,"stargate-sample-pack/fugue-state-audio/drums/kicks/sdbkit-kick.wav","750c627d1387926933b3f1174353e469c1cc8e22",60),
 m("machine-snare",STARGATE,"stargate-sample-pack/fugue-state-audio/drums/snares/sdbkit-snare.wav","428a010f42773a55d9dc65aaccc4600da01db972",60),
 m("machine-hat",STARGATE,"stargate-sample-pack/fugue-state-audio/drums/hihats/sdbkit-hatclsd.wav","9c453a1f5a704408edefa340276c6b5db78fab53",60),
 m("machine-open-hat",STARGATE,"stargate-sample-pack/fugue-state-audio/drums/hihats/sdbkit-hatopen.wav","ddeae93a7813c70bf716891343c6adebdd129909",60),
 m("hand-shaker",STARGATE,"stargate-sample-pack/fugue-state-audio/drums/percussion/x0xproc2-maracas.wav","01310159df770b7c81bd4aee1a4d9f25764b33ec",60),
 m("soft-clap",STARGATE,"stargate-sample-pack/freesound/drums/clap/493707__bastianpusch__handclap01.wav","2c75267c5195dafc3c8d04d24f9fde57c33c5730",60),
 m("recorder",VCSL,"Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Staccato/AltRecorder_Stac_C4_rr1_Main.wav","db96e84032789b062e96c08a7e616885beacce72",60),
 m("whistle",VCSL,"Aerophones/Edge-blown Aerophones/Ball Whistle/Main_BallWhistle_Short-001.wav","5d6f10fa67189231eef2a4fb72f97e19983e056b",60),
 ...GUITAR_RECORDINGS.map(item=>m(item.id,META,item.path,item.sha,item.root,"audio/ogg",
  {velocity:item.velocity,string:item.string}))
];
const sampleLibrary=[
 {id:"real-piano",name:"Recorded Piano",category:"Keys",description:"Acoustic piano recordings to shape into a bright, soft or dark keyboard sound.",assets:["piano-c3","piano-c4"],followPitch:true},
 // Variations reuse the same two verified CC0 piano recordings; no new assets
 // are embedded in .premidi files or duplicated in portable releases.
 ...GUITAR_PRESETS,
 { ...GUITAR_PRESETS.find(p=>p.id==="steel-guitar"),
   id:"steel-lap-cry",name:"Steel Guitar Upward Glide",category:"Expressive",
   description:"Recorded steel guitar with upward glide and vibrato.",
   movement:{glide:-4,glideTime:.46,depth:28,rate:5.2,delay:.37,tremolo:.07,tremoloRate:3.1}
 },
 { ...GUITAR_PRESETS.find(p=>p.id==="steel-guitar"),
   id:"steel-haunt",name:"Steel Guitar Vibrato",category:"Expressive",
   description:"Recorded steel guitar with glide, vibrato, and tremolo.",
   movement:{glide:2,glideTime:.6,depth:53,rate:6,delay:.27,tremolo:.24,tremoloRate:4.2}
 },
 { ...GUITAR_PRESETS.find(p=>p.id==="nylon-finger"),
   id:"nylon-sob",name:"Nylon Guitar Glide",category:"Expressive",
   description:"Recorded nylon guitar with downward glide and vibrato.",
   movement:{glide:-1.3,glideTime:.28,depth:21,rate:4.6,delay:.5}
 },
 {id:"wood-recorder",name:"Recorder",category:"Recorded",description:"Recorded alto recorder, short articulation.",assets:["recorder"],followPitch:true},
 {id:"ball-whistle",name:"Ball Whistle",category:"Textures",description:"Recorded ball whistle, one-shot playback.",assets:["whistle"],followPitch:false},
 {id:"acoustic-kick",name:"Kick Drum",category:"Drums",description:"Recorded kick drum, one-shot playback.",assets:["kick"],followPitch:false},
 {id:"tape-snare",name:"Tape Snare",category:"Drums",description:"Recorded snare, one-shot playback.",assets:["snare"],followPitch:false},
 {id:"hiphop-clap",name:"Hip-Hop Clap",category:"Drums",description:"Recorded clap, one-shot playback.",assets:["clap"],followPitch:false},
 {id:"tight-hat",name:"Closed Hat",category:"Drums",description:"Recorded closed hi-hat, one-shot playback.",assets:["hat-closed"],followPitch:false},
 {id:"open-hat",name:"Open Hat",category:"Drums",description:"Recorded open hi-hat, one-shot playback.",assets:["hat-open"],followPitch:false},
 {id:"hand-bongo",name:"Bongo",category:"Drums",description:"Recorded bongo, one-shot playback.",assets:["bongo"],followPitch:false},
 {id:"wood-snare",name:"Wood Snare",category:"Drums",description:"Dry natural snare hit.",assets:["wood-snare"],followPitch:false},
 {id:"live-hat",name:"Live Closed Hat",category:"Drums",description:"Dry acoustic closed hi-hat.",assets:["live-hat"],followPitch:false},
 {id:"dry-rim",name:"Dry Rimshot",category:"Drums",description:"Focused rim accent.",assets:["dry-rim"],followPitch:false},
 {id:"room-crash",name:"Room Crash",category:"Drums",description:"Acoustic cymbal crash with a natural tail.",assets:["room-crash"],followPitch:false},
 {id:"floor-tom",name:"Floor Tom",category:"Drums",description:"Deep recorded tom.",assets:["floor-tom"],followPitch:false},
 {id:"high-tom",name:"High Tom",category:"Drums",description:"Bright recorded tom.",assets:["high-tom"],followPitch:false},
 {id:"mid-tom",name:"Mid Tom",category:"Drums",description:"Middle tom for fills.",assets:["mid-tom"],followPitch:false},
 {id:"machine-kick",name:"Machine Kick",category:"Drums",description:"Short machine-style kick.",assets:["machine-kick"],followPitch:false},
 {id:"machine-snare",name:"Machine Snare",category:"Drums",description:"Compact machine-style snare.",assets:["machine-snare"],followPitch:false},
 {id:"machine-hat",name:"Machine Closed Hat",category:"Drums",description:"Tight machine-style hi-hat.",assets:["machine-hat"],followPitch:false},
 {id:"machine-open-hat",name:"Machine Open Hat",category:"Drums",description:"Longer machine-style hi-hat.",assets:["machine-open-hat"],followPitch:false},
 {id:"hand-shaker",name:"Shaker",category:"Drums",description:"Short textured shaker hit.",assets:["hand-shaker"],followPitch:false},
 {id:"soft-clap",name:"Hand Clap",category:"Drums",description:"Dry hand-clap recording.",assets:["soft-clap"],followPitch:false}
];
// One-shot samples are defined by their musical behavior, not a second ID list.
export const SAMPLE_LIBRARY=sampleLibrary.map(preset=>({...preset,trigger:preset.followPitch?"pitched":"hit"}));
export const sampleAsset=id=>SAMPLE_ASSETS.find(x=>x.id===id);
export const samplePreset=id=>SAMPLE_LIBRARY.find(x=>x.id===id);
export const sampleFile=asset=>new URL("./samples/"+asset.id+"."+(asset.mime==="audio/ogg"?"ogg":"wav"),import.meta.url).href;
export const rawUrl=asset=>"https://raw.githubusercontent.com/"+asset.repo+"/"+SAMPLE_REPOS[asset.repo]+"/"+asset.path.split("/").map(encodeURIComponent).join("/");
export function makeSamplerPatch(preset){
 return {
  type:"sample",presetId:preset.id,
  zones:preset.assets.map(id=>{
   const asset=sampleAsset(id);
   return {assetId:id,root:asset.root,
    ...(asset.velocity===undefined?{}:{velocity:asset.velocity}),
    ...(asset.string===undefined?{}:{string:asset.string})};
  }),
  followPitch:preset.followPitch,oneShot:preset.trigger==="hit",transpose:0,
  gain:preset.gain??.9,attack:preset.attack??.005,release:preset.release??.17,
  pan:0,strumMs:preset.strumMs??0,preserveDynamics:preset.preserveDynamics??false,
  movement:{...movementDefaults,...(preset.movement||{})},
  ...(preset.filter?{filter:{...preset.filter}}:{}),
  ...(preset.drive===undefined?{}:{drive:preset.drive}),
  bend:{shape:"straight",amount:2,rate:4}
 };
}
