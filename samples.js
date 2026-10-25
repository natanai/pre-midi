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
 m("recorder",VCSL,"Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Staccato/AltRecorder_Stac_C4_rr1_Main.wav","db96e84032789b062e96c08a7e616885beacce72",60),
 m("whistle",VCSL,"Aerophones/Edge-blown Aerophones/Ball Whistle/Main_BallWhistle_Short-001.wav","5d6f10fa67189231eef2a4fb72f97e19983e056b",60),
 ...GUITAR_RECORDINGS.map(item=>m(item.id,META,item.path,item.sha,item.root,"audio/ogg",
  {velocity:item.velocity,string:item.string}))
];
const sampleLibrary=[
 {id:"real-piano",name:"Recorded Piano",category:"Recorded",description:"Piano samples at C3 and C4.",assets:["piano-c3","piano-c4"],followPitch:true},
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
 {id:"hand-bongo",name:"Bongo",category:"Drums",description:"Recorded bongo, one-shot playback.",assets:["bongo"],followPitch:false}
];
const hitPresets=new Set(["ball-whistle","acoustic-kick","tape-snare","hiphop-clap","tight-hat","open-hat","hand-bongo"]);
export const SAMPLE_LIBRARY=sampleLibrary.map(preset=>({...preset,trigger:hitPresets.has(preset.id)?"hit":"pitched"}));
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
  bend:{shape:"straight",amount:2,rate:4}
 };
}
