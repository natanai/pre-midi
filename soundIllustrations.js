// Reusable illustrations for the existing sound controls. These are teaching
// diagrams, not an alternate audio engine or a second source of patch state.
import {movement,pitchCents,BEND_SHAPES} from "./expression.js";
import {harmonicWave,harmonicRecipe} from "./harmonics.js";
import {DEFAULT_SAMPLE_FILTER,driveCurve} from "./audioEffects.js";
import {routeValueAt,MOD_TARGETS,MOD_SOURCES,defaultSource} from "./src/dsp/modulation.js";
import {assignSoundEdit} from "./soundEditPath.js";
import {cutoffAt} from "./src/dsp/automation.js";
import {WAVES,FILTERS} from "./synth.js";

const NS="http://www.w3.org/2000/svg";
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const at=(patch,path)=>path.reduce((value,key)=>value?.[key],patch);
const axisValue=(patch,path)=>{
 const value=at(patch,path);
 if(typeof value==="number"&&Number.isFinite(value))return value;
 if((patch.type==="sample"||patch.type==="vocal")&&path[0]==="filter")
  return DEFAULT_SAMPLE_FILTER[path[1]]??0;
 if(path[0]==="drive")return 0;
 if(path[0]==="bend")return path[1]==="amount"?2:4;
 if(path.join(".")==="movement.glideTime")return .3;
 return 0;
};
const shortValue=value=>Math.abs(value)>=100?String(Math.round(value)):
 String(Number(value.toFixed(3)));
// Explain actual graph axes without changing the project's existing dial hints.
const axisReadout=(axis,value)=>{
 const dimension=axis.mode.endsWith("X")?"x ":"y ";
 const formatted=axis.unit==="percent"?shortValue(value*100)+"%":
  axis.unit==="pan"?(value===0?"center":shortValue(Math.abs(value)*100)+
   "% "+(value<0?"left":"right")):
  shortValue(value)+(axis.unit?" "+axis.unit:"");
 return dimension+axis.path.at(-1)+" "+formatted;
};
const axisDirection=axis=>{
 const horizontal=axis.mode.endsWith("X");
 const increase=horizontal?(axis.to>axis.from?"right":"left"):
  (axis.to<axis.from?"up":"down");
 return (horizontal?"left/right":"up/down")+": "+increase+
  " increases "+axis.path.at(-1);
};
const cloneEdit=(patch,path,value)=>{
 const next=structuredClone(patch);let owner=next;
 for(const key of path.slice(0,-1))owner=owner[key]??={};
 owner[path.at(-1)]=value;return next;
};
const svgNode=(name,attrs={},content="")=>{
 const element=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attrs))element.setAttribute(key,String(value));
 if(content)element.textContent=content;
 return element;
};
function waveAt(type,phase,harmonics){
 const x=((phase/(Math.PI*2))%1+1)%1;
 if(type==="square")return x<.5?1:-1;
 if(type==="triangle")return 1-4*Math.abs(x-.5);
 if(type==="sawtooth")return x*2-1;
 if(type==="harmonic")return harmonicWave(harmonics??[1],phase);
 return Math.sin(phase);
}
const pathFrom=points=>points.map(([x,y],i)=>(i?"L":"M")+x.toFixed(2)+" "+y.toFixed(2)).join(" ");
const pathRange=(count,fn)=>pathFrom(Array.from({length:count},(_,i)=>fn(i/(count-1))));
// Each page has one legible concept. Detail pages expose every existing knob
// without reducing, moving, or duplicating the underlying controls.
export function diagramPageCount(patch,type){
 // A pitched Instrument has three real stage controls but only two drawing
 // axes at a time. Preserve the stereo/volume lesson and add a second
 // volume/sound-level lesson instead of leaving Sound gain knob-only.
 if(type==="stage")return patch.layout==="rack"||patch.layout==="levels"?1:2;
 if(type==="mapping")return Math.max(1,Math.ceil((patch.zones?.length??0)/4));
 if(type==="modulation"){
  const routes=patch.modulation?.routes??[];
  return Math.max(1,Math.ceil(routes.length/4))+routes.length;
 }
 if(type==="filter")return 2;
 if(type==="movement")return 3;
 if(type==="sample")return 2;
 if(type==="automation")return 1;
 if(type.startsWith("harmonics"))return 4;
 return 1;
}
// Diagrams respond to canonical parameters; the measured scope is separate.
export const diagram=(patch,type,page=0)=>{
 const color=type==="movement"?"var(--signal-mauve)":"var(--track-accent,#08e4ec)";
 const paths=[],handles=[],labels=[],actions=[];
 const action=(x,y,path,choices,label)=>actions.push({x,y,path,choices,label});
 const line=(d,secondary=false,links=[])=>paths.push({d,secondary,links});
 const tag=(x,y,value)=>labels.push({x,y,value});
 const handle=(x,y,axes,label)=>handles.push({x,y,axes,label});
 const axis=(path,min,max,mode,options={})=>({path,min,max,mode,...options});
 const p=patch;
 if(type==="stage"){
  // The overview's measured waveform remains factual PCM. This separate
  // explanatory field makes the level knobs directly editable.
  const rack=p.layout==="rack",levels=rack||p.layout==="levels"||page===1,
   volume=clamp(p.volume??1),gain=clamp(p.gain??1),
   pan=clamp(p.pan??0,-1,1);
  // Beat stereo edits pan/volume; freeform's two directly visible level
  // knobs instead edit instrument volume and Sound gain. Both are genuine
  // signal stages and their product determines the measured waveform level.
  const x=levels?24+312*volume:24+312*(pan+1)/2;
  const y=100-70*(levels?gain:volume);
  line("M24 100 H336 M24 27 H336 M180 22 V100",true);
  line("M"+x.toFixed(2)+" 25 V100 M24 "+y.toFixed(2)+" H336",
   true,levels?["volume","gain"]:["pan","volume"]);
  handle(x,y,levels?[
   axis(["volume"],0,1,"linearX",{from:24,to:336,step:.01,unit:"percent"}),
   axis(["gain"],0,1,"linearY",{from:100,to:30,step:.01,unit:"percent"})
  ]:[
   axis(["pan"],-1,1,"linearX",{from:24,to:336,step:.01,unit:"pan"}),
   axis(["volume"],0,1,"linearY",{from:100,to:30,step:.01,unit:"percent"})
  ],levels?(rack?"rack level / selected sound level":"instrument level / sound level"):
   "stereo position / instrument level");
  tag(18,14,levels?"sound level ↑":"instrument level ↑");
  tag(18,112,rack?"quiet rack":levels?"quiet instrument":"left");
  tag(290,112,rack?"loud rack":levels?"loud instrument":"right");
  if(levels)tag(265,15,"total "+Math.round(100*volume*gain)+"%");
 }else if(type==="automation"){
  const total=Math.max(1,(p.bars??1)*16);
  const frequencyY=value=>98-72*clamp(Math.log(Math.max(50,value)/50)/Math.log(280));
  line("M18 103 H342 M18 20 V103",true);
  line(pathRange(240,t=>[18+324*t,frequencyY(cutoffAt(p,t*total,p.points[0].value))]),
   false,["points.0.step","points.0.value","points.1.step","points.1.value"]);
  for(const [index,point] of p.points.entries()){
   const x=18+324*clamp(point.step/total),y=frequencyY(point.value);
   line("M"+x.toFixed(2)+" 102 V"+y.toFixed(2),true,
    ["points."+index+".step","points."+index+".value"]);
   handle(x,y,[
    axis(["points",index,"step"],0,total,"linearX",{from:18,to:342,step:1,unit:"step",
     ...(index===0?{hardMax:p.points[1].step-1}:{hardMin:p.points[0].step+1})}),
    axis(["points",index,"value"],50,14000,"logY",{from:98,to:26,step:1,unit:"Hz"})
   ],(index===0?"start":"end")+" position / brightness");
   tag(x+4,Math.max(16,y-8),index===0?"start":"end");
  }
  tag(18,14,"high");tag(18,111,"low");tag(278,112,"bar →");
 }else if(type.startsWith("harmonics")){
  const index=Number(type.replace("harmonics","")),slot=p.oscillators[index];
  const harmonicValues=slot?.harmonics??harmonicRecipe();
  line("M18 50 H342 M18 100 H342",true);
  line(pathRange(256,t=>[18+t*324,32-17*harmonicWave(harmonicValues,2*Math.PI*t)]),
   false,["oscillators."+index+".harmonics"]);
  const start=clamp(page,0,3)*8;
  for(let j=0;j<8;j++){
   const n=start+j,x=37+j*41,value=clamp(harmonicValues[n]??0);
   line("M"+x+" 100 V"+(100-41*value).toFixed(2),false,
    ["oscillators."+index+".harmonics."+n]);
   handle(x,100-41*value,[
    axis(["oscillators",index,"harmonics",n],0,1,"linearY",{from:100,to:59,step:.01,unit:"percent"})
   ],"harmonic "+(n+1)+" level");
   tag(x-8,111,"h"+(n+1));
  }
  tag(18,12,"waveform · 32 harmonics");
 }else if(type==="oscillators"){
  const slots=p.oscillators;
  const second=Number(slots?.[1]?.level)>0||
   (p.modulation?.routes??[]).some(route=>route.target==="oscillators.1.level");
  const enabled=second?[0,1]:[0];
  const voice=(i,t)=>{const o=slots[i],phase=t*10*Math.PI*2**o.octave*2**(o.detune/1200);
   return (o.level||0)*waveAt(o.wave,phase,o.harmonics);};
  const sourceKeys=i=>["wave","octave","detune","harmonics","level"].map(k=>"oscillators."+i+"."+k);
  const norm=Math.max(1,enabled.reduce((sum,i)=>sum+Math.max(0,slots[i].level),0));
  line("M18 29 H342",true);
  line(pathRange(320,t=>[18+324*t,29-16*enabled.reduce((sum,i)=>sum+voice(i,t),0)/norm]),
   false,enabled.flatMap(sourceKeys));
  tag(18,12,"mix");
  for(const index of enabled){
   const o=slots[index],center=second?(index===0?62:95):79,amplitude=11;
   line("M18 "+center+" H342",true);
   line(pathRange(280,t=>[18+324*t,center-amplitude*voice(index,t)]),
    index===1,sourceKeys(index));
   const bottom=center+amplitude,top=center-amplitude;
   handle(38+clamp((o.detune+100)/200)*278,bottom-(bottom-top)*clamp(o.level),[
    axis(["oscillators",index,"detune"],-100,100,"linearX",{from:38,to:316,step:1}),
    axis(["oscillators",index,"level"],0,1,"linearY",{from:bottom,to:top,step:.01})
   ],"oscillator "+(index+1)+" detune / level");
   tag(18,center-14,"osc "+(index+1));
  }
  tag(296,12,"detune");
  // A silent second oscillator has no waveform or conventional dial in the
  // collapsed editor. Its illustration must still be able to bring it in,
  // using the same canonical level value as the existing add/remove buttons.
  // Setting the base level to zero does not erase modulation routes.
  action(311,second?95:80,["oscillators",1,"level"],
   [0,slots[1].level>0?slots[1].level:.25],
   "oscillator 2 base level");
  for(const index of enabled){
   action(60,second?(index===0?57:90):80,["oscillators",index,"wave"],WAVES,"wave "+(index+1));
   action(252,second?(index===0?57:90):80,["oscillators",index,"octave"],[-2,-1,0,1,2],"octave "+(index+1));
  }
 }else if(type.startsWith("oscillator")){
  const index=Number(type.slice(-1))-1,o=p.oscillators[index];
  const cutoff=clamp(Math.log(Math.max(50,p.filter.cutoff)/50)/Math.log(280));
  const drive=p.effects.drive||0;
  line("M12 60 H348",true);
  line(pathRange(320,t=>{
   const phase=t*10*Math.PI*2**(o.octave*.35)*2**(o.detune/1200);
   const wave=waveAt(o.wave,phase,o.harmonics);
   const softened=cutoff*.9+.1;
   const shaped=wave*softened+Math.sin(phase)*(1-softened);
   return [12+t*336,60-39*o.level*Math.tanh(shaped*(1+drive*4))];
  }));
  handle(35+(o.detune+100)/200*289,60-38*o.level,[
   axis(["oscillators",index,"detune"],-100,100,"linearX",{from:35,to:324,step:1}),
   axis(["oscillators",index,"level"],0,1,"linearY",{from:60,to:22,step:.01})
  ],"detune / level");
  tag(14,14,"detune →");tag(294,14,"level ↑");
 }else if(type==="filter"&&page===1){
  if(p.type==="sample"||p.type==="vocal"){
   const transfer=driveCurve(p.drive??0);
   line("M20 100 H342 M180 16 V100",true);
   line(pathRange(240,t=>[22+316*t,57-38*transfer[Math.round(t*(transfer.length-1))]]),
    false,["drive"]);
   handle(292,99-72*(p.drive??0),[
    axis(["drive"],0,1,"linearY",{from:99,to:27,step:.01})
   ],"recorded sound distortion");
   tag(18,13,"shaping");tag(285,13,"drive ↑");
  }else{
   const f=p.filter,sweep=f.sweep??0,time=f.sweepTime??.2;
   const noise=clamp(p.noise??0),decay=clamp(p.noiseDecay??0,0,4);
   line("M26 68 H164 M193 100 H341",true);
   // On this diagram time really is horizontal and the starting cutoff
   // deviation really is vertical, just as the two-axis handle suggests.
   const finish=26+138*clamp((time-.01)/2.99),startY=68-6*sweep;
   line("M26 "+startY.toFixed(2)+" L"+finish.toFixed(2)+" 68 H164",
    false,["filter.sweep","filter.sweepTime"]);
   line("M26 "+startY.toFixed(2)+" H"+finish.toFixed(2)+" V68",
    true,["filter.sweep","filter.sweepTime"]);
   handle(finish,startY,[
    axis(["filter","sweepTime"],.01,3,"linearX",{from:26,to:164,step:.01,unit:"s"}),
    axis(["filter","sweep"],-5,5,"linearY",{from:98,to:38,step:.1,unit:"oct"})
   ],"filter sweep duration / starting brightness");
   line(pathRange(160,t=>[193+148*t,100-
    34*noise*Math.exp(-t*3.5/(.12+decay))*
    Math.sin(t*83)*Math.cos(t*9)]),false,["noise","noiseDecay"]);
   handle(197+clamp(decay/4)*137,100-noise*39,[
    axis(["noiseDecay"],0,4,"linearX",{from:197,to:334,step:.01,unit:"s"}),
    axis(["noise"],0,1,"linearY",{from:100,to:61,step:.01,unit:"percent"})
   ],"noise duration / level");
   tag(24,17,"filter sweep");tag(195,17,"noise");
   tag(22,111,"time →");tag(281,111,"decay →");
  }
 }else if(type==="filter"){
  if(p.type==="vocal"&&p.audioFilterBypassed){
   // Preserve the vocal editor's existing neutral bypass representation.
   line("M18 95 H344 M18 22 V95",true);
   line("M18 35 H342",false,["filter.type"]);
   tag(18,14,"off");tag(304,110,"dry");
   action(122,61,["audioFilterBypassed"],[true,false],"turn filter on");
  }else{
  const f=p.filter||((p.type==="sample"||p.type==="vocal")?DEFAULT_SAMPLE_FILTER:
   {type:"lowpass",cutoff:8000,resonance:1});
  const freq=x=>50*280**((x-18)/324);
  const cutoff=clamp(Math.log(Math.max(50,f.cutoff)/50)/Math.log(280));
  const x=18+cutoff*324,r=clamp((f.resonance-.1)/15.9);
  const base=f.type==="bandpass"?1:f.type==="notch"?0:.5;
  const response=x=>{
   const delta=Math.log2(freq(x)/Math.max(50,f.cutoff));
   const low=1/(1+Math.exp(delta*2.6));
   const level=f.type==="highpass"?1-low:f.type==="bandpass"?4*low*(1-low):
    f.type==="notch"?1-4*low*(1-low):low;
   return clamp(level+Math.exp(-delta*delta*4)*r*(25/60),0,1.5);
  };
  line("M18 95 H344 M18 22 V95",true);
  line(pathRange(300,t=>{const px=18+t*324;return [px,95-60*response(px)];}),false,["filter.cutoff","filter.resonance","filter.type"]);
  line("M"+x.toFixed(2)+" 97 V19",true);
  handle(x,95-60*base-25*r,[
   axis(["filter","cutoff"],50,14000,"logX",{from:18,to:342,step:1,unit:"Hz"}),
   axis(["filter","resonance"],.1,16,"linearY",{from:95-60*base,to:95-60*base-25,step:.1})
  ],"cutoff / resonance");
  tag(18,15,"low");tag(308,15,"high");
  action(90,103,["filter","type"],FILTERS,"filter shape");
  if(p.type==="vocal")
   action(189,103,["audioFilterBypassed"],[false,true],"turn filter off");
  if(p.type==="sample"||p.type==="vocal"){
   const transfer=driveCurve(p.drive??0);
   line(pathRange(121,t=>[205+t*123,99-13*transfer[Math.round(t*(transfer.length-1))]]),true,["drive"]);
   tag(217,110,"drive");
  }else{
   const sweep=f.sweep??0,sweepTime=f.sweepTime??.2;
   const startCutoff=clamp(f.cutoff*2**sweep,50,14000);
   const startX=18+clamp(Math.log(startCutoff/50)/Math.log(280))*324;
   const stopX=18+clamp(Math.log(f.cutoff/50)/Math.log(280))*324;
   const timeY=26+clamp(sweepTime/3)*54;
   // The line represents the cutoff's actual start/end and sweep duration.
   if(sweep!==0){
    line(pathFrom([[startX,26],[startX+(stopX-startX)*.5,timeY*.65+14],[stopX,timeY]]),true,["filter.sweep","filter.sweepTime"]);
    tag(clamp(startX+5,24,295),23,"sweep");
   }
   // Noise is unpitched, so show a decaying irregular signal.
   const noise=clamp(p.noise??0),decay=clamp((p.noiseDecay??0)/4);
   if(noise>0){
    line(pathRange(110,t=>[18+140*t,99-14*noise*
     (1-t)**(1.5+6*(1-decay))*Math.sin(t*67)*Math.cos(t*17)]),true,["noise","noiseDecay"]);
    tag(18,111,"noise");
   }
  }
  }
 }else if(type==="envelope"||(type==="sample"&&page===0)){
  const sample=type==="sample",e=sample?
   {attack:p.attack??0,decay:0,sustain:1,release:p.release??.2}:p.envelope;
  const attackMax=sample?2:3,releaseMax=sample?3:4;
  const attackX=25+clamp(e.attack/attackMax)*78;
  const decayX=attackX+18+clamp(e.decay/3)*80;
  const sustainY=88-65*clamp(e.sustain);
  const releaseX=248+clamp(e.release/releaseMax)*95;
  line("M18 90 H348 M248 18 V96",true);
  line(pathFrom([[18,90],[attackX,23],[decayX,sustainY],[248,sustainY],[releaseX,90],[348,90]]),false,sample?["attack","release"]:["envelope.attack","envelope.decay","envelope.sustain","envelope.release"]);
  const prefix=sample?[]:["envelope"];
  handle(attackX,23,[axis([...prefix,"attack"],0,attackMax,"linearX",{from:25,to:103,step:.01,unit:"s"})],"attack");
  if(!sample){
   handle(decayX,sustainY,[
    axis(["envelope","decay"],0,3,"linearX",{from:attackX+18,to:attackX+98,step:.01,unit:"s"}),
    axis(["envelope","sustain"],0,1,"linearY",{from:88,to:23,step:.01,unit:"percent"})
   ],"decay / sustain");
  }
  handle(releaseX,90,[axis([...prefix,"release"],.01,releaseMax,"linearX",
   {from:248,to:343,step:.01,unit:"s"})],"release");
  tag(18,14,"on");tag(248,14,"off");
  if(sample){
   const gain=clamp(p.gain??.9,0,2),transpose=p.transpose??0,pan=p.pan??0;
   const vocal=p.type==="vocal",strum=p.strumMs??0,root=p.zones?.[0]?.root??60;
   const pitchFollow=p.followPitch!==false,oneShot=!!p.oneShot,dynamics=!!p.preserveDynamics;
   line("M20 "+(112-9*gain).toFixed(2)+" H150",true,["gain"]);
   line("M173 "+(105-6*transpose/12).toFixed(2)+" H252",true,
    vocal?["transpose"]:["transpose","followPitch"]);
   line("M274 104 H340 M"+(307+30*pan).toFixed(2)+" 98 V110",true,["pan"]);
   tag(19,110,"level");tag(171,110,vocal?"voice":(pitchFollow?"pitch ":"root ")+root);
   tag(290,95,"pan");
   if(!vocal){
    line("M"+(18+(strum+25)/50*52).toFixed(2)+" 94 V102",true,["strumMs"]);
    if(oneShot)line("M344 40 V91",true,["oneShot"]);
    if(dynamics)line("M331 41 L338 35 L345 41",true,["preserveDynamics"]);
   }
  }
 }else if(type==="sample"&&page===1){
  const gain=clamp(p.gain??.9,0,2),transpose=p.transpose??0,pan=p.pan??0,strum=p.strumMs??0;
  if(p.type==="vocal"){
   // Vocal clips do not have the sample's strum/pitch-follow options.
   // This graph edits the actual three common voice controls instead.
   line("M18 100 H169 M193 82 H342",true);
   line(pathRange(190,t=>[18+151*t,
    73-24*Math.min(1,gain/1.5)*Math.sin(t*2*Math.PI*4*2**(transpose/12))]),
    false,["transpose","gain"]);
   handle(19+148*clamp((transpose+24)/48),99-50*gain/2,[
    axis(["transpose"],-24,24,"linearX",{from:19,to:167,step:1,unit:"st"}),
    axis(["gain"],0,2,"linearY",{from:99,to:49,step:.01,unit:"percent"})
   ],"voice pitch / level");
   const x=202+130*clamp((pan+1)/2);
   line("M"+x.toFixed(2)+" 64 V100",false,["pan"]);
   handle(x,82,[
    axis(["pan"],-1,1,"linearX",{from:202,to:332,step:.01,unit:"pan"})
   ],"voice left / right");
   tag(19,15,"pitch → / level ↑");tag(204,15,"left ← stereo → right");
  }else{
  line("M18 60 H171 M192 104 H342",true);
  line(pathRange(190,t=>[25+18*strum/25+126*t,
   60-22*Math.sin(2*Math.PI*6*2**(transpose/12)*t)*Math.min(1,gain/1.5)]),
   true,["transpose","strumMs","gain"]);
  // X is the recording's onset displacement; Y is its pitch shift.
  handle(19+clamp((strum+25)/50)*148,60-35*clamp(transpose/24,-1,1),[
   axis(["strumMs"],-25,25,"linearX",{from:19,to:167,step:1,unit:"ms"}),
   axis(["transpose"],-24,24,"linearY",{from:95,to:25,step:1,unit:"st"})
  ],"sample onset / pitch");
  line("M202 83 H332",true);
  line("M"+(202+130*(pan+1)/2).toFixed(2)+" 83 V"+(103-35*gain/2).toFixed(2),
   false,["pan","gain"]);
  handle(202+130*(pan+1)/2,103-35*gain/2,[
   axis(["pan"],-1,1,"linearX",{from:202,to:332,step:.01,unit:"pan"}),
   axis(["gain"],0,2,"linearY",{from:103,to:68,step:.01,unit:"percent"})
  ],"stereo position / recording level");
  tag(19,15,"onset / pitch");tag(205,15,"stereo / level");
  action(65,107,["followPitch"],[true,false],"follow played note");
  action(190,40,["oneShot"],[false,true],"play entire recording");
  action(299,40,["preserveDynamics"],[false,true],"preserve recorded dynamics");
  }
 }else if(type==="movement"&&page===1){
  const m=movement(p),bend=p.bend??{shape:"straight",amount:2,rate:4};
  line("M18 61 H344",true);
  line(pathRange(250,t=>[18+326*t,61-5*pitchCents({bend},m,t*1.25,1.25)/100]),
   false,["bend.shape","bend.amount","bend.rate","movement.glide","movement.glideTime"]);
  handle(42+clamp((bend.rate-.1)/11.9)*275,61-34*clamp(bend.amount/12),[
   axis(["bend","rate"],.1,12,"linearX",{from:42,to:317,step:.1}),
   axis(["bend","amount"],0,12,"linearY",{from:61,to:27,step:.25})
  ],"bend speed / amount");
  handle(42+clamp(m.delay/3)*275,103,[
   axis(["movement","delay"],0,3,"linearX",{from:42,to:317,step:.05})
  ],"vibrato waiting time");
  action(87,108,["bend","shape"],BEND_SHAPES.map(([value])=>value),"bend shape");
  tag(18,14,"pitch bend");tag(245,90,"vibrato waits →");
 }else if(type==="movement"&&page===2){
  const m=movement(p),pulse=clamp(m.tremolo??0),tone=clamp(m.tone??0),pan=clamp(p.pan??0,-1,1);
  line("M18 47 H170 M190 47 H342 M83 103 H277",true);
  line(pathRange(145,t=>[18+152*t,47-15*pulse*Math.sin(2*Math.PI*t*1.3*(m.tremoloRate??5))]),
   false,["movement.tremolo","movement.tremoloRate"]);
  handle(22+clamp(((m.tremoloRate??5)-.1)/19.9)*143,47-22*pulse,[
   axis(["movement","tremoloRate"],.1,20,"linearX",{from:22,to:165,step:.1}),
   axis(["movement","tremolo"],0,1,"linearY",{from:47,to:25,step:.01})
  ],"volume pulse speed / depth");
  // Only the synth has tone movement knobs. A recorded Sound must not gain
  // an illustration-only control that its native renderer cannot mirror.
  if(p.type==="synth"){
   line(pathRange(145,t=>[190+152*t,47-15*tone*Math.sin(2*Math.PI*t*1.3*(m.toneRate??2))]),
    false,["movement.tone","movement.toneRate"]);
   handle(194+clamp(((m.toneRate??2)-.1)/19.9)*143,47-22*tone,[
    axis(["movement","toneRate"],.1,20,"linearX",{from:194,to:337,step:.1}),
    axis(["movement","tone"],0,1,"linearY",{from:47,to:25,step:.01})
   ],"tone movement speed / depth");
  }
  handle(83+(pan+1)*97,103,[
   axis(["pan"],-1,1,"linearX",{from:83,to:277,step:.01})
  ],"stereo pan");
  tag(20,16,"volume pulse");if(p.type==="synth")tag(196,16,"tone movement");tag(107,89,"left ←  stereo  → right");
 }else if(type==="movement"){
  const m=movement(p);
  line("M15 62 H345",true);
  line(pathRange(320,t=>{
   const time=t*1.5;
   const cents=pitchCents({bend:p.bend},m,Math.min(time,1.25),1.25)/100;
   const vibrato=time>=m.delay?m.depth/100*Math.sin(time*2*Math.PI*m.rate):0;
   return [15+t*330,62-clamp((cents+vibrato)*5,-43,43)];
  }),false,["bend.shape","bend.amount","bend.rate","movement.glide","movement.glideTime","movement.depth","movement.rate","movement.delay"]);
  handle(20+clamp(((m.glideTime??.3)-.01)/2.99)*80,62-clamp(m.glide*3.5,-42,42),[
   axis(["movement","glideTime"],.01,3,"linearX",{from:20,to:100,step:.01}),
   axis(["movement","glide"],-12,12,"linearY",{from:104,to:20,step:.1})
  ],"glide duration / starting pitch");
  handle(48+clamp((m.rate-.1)/19.9)*260,62-35*m.depth/100,[
   axis(["movement","rate"],.1,20,"linearX",{from:48,to:308,step:.1}),
   axis(["movement","depth"],0,100,"linearY",{from:62,to:27,step:1})
  ],"vibrato rate / depth");
  tag(15,14,"pitch");tag(287,14,"rate →");
  // Separate amplitude and timbre motion cannot be seen on a pitch plot.
  const pulse=m.tremolo??0,pulseRate=m.tremoloRate??5;
  const tone=m.tone??0,toneRate=m.toneRate??2;
  line(pathRange(150,t=>[18+t*324,86-8*pulse*Math.sin(2*Math.PI*t*1.5*pulseRate)]),true,["movement.tremolo","movement.tremoloRate"]);
  if(p.type==="synth")
   line(pathRange(150,t=>[18+t*324,100-7*tone*Math.sin(2*Math.PI*t*1.5*toneRate)]),
    true,["movement.tone","movement.toneRate"]);
  const pan=clamp(p.pan??0,-1,1);
  line("M22 109 H"+(22+22*(1-pan)).toFixed(2),true,["pan"]);
  line("M294 109 H"+(294+22*(1+pan)).toFixed(2),true,["pan"]);
  tag(20,79,"level");
  if(p.type==="synth")tag(20,96,"tone");
  tag(260,110,"l / r");
 }else if(type==="distortion"){
  const drive=p.effects.drive||0,transfer=driveCurve(drive);
  line("M18 96 H344 M180 17 V97",true);
  line(pathRange(300,t=>{
   const output=transfer[Math.round(t*(transfer.length-1))];
   return [24+t*312,58-output*37];
  }),false,["effects.drive"]);
  handle(306,88-60*drive,[
   axis(["effects","drive"],0,1,"linearY",{from:88,to:28,step:.01})
  ],"drive");
  tag(18,14,"output ↑");tag(294,108,"input →");
 }else if(type==="delay"){
  const e=p.effects,mix=e.delayMix||0,feedback=e.delayFeedback||0;
  const space=24+clamp((e.delayTime-.05)/.95)*66,origin=52;
  line("M16 100 H348",true);
  // The original note, then discrete echoes with spacing and amplitude
  // derived from the authored time, mix and feedback settings.
  for(let i=0;i<4;i++){
   const x=origin+i*space;
   const level=i===0?1:mix*feedback**(i-1);
   line("M"+x.toFixed(2)+" 100 V"+(100-72*level).toFixed(2),i>0,["effects.delayTime","effects.delayMix","effects.delayFeedback"]);
   if(i>0)tag(x+4,Math.max(18,94-72*level),String(i));
  }
  handle(origin+space,100-72*mix,[
   axis(["effects","delayTime"],.05,1,"linearX",
    {from:origin+24,to:origin+90,step:.01,unit:"s"}),
   axis(["effects","delayMix"],0,1,"linearY",{from:100,to:28,step:.01,unit:"percent"})
  ],"delay time / mix");
  // Feedback is independently editable even with the wet mix at zero.
  // A faint guide communicates potential repeat persistence without falsely
  // depicting an audible echo until delay mix is raised.
  const feedbackX=origin+2*space,feedbackY=100-64*feedback/.8;
  line("M"+feedbackX.toFixed(2)+" 100 V"+feedbackY.toFixed(2),
   true,["effects.delayFeedback"]);
  handle(feedbackX,feedbackY,[
   axis(["effects","delayTime"],.05,1,"linearX",{from:origin+48,to:origin+180,step:.01,unit:"s"}),
   axis(["effects","delayFeedback"],0,.8,"linearY",
    {from:100,to:36,step:.01,unit:"percent"})
  ],"echo spacing / feedback");
  tag(250,107,"feedback");
  tag(18,13,"mix ↑");tag(287,13,"time →");tag(30,112,"dry");
 }else if(type==="mapping"){
  // Every imported recording can be inspected independently. Four lanes
  // are shown per page so overlapping source pitches never hide one another.
  const zones=p.zones??[],start=Math.max(0,page)*4;
  for(let i=0;i<=5;i++){
   const note=i*24,x=18+324*note/127;
   line("M"+x.toFixed(2)+" 14 V101",true);
   tag(Math.min(331,x+2),111,"c"+(2*i-1));
  }
  for(let j=0;j<Math.min(4,zones.length-start);j++){
   const index=start+j,zone=zones[index],y=25+j*21;
   const x=18+324*clamp(zone.root/127);
   line("M18 "+y+" H342",true);
   line("M"+x.toFixed(2)+" "+(y-9)+" V"+(y+9),false,["zones."+index+".root"]);
   handle(x,y,[axis(["zones",index,"root"],0,127,"linearX",
    {from:18,to:342,step:1,unit:"MIDI"})],"sample "+(index+1)+" recorded pitch");
   tag(23,y-8,String(index+1));
  }
 }else if(type==="modulation"){
  const routes=p.modulation?.routes??[];
  const routePages=Math.max(1,Math.ceil(routes.length/4));
  if(page<routePages){
   tag(17,13,"source");tag(291,13,"target");
   if(!routes.length)line("M24 57 H336",true);
   // The four-route overview is a readable map of the real modulation signal.
   const start=Math.max(0,page)*4,shown=routes.slice(start,start+4),centers=[30,51,73,95];
   shown.forEach((route,j)=>{
    const i=start+j,center=centers[j];
    const target=MOD_TARGETS.find(t=>t.id===route.target),limit=target?.limit||1;
    line("M67 "+center+" H290",true);
    line(pathRange(130,t=>{
     const seconds=1.25*t;
     const value=routeValueAt(route,{elapsed:seconds,gate:1,velocity:.7,pitch:65});
     const visualScale=route.unit==="cents"?20:route.unit==="octaves"?.6:.2;
     return [67+223*t,center-9*Math.tanh(value/visualScale)];
    }),false,["modulation.routes."+i]);
    // Depth is always editable; a time-based source adds a genuine second axis.
    const depth=clamp(route.depth/limit,-1,1);
    const rate=route.source.kind==="lfo"?route.source.rate:null;
    handle(rate===null?184:75+215*clamp((rate-.05)/19.95),center-8*depth,[
     ...(rate===null?[]:[axis(["modulation","routes",i,"source","rate"],.05,20,
      "linearX",{from:75,to:290,step:.05})]),
     axis(["modulation","routes",i,"depth"],-limit,limit,
      "linearY",{from:center+8,to:center-8,step:target.unit==="cents"?1:.01})
    ],"movement "+(i+1)+" "+(rate===null?"depth":"speed / depth"));
    const source=route.source.kind==="lfo"?"lfo":route.source.kind==="keytrack"?"keys":
     route.source.kind==="velocity"?"touch":"env";
    tag(18,center+3,source);
    tag(294,center+3,target?.name.replace("oscillator ","osc ")||"target");
   });
  }else{
   const i=page-routePages,route=routes[i],target=MOD_TARGETS.find(item=>item.id===route.target);
   if(route){
    const limit=target?.limit??1,depth=clamp(route.depth/limit,-1,1);
    const prefix=["modulation","routes",i],source=route.source;
    line("M24 61 H336",true);
    line(pathRange(240,t=>{
     const value=routeValueAt(route,{elapsed:t*1.25,gate:1,velocity:.7,pitch:65});
     return [24+312*t,61-32*clamp(value/Math.max(.001,limit),-1,1)];
    }),false,["modulation.routes."+i]);
    const primary=source.kind==="lfo"?
     [axis([...prefix,"source","rate"],.05,20,"linearX",{from:35,to:317,step:.05})]:
     [axis([...prefix,"smoothing"],0,.1,"linearX",{from:35,to:317,step:.001})];
    handle(35+282*clamp(source.kind==="lfo"?(source.rate-.05)/19.95:
     (route.smoothing??0)/.1),61-35*depth,[
     ...primary,axis([...prefix,"depth"],-limit,limit,"linearY",
      {from:96,to:26,step:target?.unit==="cents"?1:.01})
    ],source.kind==="lfo"?"route speed / depth":"route smoothing / depth");
    if(source.kind==="lfo"){
     // Smoothing is independent of the oscillator speed and movement depth.
     line("M35 104 H317",true,["modulation.routes."+i+".smoothing"]);
     handle(35+282*clamp((route.smoothing??0)/.1),104,[
      axis([...prefix,"smoothing"],0,.1,"linearX",{from:35,to:317,step:.001})
     ],"movement smoothing");
     tag(254,112,"smooth →");
    }
    if(source.kind==="envelope"){
     const e=source.envelope;
     handle(39+110*clamp(e.attack/3),99-31*clamp(e.sustain),[
      axis([...prefix,"source","envelope","attack"],0,3,"linearX",
       {from:39,to:149,step:.01}),
      axis([...prefix,"source","envelope","sustain"],0,1,"linearY",
       {from:99,to:68,step:.01})
     ],"movement envelope attack / sustain");
     handle(188+138*clamp(e.decay/3),99-31*clamp((e.release-.01)/3.99),[
      axis([...prefix,"source","envelope","decay"],0,3,"linearX",
       {from:188,to:326,step:.01}),
      axis([...prefix,"source","envelope","release"],.01,4,"linearY",
       {from:99,to:68,step:.01})
     ],"movement envelope decay / release");
    }else if(source.kind==="keytrack"){
     handle(39+287*clamp(source.root/127),99-32*clamp((source.span-1)/126),[
      axis([...prefix,"source","root"],0,127,"linearX",{from:39,to:326,step:1}),
      axis([...prefix,"source","span"],1,127,"linearY",{from:99,to:67,step:1})
     ],"key tracking center / spread");
    }
    action(73,14,[...prefix,"source","kind"],MOD_SOURCES,"movement source");
    action(185,14,[...prefix,"polarity"],["unipolar","bipolar"],"movement range");
    action(286,14,[...prefix,"target"],MOD_TARGETS.map(item=>item.id),"movement target");
    tag(22,111,"route "+(i+1)+" · "+source.kind+" → "+(target?.name||route.target));
   }
  }
 }
 return {paths,handles,labels,actions,color};
};
const pageState=new Map();
let zoomId=null;
const idFor=(kind,index)=>kind+"-"+index;
function setZoom(wrapper,id,enabled){
 if(enabled){zoomId=id;document.body.classList.add("sound-visual-zoom");}
 else{zoomId=null;document.body.classList.remove("sound-visual-zoom");}
 document.querySelectorAll(".visual-sound-panel.zoomed").forEach(el=>el.classList.remove("zoomed"));
 if(enabled)wrapper.classList.add("zoomed");
 const button=wrapper.querySelector(".visual-panel-expand");
 if(button){button.textContent=enabled?"−":"⤢";button.setAttribute("aria-label",(enabled?"shrink ":"expand ")+id.split("-")[0]+" illustration");}
}
if(typeof document!=="undefined")document.addEventListener("keydown",event=>{
 if(event.key==="Escape"&&zoomId){
  const wrapper=document.querySelector('.visual-sound-panel.zoomed');
  if(wrapper){setZoom(wrapper,zoomId,false);event.stopPropagation();}
 }
});
export function illustrateSoundPanel(details,kind,patch,onChange,onPreview,index=0){
 // The Beat's primary brightness/rise/fade dials sit above the accordion.
 // Capture their common owner before the accordion is moved into its wrapper.
 // Song/freeform Sound also nests its diagram and controls in one content root.
 // Modules are frequently constructed off-DOM and inserted after the
 // illustration wrapper exists. Resolve its final owner when handling input.
 const initiallyAttachedOwner=details.closest(".sound-section,.freeform-sound-content")??details;
 const id=idFor(kind,index);
 let page=pageState.get(id)??0;
 const paginated=diagramPageCount(patch,kind)>1;
 const wrapper=document.createElement("section");wrapper.className="visual-sound-panel";
 const controlOwner=()=>wrapper.closest(".sound-section,.freeform-sound-content")??
  initiallyAttachedOwner;
 wrapper.dataset.visualKind=kind;
 wrapper.dataset.visualId=id;
 const area=document.createElement("div");area.className="visual-panel-area";
 const graphic=svgNode("svg",{viewBox:"0 0 360 112",preserveAspectRatio:"none",
  role:"group","aria-label":kind.replace(/\\d+/g,"")+" interactive sound illustration"});
 graphic.classList.add("visual-panel-graph");
 const handlesRoot=document.createElement("div");handlesRoot.className="visual-graph-points";
 const expand=document.createElement("button");expand.type="button";
 expand.className="visual-panel-expand";expand.textContent="⤢";
 expand.setAttribute("aria-label","expand "+kind+" illustration");
 expand.addEventListener("click",()=>{
  const next=!wrapper.classList.contains("zoomed");
  if(next)details.open=true;setZoom(wrapper,id,next);
 });
 const pages=document.createElement("div");pages.className="visual-panel-pages";
 pages.setAttribute("aria-label",kind+" pages");
 const previous=document.createElement("button");previous.type="button";
 previous.textContent="‹";previous.setAttribute("aria-label","previous "+kind+" page");
 const range=document.createElement("span");range.className="visual-panel-range";
 const next=document.createElement("button");next.type="button";
 next.textContent="›";next.setAttribute("aria-label","next "+kind+" page");
 pages.append(previous,range,next);
 const turn=delta=>{
  page=clamp(page+delta,0,diagramPageCount(latestPatch,kind)-1);
  pageState.set(id,page);draw(latestPatch);
 };
 previous.addEventListener("click",()=>turn(-1));
 next.addEventListener("click",()=>turn(1));
 const dragReadout=document.createElement("output");
 dragReadout.className="visual-drag-readout";dragReadout.hidden=true;
 area.append(graphic,handlesRoot,pages,expand,dragReadout);
 // The drawing belongs inside its accordion: closed sections stay compact.
 const summary=details.querySelector("summary");
 if(summary)summary.after(area);else details.prepend(area);
 wrapper.append(details);
 let active=null,latestPatch=patch,visibleHandles=[],visibleActions=[],activeLink=null;
 const setValue=(next,path,value)=>{
  const ownerPath=path.slice(0,-1);let owner=next;
  for(const key of ownerPath)owner=owner[key]??={};
  owner[path.at(-1)]=value;
 };
 function draw(current=latestPatch){
  latestPatch=current;
  const total=kind==="mapping"?(current.zones?.length??0):
   kind==="modulation"?(current.modulation?.routes?.length??0):0;
  if(paginated){
   const count=diagramPageCount(current,kind),maxPage=count-1;
   page=clamp(page,0,maxPage);
   pages.hidden=count<=1;
   previous.disabled=page===0;next.disabled=page===maxPage;
   const grouped=kind==="mapping"||
    kind==="modulation"&&page<Math.max(1,Math.ceil(total/4));
   range.textContent=grouped?(page*4+1)+"–"+Math.min(total,(page+1)*4)+" / "+total:
    (page+1)+" / "+count;
  }else pages.hidden=true;
  const {paths,handles,labels,actions,color}=diagram(current,kind,page);
  visibleHandles=handles;visibleActions=actions;
  // Rebuilding the diagram for live previews must not steal keyboard focus.
  const focusedHandle=handlesRoot.contains(document.activeElement)?
   document.activeElement.dataset.handle:null;
  graphic.replaceChildren();handlesRoot.replaceChildren();
  graphic.style.setProperty("--visual-color",color);
  for(const path of paths){
   const visible=svgNode("path",{d:path.d,
    class:path.secondary?"visual-graph-secondary":"visual-graph-line",fill:"none"});
   if(path.links?.length){
    visible.dataset.soundLinks=path.links.join("|");
    const hit=svgNode("path",{d:path.d,class:"visual-graph-hit",fill:"none",
     tabindex:"0",role:"button","aria-label":"edit "+path.links[0].split(".").at(-1)});
    hit.dataset.soundLinks=path.links.join("|");
    graphic.append(visible,hit);
   }else graphic.append(visible);
  }
  for(const {x,y,value} of labels)graphic.append(svgNode("text",{x,y,
   class:"visual-graph-label"},value));
  handles.forEach((point,i)=>{
   const button=document.createElement("button");button.type="button";
   button.className="visual-graph-point";
   button.style.left=(point.x/360*100)+"%";
   button.style.top=(point.y/112*100)+"%";
   button.dataset.handle=String(i);
   button.dataset.soundLinks=point.axes.map(axis=>axis.path.join(".")).join("|");
   button.setAttribute("aria-label",point.label);
   button.setAttribute("aria-description",point.axes.map(axisDirection).join("; "));
   const readout=document.createElement("output");
   readout.className="visual-point-readout";
   readout.textContent=point.label+" · "+
    point.axes.map(axis=>axisReadout(axis,axisValue(current,axis.path))).join(" · ");
   button.append(readout);
   // A two-dimensional handle is a button, not an inaccurately labelled slider.
   if(point.axes.length===1){
    const a=point.axes[0];button.setAttribute("role","slider");
    button.setAttribute("aria-valuemin",String(a.min));
    button.setAttribute("aria-valuemax",String(a.max));
    button.setAttribute("aria-valuenow",String(axisValue(current,a.path)));
   }
   handlesRoot.append(button);
  });
  for(const entry of actions){
   const button=document.createElement("button");button.type="button";
   button.className="visual-graph-action";
   button.style.left=(entry.x/360*100)+"%";
   button.style.top=(entry.y/112*100)+"%";
   const value=at(current,entry.path);
   const display=typeof value==="boolean"?(value?"on":"off"):String(value??entry.choices[0]);
   const secondOscillator=entry.path.join(".")==="oscillators.1.level";
   button.textContent=entry.path[0]==="audioFilterBypassed"?
    (current.audioFilterBypassed?"filter on":"filter off"):
    secondOscillator?(Number(value)>0?"osc 2 0%":"osc 2 25%"):
    (({sawtooth:"saw",triangle:"tri",lowpass:"low",highpass:"high",
    bandpass:"band",straight:"flat"})[display]??display);
   button.setAttribute("aria-label",secondOscillator?
    (Number(value)>0?"set oscillator 2 base level to zero":
     "set oscillator 2 base level to 25 percent"):
    entry.label+": "+String(value??entry.choices[0])+"; next choice");
   button.dataset.soundPath=entry.path.join(".");
   // Filter-bypass graph actions edit the canonical filter object, not a
   // separately stored bypass knob. The filter selector links to this action.
   button.dataset.soundLinks=entry.path[0]==="audioFilterBypassed"?
    "filter.type|audioFilterBypassed":entry.path.join(".");
   button.addEventListener("click",()=>{
    const live=at(latestPatch,entry.path)??entry.choices[0];
    const index=entry.choices.findIndex(choice=>choice===live);
    const next=entry.choices[(index+1)%entry.choices.length];
    if(entry.path[0]==="audioFilterBypassed"){
     // The vocal display patch uses this read-only bypass flag to render the
     // neutral curve, but the canonical edit is the actual filter object.
     onChange(["filter"],latestPatch.audioFilterBypassed?
      {...DEFAULT_SAMPLE_FILTER}:null);
    }else if(entry.path[0]==="oscillators"&&entry.path[2]==="wave"&&next==="harmonic"){
     const slot=latestPatch.oscillators[entry.path[1]];
     onChange(["oscillators",entry.path[1]],{
      ...slot,wave:"harmonic",harmonics:slot.harmonics||harmonicRecipe()
     });
    }else if(entry.path[0]==="modulation"&&entry.path[1]==="routes"){
     const i=entry.path[2],route=latestPatch.modulation.routes[i];
     if(entry.path.at(-1)==="target"){
      const selected=MOD_TARGETS.find(target=>target.id===next);
      onChange(["modulation","routes",i],{...route,target:next,unit:selected.unit,
       depth:clamp(route.depth,-selected.limit,selected.limit)});
     }else if(entry.path.at(-1)==="kind")
      onChange(["modulation","routes",i,"source"],defaultSource(next));
     else onChange(entry.path,next);
    }else onChange(entry.path,next);
   });
   handlesRoot.append(button);
  }
  if(focusedHandle!==null){
   handlesRoot.querySelector('.visual-graph-point[data-handle="'+focusedHandle+'"]')
    ?.focus({preventScroll:true});
  }
  highlight(activeLink);
 }
 function targetFields(keys){
  const fields=[...controlOwner().querySelectorAll("[data-sound-path]")];
  return fields.filter(field=>keys.some(key=>{
   const path=field.dataset.soundPath;
   return path===key||path.startsWith(key+".")||key.startsWith(path+".");
  }));
 }
 function highlight(keys){
  activeLink=keys?.length?keys:null;
  const linked=activeLink?targetFields(activeLink):[];
  for(const field of controlOwner().querySelectorAll("[data-sound-path]"))
   field.classList.toggle("sound-link-active",linked.includes(field));
  for(const item of graphic.querySelectorAll("[data-sound-links]")){
   const connected=item.dataset.soundLinks.split("|");
   item.classList.toggle("visual-linked",!!activeLink&&connected.some(key=>
    activeLink.some(selected=>key===selected||key.startsWith(selected+".")||selected.startsWith(key+"."))));
  }
 }
 function focusFeature(keys){
  details.open=true;
  details.populateMapping?.();
  const matching=targetFields(keys);
  // Choose the original dial/select, not the graph's own categorical button.
  const knobs=matching.filter(item=>!item.classList.contains("visual-graph-action"));
  const field=knobs.find(item=>keys.includes(item.dataset.soundPath))??
   knobs[0]??matching[0]??details.querySelector("[data-sound-path]");
  if(!field)return;
  const nested=field.closest("details.modulation-routing,details.harmonic-more");
  if(nested)nested.open=true;
  const module=field.closest("details.synth-group");
  if(module)module.open=true;
  highlight([field.dataset.soundPath]);
  // Some knob labels contain a help-text span with tabindex. Prefer the
  // actual editable widget instead of accidentally focusing its tooltip.
  const focus=field.matches("select,input,button,[role='slider']")?field:
   field.querySelector("select,input,[role='slider']")??
   field.querySelector("button,[tabindex]");
  if(focus){focus.focus();focus.scrollIntoView?.({block:"nearest"});}
 }
 graphic.addEventListener("click",event=>{
  const hit=event.target.closest?.(".visual-graph-hit");
  if(hit){focusFeature(hit.dataset.soundLinks.split("|"));return;}
  // Empty drawing space is still a route to the nearest real control.
  // Do not alter a Sound by clicking the background. Direct edits remain
  // on the explicit point/action surfaces above the SVG.
  const rect=graphic.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const x=(event.clientX-rect.left)/rect.width*360;
  const y=(event.clientY-rect.top)/rect.height*112;
  const candidates=[
   ...visibleHandles.map(point=>({x:point.x,y:point.y,
    keys:point.axes.map(axis=>axis.path.join("."))})),
   ...visibleActions.map(item=>({x:item.x,y:item.y,
    keys:item.path[0]==="audioFilterBypassed"?["filter.type"]:
     [item.path.join(".")]}))
  ];
  const nearest=candidates.sort((a,b)=>
   (a.x-x)**2+(a.y-y)**2-(b.x-x)**2-(b.y-y)**2)[0];
  if(nearest)focusFeature(nearest.keys);
 });
 graphic.addEventListener("keydown",event=>{
  if(!["Enter"," "].includes(event.key))return;
  const hit=event.target.closest?.(".visual-graph-hit");
  if(!hit)return;
  event.preventDefault();focusFeature(hit.dataset.soundLinks.split("|"));
 });
 graphic.addEventListener("pointerover",event=>{
  const hit=event.target.closest?.(".visual-graph-hit");
  if(hit)highlight(hit.dataset.soundLinks.split("|"));
 });
 graphic.addEventListener("pointerout",event=>{
  if(!event.relatedTarget?.closest?.(".visual-graph-hit"))highlight(null);
 });
 const ownerListeners={
  pointerover:event=>{
   const control=event.target.closest?.("[data-sound-path]");
   if(control&&controlOwner().contains(control))highlight([control.dataset.soundPath]);
  },
  pointerout:event=>{
   if(!event.relatedTarget?.closest?.("[data-sound-path]"))highlight(null);
  },
  focusin:event=>{
   const control=event.target.closest?.("[data-sound-path]");
   if(control)highlight([control.dataset.soundPath]);
  },
  focusout:event=>{
   if(!controlOwner().contains(event.relatedTarget))highlight(null);
  }
 };
 const listen=(root,operation)=>Object.entries(ownerListeners).forEach(([name,handler])=>
  root[operation](name,handler));
 let listenerOwner=controlOwner(),linksDisposed=false;
 listen(listenerOwner,"addEventListener");
 // Detached wrappers must not leave listeners on the long-lived Sound section.
 // The caller disposes old diagrams before rebuilding them, keeping one
 // listener per live illustration instead of accumulating on every knob edit.
 wrapper.disposeSoundIllustration=()=>{
  if(linksDisposed)return;
  linksDisposed=true;
  listen(listenerOwner,"removeEventListener");
  // The whole Sound editor can be replaced when selecting another Sound.
  // Let its replacement reattach the same expanded illustration, otherwise
  // clear the orphaned backdrop after this synchronous render completes.
  if(wrapper.classList.contains("zoomed"))queueMicrotask(()=>{
   if(!document.querySelector(".visual-sound-panel.zoomed")){
    zoomId=null;
    document.body.classList.remove("sound-visual-zoom");
   }
  });
 };
 // Keep detached test mounts working, and bind to the shared editor once
 // the caller finishes inserting the illustration into the live DOM.
 queueMicrotask(()=>{
  if(linksDisposed)return;
  const finalOwner=controlOwner();
  if(finalOwner!==listenerOwner){
   listen(listenerOwner,"removeEventListener");
   listenerOwner=finalOwner;
   listen(listenerOwner,"addEventListener");
  }
 });
 const coord=event=>{
  const rect=graphic.getBoundingClientRect();
  return {x:(event.clientX-rect.left)/rect.width*360,
   y:(event.clientY-rect.top)/rect.height*112};
 };
 const valueAt=(axis,position)=>{
  const fraction=clamp((position[axis.mode.endsWith("X")?"x":"y"]-axis.from)/
   (axis.to-axis.from));
  const raw=axis.mode.startsWith("log")?axis.min*(axis.max/axis.min)**fraction:
   axis.min+(axis.max-axis.min)*fraction;
  const snapped=Math.round(raw/axis.step)*axis.step;
  return clamp(Number(snapped.toFixed(4)),axis.hardMin??axis.min,axis.hardMax??axis.max);
 };
 // A spectral drawing can be painted in two dimensions: moving horizontally
 // selects neighboring harmonics while vertical movement changes their levels.
 // Consecutive partials are interpolated so fast strokes do not leave holes.
 const paintHarmonics=(stroke,position,commit)=>{
  const local=clamp(Math.round((position.x-37)/41),0,7);
  const index=stroke.base+local;
  const level=clamp(Math.round((100-position.y)/41*100)/100);
  if(stroke.last){
   const first=stroke.last.index,span=index-first;
   if(span!==0)for(let n=Math.min(first,index);n<=Math.max(first,index);n++){
    const portion=(n-first)/span;
    stroke.values.set(n,Number((stroke.last.level+
     (level-stroke.last.level)*portion).toFixed(2)));
   }
  }
  stroke.values.set(index,level);stroke.last={index,level};
  const paths=[...stroke.values.keys()].sort((a,b)=>a-b).map(n=>
   ["oscillators",stroke.oscillator,"harmonics",n]);
  const values=paths.map(keys=>stroke.values.get(keys[3]));
  const updated=structuredClone(patch);
  assignSoundEdit(updated,paths,values);
  draw(updated);
  dragReadout.textContent="harmonics "+(stroke.base+1)+"–"+(stroke.base+8)+
   " · h"+(index+1)+" "+Math.round(level*100)+"%";
  dragReadout.style.left=(clamp(position.x,24,336)/360*100)+"%";
  dragReadout.style.top=(clamp(position.y,14,91)/112*100)+"%";
  dragReadout.hidden=commit;
  const key=paths.length===1?paths[0]:paths;
  const value=paths.length===1?values[0]:values;
  if(commit)onChange(key,value);else onPreview(key,value);
 };
 const apply=(point,position,commit)=>{
  const next=structuredClone(patch);
  const paths=point.axes.map(a=>a.path);
  const values=point.axes.map(a=>valueAt(a,position));
  assignSoundEdit(next,paths,values);
  draw(next);
  // A persistent readout survives the redraw while the pointer is captured.
  dragReadout.textContent=point.label+" · "+
   point.axes.map((axis,i)=>axisReadout(axis,values[i])).join(" · ");
  dragReadout.style.left=(clamp(position.x,24,336)/360*100)+"%";
  dragReadout.style.top=(clamp(position.y,14,91)/112*100)+"%";
  dragReadout.hidden=commit;
  // Two axes are one sound edit and one undo step, never two disconnected edits.
  const key=paths.length===1?paths[0]:paths;
  const value=paths.length===1?values[0]:values;
  if(commit)onChange(key,value);else onPreview(key,value);
 };
 area.addEventListener("pointerdown",event=>{
  const button=event.target.closest(".visual-graph-point");
  if(!button||event.button!==0||active)return;
  const point=visibleHandles[Number(button.dataset.handle)];
  if(!point)return;
  if(kind.startsWith("harmonics")){
   const oscillator=Number(kind.slice("harmonics".length));
   active={pointerId:event.pointerId,stroke:{
    oscillator,base:page*8,values:new Map(),last:null
   }};
  }else active={pointerId:event.pointerId,point};
  area.setPointerCapture(event.pointerId);event.preventDefault();
  if(active.stroke)paintHarmonics(active.stroke,coord(event),false);
  else apply(point,coord(event),false);
 });
 area.addEventListener("pointermove",event=>{
  if(!active||active.pointerId!==event.pointerId)return;
  if(active.stroke)paintHarmonics(active.stroke,coord(event),false);
  else apply(active.point,coord(event),false);
 });
 area.addEventListener("pointerup",event=>{
  if(!active||active.pointerId!==event.pointerId)return;
  const gesture=active;active=null;
  if(gesture.stroke)paintHarmonics(gesture.stroke,coord(event),true);
  else apply(gesture.point,coord(event),true);
  if(area.hasPointerCapture(event.pointerId))area.releasePointerCapture(event.pointerId);
 });
 area.addEventListener("pointercancel",event=>{
  if(!active||active.pointerId!==event.pointerId)return;
  const gesture=active;active=null;
  dragReadout.hidden=true;draw(patch);
  const paths=gesture.stroke?[...gesture.stroke.values.keys()].map(index=>
   ["oscillators",gesture.stroke.oscillator,"harmonics",index]):
   gesture.point.axes.map(a=>a.path);
  const values=paths.map(path=>at(patch,path));
  if(paths.length)onPreview(paths.length===1?paths[0]:paths,
   paths.length===1?values[0]:values);
  if(area.hasPointerCapture(event.pointerId))area.releasePointerCapture(event.pointerId);
 });
 area.addEventListener("keydown",event=>{
  if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
  const button=event.target.closest(".visual-graph-point");if(!button)return;
  const point=visibleHandles[Number(button.dataset.handle)];if(!point)return;
  const horizontal=event.key==="ArrowLeft"||event.key==="ArrowRight";
  const selected=point.axes.find(a=>horizontal?a.mode.endsWith("X"):a.mode.endsWith("Y"));
  if(!selected&&horizontal&&kind.startsWith("harmonics")){
   // Horizontal arrows select the neighboring harmonic; vertical arrows
   // change its amplitude while preserving all 32 original knobs.
   const i=Number(button.dataset.handle)+(event.key==="ArrowRight"?1:-1);
   const neighbor=handlesRoot.querySelector('.visual-graph-point[data-handle="'+i+'"]');
   if(neighbor){event.preventDefault();neighbor.focus();}
   return;
  }
  if(!selected)return;event.preventDefault();
  const dir=event.key==="ArrowUp"||event.key==="ArrowRight"?1:-1;
  const current=axisValue(latestPatch,selected.path);
  // Arrows are precise knob-scale edits, with Shift for coarse movements.
  // Logarithmic frequency axes use perceptually meaningful relative steps.
  const step=selected.mode.startsWith("log")?Math.max(selected.step,current*(event.shiftKey?.2:.07)):
   selected.step*(event.shiftKey?10:1);
  // Keyboard and pointer edits must respect the same discrete grid.
  // Automation positions and recorded pitches are integers; fractional
  // steps would invalidate the existing project format.
  const snapped=Math.round((current+dir*step)/selected.step)*selected.step;
  const next=clamp(Number(snapped.toFixed(4)),
   selected.hardMin??selected.min,selected.hardMax??selected.max);
  onChange(selected.path,next);
 });
 if(zoomId===id){wrapper.classList.add("zoomed");expand.textContent="−";}
 draw(patch);wrapper.drawSoundIllustration=draw;
 return {element:wrapper,draw};
}
