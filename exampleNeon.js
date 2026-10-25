// Native example with layered synth and sample percussion, sustained bass and pitch movement.
// The instrument definitions build ordinary editable chunks, rack rows and patches.
const N=(pitch,start,duration=2,velocity=.8,bend)=>[pitch,start,duration,velocity,bend];
const C=(pitches,velocity=.64)=>pitches.map(pitch=>N(pitch,0,16,velocity));
const H=(row,start,velocity=.8)=>[row,start,velocity];
const run=(row,steps,velocity=.7)=>steps.map((start,index)=>H(row,start,Math.max(.12,velocity-(index%2)*.09)));

// Each pattern is one bar. The rack has nine independently editable sound rows.
const drumPatterns={
 Signal:[
  H("pulse",0,.64),H("impact",0,.63),H("closed",8,.26),H("metal",14,.46)
 ],
 Pressure:[
  ...run("pulse",[0,8],.78),H("impact",0,.72),H("snare",12,.38),
  ...run("closed",[2,6,10,14],.41),H("metal",15,.4)
 ],
 Stalker:[
  ...run("pulse",[0,7,10],.82),...run("impact",[0,10],.72),
  H("snare",8,.78),H("tape",8,.62),
  ...run("closed",[0,2,4,6,8,10,12,14],.48),
  ...run("dust",[3,11,15],.34),H("clap",8,.33)
 ],
 Drive:[
  ...run("pulse",[0,4,8,12],.92),...run("impact",[0,8,12],.77),
  ...run("snare",[4,12],.86),H("tape",12,.76),H("clap",12,.68),
  ...run("closed",[0,2,4,6,8,10,12,14],.59),
  ...run("dust",[3,7,11,15],.44),H("open",14,.48)
 ],
 Impact:[
  ...run("pulse",[0,4,7,8,12],.96),...run("impact",[0,4,8,12],.85),
  ...run("snare",[4,12],.94),...run("tape",[4,12],.64),
  ...run("clap",[4,12],.78),
  ...run("closed",[0,2,4,6,8,10,12,14],.58),
  ...run("dust",[1,5,9,13,15],.43),H("open",14,.52),
  H("metal",15,.49)
 ],
 Fill:[
  ...run("pulse",[0,4,8,11,13],.95),...run("impact",[0,8,13],.8),
  ...run("snare",[4,12,14,15],.88),H("tape",12,.76),H("clap",12,.65),
  ...run("closed",[0,2,4,6,8,10,12,14],.62),
  ...run("dust",[9,11,12,13,14,15],.47),H("open",14,.5),
  H("metal",15,.68)
 ],
 Vacuum:[
  H("pulse",0,.41),H("metal",14,.34)
 ],
 Ghost:[
  ...run("pulse",[0,10],.65),H("impact",0,.58),H("snare",12,.42),
  ...run("closed",[2,6,10,14],.32),H("metal",15,.48)
 ],
 Pursuit:[
  ...run("pulse",[0,3,7,8,11,12],.93),...run("impact",[0,7,12],.78),
  ...run("snare",[4,12],.9),...run("tape",[4,12],.6),
  H("clap",12,.79),
  ...run("closed",[0,2,4,6,8,10,12,14],.62),
  ...run("dust",[1,3,5,7,9,11,13,15],.46),
  H("open",14,.52)
 ],
 Chase:[
  ...run("pulse",[0,3,6,8,11,12,14],.98),
  ...run("impact",[0,6,8,12],.87),
  ...run("snare",[4,12,14,15],.91),...run("tape",[4,12],.74),
  ...run("clap",[4,12],.81),
  ...run("closed",[0,2,4,6,8,10,12,14],.65),
  ...run("dust",[1,3,5,7,9,11,13,15],.49),
  H("open",14,.55),H("metal",15,.8)
 ],
 Out:[
  H("pulse",0,.95),H("impact",0,.84),H("snare",8,.57),
  H("open",12,.45),H("metal",15,.35)
 ]
};

export const NEON_AFTER_HOURS={
 id:"neon-after-hours",name:"Drum Rack and Bass",tag:"SYNTH / SAMPLE RACK",
 description:"Nine-sound drum rack with recorded and synthesized hits, sustained sub-bass, and multiple timeline sections.",
 bpm:108,bars:16,accent:"#08e4ec",
 voices:[
  {
   name:"Drum rack · nine sounds",volume:.88,
   rack:[
    {key:"pulse",preset:"pulse-kick",name:"Synth kick",gain:.84,
     tone:{filter:{cutoff:700},envelope:{decay:.17,release:.17},effects:{drive:.47}}},
    {key:"impact",preset:"acoustic-kick",name:"Recorded kick",gain:.72,
     tone:{gain:.93,pan:-.04}},
    {key:"snare",preset:"static-snare",name:"Synth noise snare",gain:.63,
     tone:{noise:.94,filter:{cutoff:1000},envelope:{decay:.14},effects:{drive:.23},pan:-.07}},
    {key:"tape",preset:"tape-snare",name:"Recorded snare",gain:.54,
     tone:{gain:.86,pan:.12}},
    {key:"clap",preset:"hiphop-clap",name:"Recorded clap",gain:.52,
     tone:{gain:.87,pan:.28}},
    {key:"closed",preset:"tight-hat",name:"Closed hi-hat",gain:.39,
     tone:{gain:.7,pan:-.3}},
    {key:"dust",preset:"dust-hat",name:"Synth hi-hat",gain:.33,
     tone:{filter:{cutoff:8000},pan:.3}},
    {key:"open",preset:"open-hat",name:"Open hi-hat",gain:.38,
     tone:{gain:.72,pan:.21}},
    {key:"metal",preset:"signal-bell",name:"Sine bell",gain:.27,referencePitch:84,
     tone:{envelope:{attack:.002,decay:.12,sustain:0,release:.23},
      effects:{delayMix:.25,delayTime:.2,delayFeedback:.28},pan:.38}}
   ],
   pattern:drumPatterns,
   timeline:["Signal","Pressure","Stalker","Stalker",
    "Drive","Impact","Drive","Fill","Vacuum","Ghost",
    "Pursuit","Pursuit","Impact","Drive","Chase","Out"]
  },
  {
   preset:"sub-current",name:"Sustained sub-bass",volume:.85,
   tone:{oscillators:[{wave:"sine",level:1,octave:-1,detune:0},
     {wave:"triangle",level:.3,octave:0,detune:0}],
    filter:{cutoff:680},envelope:{attack:.065,decay:.15,sustain:.94,release:.58},
    effects:{drive:.12}},
   pattern:{
    E:[N(40,0,16,.94)],C:[N(48,0,16,.89)],
    D:[N(38,0,16,.91)],B:[N(47,0,16,.83)],
    Return:[N(40,0,12,.9),N(47,12,4,.67)]
   },
   timeline:["E","E","E","E","C","C","D","D",
    "E","E","C","C","D","D","B","Return"]
  },
  {
   preset:"rubber-bass",name:"Short-note bass",volume:.54,
   tone:{filter:{cutoff:1250,resonance:3.1},effects:{drive:.29},
    envelope:{attack:.008,decay:.16,sustain:.57,release:.16}},
   pattern:{
    Stalk:[N(52,0,3,.55),N(59,11,2,.46)],
    E:[N(52,0,3,.84),N(52,6,2,.69),N(59,10,2,.79),N(55,14,2,.71)],
    C:[N(48,0,3,.82),N(55,7,2,.66),N(60,10,2,.77),N(55,14,2,.72)],
    D:[N(50,0,3,.83),N(57,6,2,.71),N(62,10,2,.79),N(57,14,2,.7)],
    Chase:[N(52,0,2,.85),N(59,3,2,.65),N(52,6,2,.85),
     N(55,9,2,.72),N(59,12,2,.83),N(52,14,2,.9)],
    B:[N(47,0,4,.8),N(54,6,2,.77),N(59,10,3,.85)]
   },
   timeline:["-","-","Stalk","Stalk","C","C","D","D",
    "-","Stalk","C","C","D","E","B","Chase"]
  },
  {
   preset:"violet-pad",name:"Chord pad",volume:.39,
   tone:{filter:{cutoff:1800,sweep:-.36,sweepTime:1.4},
    envelope:{attack:.54,decay:.6,sustain:.73,release:1.45},
    effects:{delayMix:.25,delayTime:.44,delayFeedback:.3}},
   pattern:{
    Em9:C([52,59,66,67],.62),
    Cmaj7:C([48,55,59,66],.61),
    Dsus:C([50,57,62,69],.61),
    Bm:C([47,54,59,62],.67)
   },
   timeline:["Em9","Em9","Em9","Em9","Cmaj7","Cmaj7","Dsus","Dsus",
    "Em9","Em9","Cmaj7","Cmaj7","Dsus","Dsus","Bm","Em9"]
  },
  {
   preset:"tape-strings",name:"String pad",volume:.25,
   tone:{filter:{cutoff:1600},effects:{delayMix:.27,delayTime:.41}},
   pattern:{
    Fog:[N(71,0,16,.45),N(78,0,16,.28)],
    Lift:[N(74,0,16,.53),N(81,0,16,.29)],
    Blackout:[N(76,0,16,.37)],
    Threat:[N(78,0,16,.51),N(83,0,16,.28)]
   },
   timeline:["Fog","Fog","Fog","Fog","Lift","Lift","Threat","Threat",
    "Blackout","Blackout","Lift","Lift","Threat","Threat","Fog","Blackout"]
  },
  {
   preset:"neon-lead",name:"Synth lead",volume:.42,
   tone:{filter:{cutoff:2800},effects:{drive:.25,delayMix:.26,delayTime:.3,delayFeedback:.34},
    envelope:{attack:.02,decay:.15,sustain:.67,release:.3}},
   pattern:{
    Call:[N(76,0,2,.9),N(76,8,2,.9)],
    Answer:[N(83,0,5,.87),N(79,12,4,.77),N(81,8,1,.9)],
    Rise:[N(76,0,2,.73),N(78,3,2,.75),N(79,6,3,.8),N(83,10,6,.93)],
    Final:[N(83,0,6,.9),N(78,8,3,.73),N(76,12,4,.84)]
   },
   timeline:["Call","-","-","Call","Answer","Call","Rise","Answer",
    "-","-","Call","Answer","Call","Rise","Answer","Final"]
  },
  {
   preset:"glass-keys",name:"Sine keys",volume:.3,
   tone:{filter:{cutoff:8100},effects:{delayMix:.32,delayTime:.24,delayFeedback:.35},
    pan:-.18},
   pattern:{
    Spark:[N(83,0,2,.45),N(79,5,2,.42),N(86,11,3,.51)],
    Falling:[N(88,2,2,.52),N(83,6,3,.46),N(79,12,2,.39)],
    Rush:[N(76,0,2,.48),N(79,3,2,.53),N(83,6,2,.48),
     N(86,9,2,.6),N(88,12,4,.65)]
   },
   timeline:["Spark","-","Spark","Falling","Spark","Falling","Spark","Rush",
    "-","Spark","Falling","Rush","Spark","Falling","Rush","Spark"]
  },
  {
   preset:"broken-siren",name:"Pitch-modulated siren",volume:.29,
   tone:{filter:{cutoff:1050,resonance:3.5},effects:{delayMix:.33,delayTime:.39},
    pan:.22},
   pattern:{
    Far:[N(67,2,12,.49,{shape:"wail",amount:1.5,rate:3.2})],
    Near:[N(71,0,15,.73,{shape:"rise",amount:3.1,rate:3.6})],
    Retreat:[N(69,1,13,.55,{shape:"fall",amount:2.8,rate:4})]
   },
   timeline:["-","Far","-","Retreat","-","Near","-","Near",
    "Far","-","Retreat","-","Near","-","Near","Retreat"]
  }
 ]
};
