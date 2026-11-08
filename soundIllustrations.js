import {processorBypassed,withProcessorBypass} from "./src/dsp/processing-chain.js";
import {LFO_SHAPES,randomLfoShape,DEFAULT_LFO_STEPS} from "./src/dsp/modulation.js";
import {soundAxis,readSoundParameter,soundParameterPath} from "./soundParameterAdapter.js";
import {modulationTargetsFor,modulationSourcesFor,parameterFor} from "./src/dsp/parameters.js";
import {captureSoundGraphView} from "./soundControlView.js";
// Reusable illustrations for the existing sound controls. These are teaching
// diagrams, not an alternate audio engine or a second source of patch state.
import {movement,pitchCents,BEND_SHAPES} from "./expression.js";
import {harmonicWave,harmonicRecipe} from "./harmonics.js";
import {DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";
import {modeledFilterMagnitude,modeledFilterY} from "./filterIllustrationResponse.js";
import {modeledDelayTaps} from "./delayIllustrationResponse.js";
import {modeledToneWaveform} from "./toneIllustrationResponse.js";
import {modeledModulationTrace} from "./modulationIllustrationResponse.js";
import {modeledVibrato,modeledPitch,MOVEMENT_ILLUSTRATION_SECONDS} from "./movementIllustrationResponse.js";
import {modeledSampleEnvelope,modeledRecordingLevels,SAMPLE_REFERENCE_VIEW} from "./sampleIllustrationResponse.js";
import {envelopeLevelAt,planAmplitudeEnvelope} from "./src/dsp/amplitude-envelope.js";
import {MOD_TARGETS,MOD_SOURCES,defaultSource} from "./src/dsp/modulation.js";
import {assignSoundEdit} from "./soundEditPath.js";
import {cutoffAt} from "./src/dsp/automation.js";
import {WAVES,FILTERS} from "./synth.js";

import {ISOLATED_SOUND_PANELS,isolatedSoundDiagram} from "./soundPanelModels.js";
import {layoutSoundPanels} from "./soundPanelLayout.js";

const NS="http://www.w3.org/2000/svg";
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const at=(patch,path)=>path.reduce((value,key)=>value?.[key],patch);
const axisValue=(patch,path)=>{
 const value=at(patch,path);
 if(typeof value==="number"&&Number.isFinite(value))return value;
 return readSoundParameter(patch,path.join("."))??0;
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
// The envelope lesson must include the complete 3 s attack + 3 s decay
// range, a held stage, and up to 4 s release. Short-note timing can conceal
// entire editable stages even though their nodes and numbers still move.
const illustrationUnits=new WeakMap();
export const setSoundIllustrationTempo=(patch,bpm=120)=>illustrationUnits.set(patch,60/bpm/4);
export const soundIllustrationUnit=patch=>illustrationUnits.get(patch)??.125;
const modulationTrace=(route,unit)=>modeledModulationTrace(route,
 route.source.kind==="envelope"?{duration:10.5,gate:6.25,unit}:{unit});
const pathMatches=(a,b)=>a===b||a.startsWith(b+".")||b.startsWith(a+".");
export const soundControlDomain=(kind,path)=>kind==="stage"&&
 ["volume","gain"].includes(path.split(".")[0])?"stage":"patch";
export const illustrationSignal=(graph,path)=>JSON.stringify(graph.paths
 .filter(line=>line.role!=="guide"&&line.links.some(link=>pathMatches(link,path)))
 .map(line=>line.d));
// A control is covered only by an actual editing node/action on the selected
// view. Prefer a view whose teaching trace responds, not a moving dot/readout.
export function diagramPageForControl(patch,kind,path,current=0){
 const pages=[current,...Array.from({length:diagramPageCount(patch,kind)},(_,i)=>i)
  .filter(i=>i!==current)];
 let fallback=null;
 for(const page of pages){
  const graph=diagram(patch,kind,page);
  const axis=graph.handles.flatMap(point=>point.axes).find(axis=>axis.path.join(".")===path);
  const action=graph.actions.find(action=>action.path.join(".")===path||
   path==="filter.type"&&action.path[0]==="audioFilterBypassed");
  if(!axis&&!action)continue;
  fallback??=page;
  if(action)return page;
  const value=axisValue(patch,axis.path);
  const min=axis.hardMin??axis.min,max=axis.hardMax??axis.max;
  const other=Math.abs(value-min)>Math.abs(value-max)?min:max;
  const changed=cloneEdit(patch,axis.path,other);
  if(illustrationSignal(graph,path)!==illustrationSignal(diagram(changed,kind,page),path))return page;
 }
 return fallback;
}
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
 if(type==="filter")return patch.type==="synth"?3:2;
 if(type==="envelope")return 2;
 if(type==="movement")return 3;
 if(type==="sample")return 2;
 if(type==="automation")return 1;
 if(type.startsWith("harmonics"))return 1;
 return 1;
}
// Diagrams respond to canonical parameters; the measured scope is separate.
export const diagram=(patch,type,page=0,unit=soundIllustrationUnit(patch))=>{
 const disabled=type==="distortion"?processorBypassed(patch,"drive"):type==="delay"?processorBypassed(patch,"delay"):["filter-sweep","tone-movement"].includes(type)?processorBypassed(patch,"filter"):false;
 if(disabled)return {paths:[{d:"M18 60 H342",links:["chain"],role:"reference",secondary:true}],handles:[],labels:[{x:18,y:14,value:"bypassed"}],actions:[],color:"var(--muted)",inactive:[]};
 if(ISOLATED_SOUND_PANELS.has(type))return isolatedSoundDiagram(patch,type);
 if(type==="distortion")return diagram(patch,"filter",patch.type==="synth"?2:1);
 const color=type==="movement"?"var(--signal-mauve)":"var(--track-accent,#08e4ec)";
 const paths=[],handles=[],labels=[],actions=[],inactive=[];
 const dormant=(path,reason)=>inactive.push({path,reason});
 const action=(x,y,path,choices,label)=>actions.push({x,y,path,choices,label});
 const line=(d,secondary=false,links=[],role=secondary?"guide":"signal")=>
  paths.push({d,secondary,links,role});
 const tag=(x,y,value)=>labels.push({x,y,value});
 const handle=(x,y,axes,label)=>handles.push({x,y,axes,label});
 const referenceAxis=(path,min,max,mode,options={})=>({path,min,max,mode,...options});
 const axis=(path,mode,options={})=>soundAxis(patch,path,mode,options);
 const p={...patch,audioFilterBypassed:patch.audioFilterBypassed===true||processorBypassed(patch,"filter")};
 if(type==="stage"){
  // The overview's measured waveform remains factual PCM. This separate
  // explanatory field makes the level knobs directly editable.
  const rack=p.layout==="rack",levels=rack||p.layout==="levels"||page===1,
   volume=clamp(p.volume??1),gain=clamp(p.gain??1),
   pan=levels?0:clamp(p.pan??0,-1,1);
  // Beat stereo edits pan/volume; freeform's two directly visible level
  // knobs instead edit instrument volume and Sound gain. Both are genuine
  // signal stages and their product determines the measured waveform level.
  const x=levels?24+312*volume:24+312*(pan+1)/2;
  const y=100-70*(levels?gain:volume);
  line("M24 100 H336 M24 27 H336 M180 22 V100",true);
  line("M"+x.toFixed(2)+" 25 V100 M24 "+y.toFixed(2)+" H336",
   true,levels?["volume","gain"]:["pan","volume"]);
  // A mono reference passing through the real equal-power stereo gains.
  // The two level stages multiply; a crosshair alone cannot teach that.
  const links=levels?["volume","gain"]:["pan","volume","gain"];
  const angle=(pan+1)*Math.PI/4;
  line(pathRange(180,t=>[24+312*t,50-16*volume*gain*Math.cos(angle)*Math.sin(t*8*Math.PI)]),false,links);
  line(pathRange(180,t=>[24+312*t,80-16*volume*gain*Math.sin(angle)*Math.sin(t*8*Math.PI)]),true,links,"signal");
  if(volume===0||gain===0){
   line(pathRange(180,t=>[24+312*t,50-16*volume*Math.cos(angle)*Math.sin(t*8*Math.PI)]),true,["volume","pan"],"reference");
   line(pathRange(180,t=>[24+312*t,80-16*gain*Math.sin(angle)*Math.sin(t*8*Math.PI)]),true,["gain","pan"],"reference");
   if(volume===0&&gain===0)
    line(pathRange(180,t=>[24+312*t,65-10*Math.cos(angle)*Math.sin(t*8*Math.PI)]),true,["pan"],"reference");
   tag(169,14,"muted · guides");
   if(gain===0)dormant("volume","sound level is zero; the dashed reference isolates instrument volume");
   if(volume===0)dormant("gain","instrument volume is zero; the dashed reference isolates sound level");
  }
  handle(x,y,levels?[
   referenceAxis(["volume"],0,1,"linearX",{from:24,to:336,step:.01,unit:"percent"}),
   referenceAxis(["gain"],0,1,"linearY",{from:100,to:30,step:.01,unit:"percent"})
  ]:[
   referenceAxis(["pan"],-1,1,"linearX",{from:24,to:336,step:.01,unit:"pan"}),
   referenceAxis(["volume"],0,1,"linearY",{from:100,to:30,step:.01,unit:"percent"})
  ],levels?(rack?"rack level / selected sound level":"instrument level / sound level"):
   "stereo position / instrument level");
  tag(18,14,"l/r reference");
  tag(18,112,rack?"quiet rack":levels?"quiet instrument":"left");
  tag(290,112,rack?"loud rack":levels?"loud instrument":"right");
  if(levels)tag(265,15,"total "+Math.round(100*volume*gain)+"%");
 }else if(type==="automation"){
  const total=Math.max(1,(p.bars??1)*16);
  const frequencyY=value=>98-72*clamp(Math.log(Math.max(50,value)/50)/Math.log(280));
  line("M18 103 H342 M18 20 V103",true);
  line(pathRange(240,t=>[18+324*t,frequencyY(cutoffAt(p,t*total,p.points[0].value))]),
   false,p.points.flatMap((_,i)=>["points."+i+".step","points."+i+".value"]));
  for(const [index,point] of p.points.entries()){
   const x=18+324*clamp(point.step/total),y=frequencyY(point.value);
   line("M"+x.toFixed(2)+" 102 V"+y.toFixed(2),true,
    ["points."+index+".step","points."+index+".value"]);
   handle(x,y,[
    referenceAxis(["points",index,"step"],0,total,"linearX",{from:18,to:342,step:1,unit:"step",
     hardMin:index?p.points[index-1].step+1:0,hardMax:index<p.points.length-1?p.points[index+1].step-1:total}),
    axis(["points",index,"value"],"logY",{from:98,to:26,unit:"Hz"})
   ],(index===0?"start":index===p.points.length-1?"end":"point "+(index+1))+" position / brightness");
   tag(x+4,Math.max(16,y-8),index===0?"start":index===p.points.length-1?"end":String(index+1));
  }
  tag(18,14,"high");tag(18,111,"low");tag(278,112,"bar →");
 }else if(type.startsWith("harmonics")){
  const index=Number(type.replace("harmonics","")),slot=p.oscillators[index];
  const harmonicValues=slot?.harmonics??harmonicRecipe();
  line("M18 50 H342 M18 100 H342",true);
  line(pathRange(256,t=>[18+t*324,32-17*harmonicWave(harmonicValues,2*Math.PI*t)]),
   false,["oscillators."+index+".harmonics"]);
  for(let j=0;j<32;j++){
   const n=j,x=23+j*314/31,value=clamp(harmonicValues[n]??0);
   line("M"+x+" 100 V"+(100-41*value).toFixed(2),false,
    ["oscillators."+index+".harmonics."+n]);
   handle(x,100-41*value,[
    axis(["oscillators",index,"harmonics",n],"linearY",{from:100,to:59,unit:"percent"})
   ],"harmonic "+(n+1)+" level");
   if(n===0||n===31||n%8===7)tag(x-5,111,"h"+(n+1));
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
    index===1,sourceKeys(index),"signal");
   if(o.level===0){
    line(pathRange(280,t=>[18+324*t,center-8*waveAt(o.wave,
     t*10*Math.PI*2**o.octave*2**(o.detune/1200),o.harmonics)]),true,sourceKeys(index),"reference");
    dormant("oscillators."+index+".detune","oscillator level is zero; the dashed waveform isolates its source");
    tag(190,center-14,"level off · guide");
   }
   const bottom=center+amplitude,top=center-amplitude;
   handle(38+clamp((o.detune+100)/200)*278,bottom-(bottom-top)*clamp(o.level),[
    axis(["oscillators",index,"detune"],"linearX",{from:38,to:316}),
    axis(["oscillators",index,"level"],"linearY",{from:bottom,to:top})
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
 }else if(type==="filter"&&page===(p.type==="synth"?2:1)){
  const synth=p.type==="synth",drive=synth?p.effects.drive:p.drive??0;
  const f=p.filter??DEFAULT_SAMPLE_FILTER;
  const drivePath=synth?["effects","drive"]:["drive"];
  const links=["chain","filter.cutoff","filter.resonance","filter.type",drivePath.join(".")];
  const tone=modeledToneWaveform(p);
  const scale=Math.max(1,...tone.input.map(Math.abs),...tone.output.map(Math.abs));
  const wavePath=values=>pathFrom(values.map((value,i)=>
   [22+316*i/(values.length-1),60-30*value/scale]));
  line("M20 60 H342",true);
  line(wavePath(tone.input),true);
  line(wavePath(tone.output),false,links);
  const cutoff=clamp(Math.log(f.cutoff/50)/Math.log(280));
  const x=26+308*cutoff,y=104-78*drive;
  handle(x,y,[
   ...(!p.audioFilterBypassed?[axis(["filter","cutoff"],"logX",
    {from:26,to:334,step:1,unit:"Hz"})]:[]),
   axis(drivePath,"linearY",{from:104,to:26,unit:"percent"})
  ],p.audioFilterBypassed?"distortion (filter off)":"brightness / distortion");
  tag(18,14,"220 hz reference tone");tag(18,111,"drive ↑");
  tag(340,111,p.audioFilterBypassed?"filter off":"brightness →");
  tag(340,14,"before ··· / after");
  if(!p.audioFilterBypassed){
   handle(26+308*(f.resonance-.1)/15.9,92,[axis(["filter","resonance"],"linearX",{from:26,to:334})],"resonance");
   action(180,105,["filter","type"],FILTERS,"filter shape");
  }else action(180,105,["audioFilterBypassed"],[true,false],"turn filter on");
  tag(168,111,"±"+shortValue(scale));
 }else if(type==="filter"&&page===1){
   const f=p.filter,sweep=f.sweep??0,time=f.sweepTime??.2;
   const noise=clamp(p.noise??0),decay=clamp(p.noiseDecay??0,0,4);
   line("M26 68 H164 M193 100 H341",true);
   // On this diagram time really is horizontal and the starting cutoff
   // deviation really is vertical, just as the two-axis handle suggests.
   const finish=26+138*clamp((time-.01)/2.99),startY=68-6*sweep;
   const actualSweep=Math.log2(clamp(f.cutoff*2**sweep,50,14000)/f.cutoff);
   line("M26 "+(68-6*actualSweep).toFixed(2)+" L"+finish.toFixed(2)+" 68 H164",
    false,["filter.sweep","filter.sweepTime"]);
   line("M26 "+startY.toFixed(2)+" H"+finish.toFixed(2)+" V68",
    true,["filter.sweep","filter.sweepTime"]);
   if(sweep===0){
    line("M26 44 L"+finish.toFixed(2)+" 68 H164",true,["filter.sweepTime"],"reference");
    dormant("filter.sweepTime","filter sweep is zero; the dashed curve is a timing reference");
   }else if(Math.abs(actualSweep-sweep)>1e-9){
    line("M26 "+startY.toFixed(2)+" L"+finish.toFixed(2)+" 68 H164",true,
     ["filter.sweep","filter.sweepTime"],"reference");
    dormant("filter.sweep","cutoff range limits this sweep; the dashed curve shows the requested change");
    dormant("filter.sweepTime","cutoff range limits this sweep; the dashed curve shows the requested timing");
   }
   handle(finish,startY,[
    axis(["filter","sweepTime"],"linearX",{from:26,to:164,unit:"s"}),
    axis(["filter","sweep"],"linearY",{from:98,to:38,unit:"oct"})
   ],"filter sweep duration / starting brightness");
   const noisePath=level=>pathRange(240,t=>[193+148*t,82-
    17*level*(decay>0?Math.exp(-t*4*5/decay):1)*Math.cos(t*83)*Math.cos(t*9)]);
   line(noisePath(noise),false,["noise","noiseDecay"]);
   if(noise===0){
    line(noisePath(.7),true,["noiseDecay"],"reference");
    dormant("noiseDecay","noise level is zero; the dashed curve is a noise decay reference");
   }
   handle(197+clamp(decay/4)*137,100-noise*39,[
    axis(["noiseDecay"],"linearX",{from:197,to:334,unit:"s"}),
    axis(["noise"],"linearY",{from:100,to:61,unit:"percent"})
   ],"noise duration / level");
   tag(24,17,sweep===0?"sweep off · guide":Math.abs(actualSweep-sweep)>1e-9?"sweep limited · guide":"filter sweep");
   tag(195,17,noise===0?"noise off · guide":"noise");
   tag(22,111,"time →");tag(281,111,"decay →");
 }else if(type==="filter"){
  if(p.audioFilterBypassed){
   // Preserve the vocal editor's existing neutral bypass representation.
   line("M18 95 H344 M18 22 V95",true);
   line("M18 35 H342",false,["filter.type","chain"]);
   tag(18,14,"off");tag(304,110,"dry");
   action(122,61,["audioFilterBypassed"],[true,false],"turn filter on");
  }else{
  const f=p.filter||((p.type==="sample"||p.type==="vocal")?DEFAULT_SAMPLE_FILTER:
   {type:"lowpass",cutoff:8000,resonance:1});
  const freq=x=>50*280**((x-18)/324);
  const cutoff=clamp(Math.log(Math.max(50,f.cutoff)/50)/Math.log(280));
  const x=18+cutoff*324,r=clamp((f.resonance-.1)/15.9);
  const base=f.type==="bandpass"?1:f.type==="notch"?0:.5;
  // This response is the fixed-rate, 48 kHz analytic biquad model matching
  // native/filter.hpp and Web Audio, not an arbitrary cutoff sigmoid or a
  // measurement of the current voice. Live PCM remains in the sound scope.
  line("M18 95 H344 M18 41 H344 M18 22 V95",true);
  line(pathRange(300,t=>{
   const px=18+t*324;
   return [px,modeledFilterY(modeledFilterMagnitude(f,freq(px)))];
  }),false,["filter.cutoff","filter.resonance","filter.type"]);
  line("M"+x.toFixed(2)+" 97 V19",true);
  handle(x,95-60*base-25*r,[
   axis(["filter","cutoff"],"logX",{from:18,to:342,unit:"Hz"}),
   axis(["filter","resonance"],"linearY",{from:95-60*base,to:95-60*base-25})
  ],"cutoff / resonance");
  tag(18,15,"low");tag(308,15,"high");tag(146,15,"48k model");
  action(90,103,["filter","type"],FILTERS,"filter shape");
  if(p.type!=="synth")
   action(189,103,["audioFilterBypassed"],[false,true],"turn filter off");
  }
 }else if(type==="sample"&&page===0){
  const e=modeledSampleEnvelope(p),vocal=p.type==="vocal";
  const px=time=>18+324*time/SAMPLE_REFERENCE_VIEW;
  line("M18 90 H344 M"+px(e.fadeStart).toFixed(2)+" 18 V96",true);
  line(pathFrom([[18,90],[px(e.attackEnd),23],[px(e.fadeStart),23],
   [px(e.life),90],[344,90]]),false,vocal?["attack","release"]:["attack","release","oneShot","followPitch"]);
  handle(px(e.attackEnd),23,[axis(["attack"],"linearX",
   {from:px(vocal?0:.001),to:px(2+(vocal?0:.001)),step:.005,unit:"s"})],"attack");
  const release=p.release??.17;
  const releaseAt=value=>px(e.releaseMovesStart?8-value:4+value);
  handle(releaseAt(release),e.releaseMovesStart?23:90,[axis(["release"],"linearX",
   {from:releaseAt(e.releaseMin),to:releaseAt(3),step:e.releaseStep,unit:"s"})],"release");
  tag(18,14,"on");tag(115,14,"time guide");
  tag(px(e.fadeStart),14,vocal?"fade":p.oneShot?"tail":p.followPitch===false?"end":"off");
  tag(340,111,"8s reference take");
  if(!vocal){
   action(140,106,["oneShot"],[false,true],"play entire recording");
   action(250,106,["followPitch"],[true,false],"follow played note");
  }
  tag(18,111,vocal?"voice":(p.followPitch===false?"root ":"pitch ")+(p.zones?.[0]?.root??60));
 }else if(type==="envelope"&&page===1){
  const e=p.envelope,off=.25;
  // This short, fixed-duration note reveals an important distinction hidden
  // by the held-note stage overview: the actual synth stops attack/decay at
  // NOTE-OFF, then releases from its CURRENT level, not always from sustain.
  // Reuse the same envelope planner and level calculation as real playback.
  const plan=planAmplitudeEnvelope({start:0,off,peak:1,envelope:e});
  const yFor=value=>67-40*clamp(value);
  const endingX=234+104*clamp((e.release-.01)/3.99);
  line("M18 67 H344 M218 21 V67",true);
  const before=Array.from({length:101},(_,i)=>{
   const t=off*i/100;
   return [18+200*i/100,yFor(envelopeLevelAt(e,1,t))];
  });
  line(pathFrom([...before,[endingX,yFor(.000001)]]),false,
   ["envelope.attack","envelope.decay","envelope.sustain","envelope.release"]);
  const attackX=32+131*clamp(e.attack/3),decayY=107-27*clamp(e.decay/3);
  const sustainX=224+112*clamp(e.sustain),releaseY=107-27*clamp((e.release-.01)/3.99);
  line("M32 107 H163 M224 107 H336",true);
  handle(attackX,decayY,[
   axis(["envelope","attack"],"linearX",{from:32,to:163,unit:"s"}),
   axis(["envelope","decay"],"linearY",{from:107,to:80,unit:"s"})
  ],"attack / decay");
  handle(sustainX,releaseY,[
   axis(["envelope","sustain"],"linearX",{from:224,to:336,unit:"percent"}),
   axis(["envelope","release"],"linearY",{from:107,to:80,unit:"s"})
  ],"sustain / release");
  tag(18,14,"0.25s note");tag(260,14,"release");
  tag(18,78,"attack / decay");tag(224,78,"sustain / fade");
  // Keep the actual note-off level discoverable without claiming the
  // deliberately separated pre- and post-off time scales are uniform.
  tag(223,68,Math.round(plan.releaseLevel*100)+"%");
 }else if(type==="envelope"){
  const e=p.envelope,attackMax=parameterFor("envelope.attack").max,releaseParameter=parameterFor("envelope.release"),releaseMax=releaseParameter.max,releaseMin=releaseParameter.min;
  const attackX=25+clamp(e.attack/attackMax)*78;
  const decayX=attackX+18+clamp(e.decay/3)*80;
  const sustainY=88-65*clamp(e.sustain);
  const releaseX=248+clamp(e.release/releaseMax)*95;
  line("M18 90 H348 M248 18 V96",true);
  const points=[[18,90],[attackX,23],[decayX,sustainY],[248,sustainY],[releaseX,90],[348,90]];
  line(pathFrom(points),false,["envelope.attack","envelope.decay","envelope.sustain","envelope.release"]);
  handle(attackX,23,[axis(["envelope","attack"],"linearX",{from:25,to:103,unit:"s"})],"attack");
   handle(decayX,sustainY,[
    axis(["envelope","decay"],"linearX",{from:attackX+18,to:attackX+98,unit:"s"}),
    axis(["envelope","sustain"],"linearY",{from:88,to:23,unit:"percent"})
   ],"decay / sustain");
  handle(releaseX,90,[axis(["envelope","release"],"linearX",
   {from:248+95*releaseMin/releaseMax,to:343,step:.01,unit:"s"})],"release");
  tag(18,14,"on");
  tag(115,14,"held note model");tag(248,14,"off");
 }else if(type==="sample"&&page===1){
  const gain=clamp(p.gain??.9,0,2),transpose=p.transpose??0,pan=p.pan??0,strum=p.strumMs??0;
  if(p.type==="vocal"){
   // Vocal clips do not have the sample's strum/pitch-follow options.
   // This graph edits the actual three common voice controls instead.
   // A vocal Recording has arbitrary PCM, not a deterministic sine wave.
   // Teach actual pitch/level control directions without presenting invented
   // samples as its waveform; the vocal waveform editor shows measured PCM.
   const voiceX=19+148*clamp((transpose+24)/48);
   const voiceY=99-50*gain/2;
   line("M18 100 H169 M193 82 H342 M93 43 V100",true);
   line("M93 "+voiceY.toFixed(2)+" H"+voiceX.toFixed(2)+
    " M"+voiceX.toFixed(2)+" 100 V"+voiceY.toFixed(2),
    true,["transpose","gain"]);
   handle(19+148*clamp((transpose+24)/48),99-50*gain/2,[
    axis(["transpose"],"linearX",{from:19,to:167,unit:"st"}),
    axis(["gain"],"linearY",{from:99,to:49,unit:"percent"})
   ],"voice pitch / level");
   const x=202+130*clamp((pan+1)/2);
   line("M"+x.toFixed(2)+" 64 V100",true,["pan"]);
   handle(x,82,[
    axis(["pan"],"linearX",{from:202,to:332,unit:"pan"})
   ],"voice left / right");
   tag(19,15,"pitch → / level ↑");tag(204,15,"left ← stereo → right");
   tag(19,112,"control model");
  line(pathRange(400,t=>[19+148*t,75-10*gain/2*Math.sin(t*.1*55*2**(transpose/12)*2*Math.PI)]),
   false,["transpose","gain"]);
  tag(19,32,"55 hz reference");
  }else{
  // Strum displaces the onset in time; transpose shifts played pitch.
  // Do not fabricate a sine waveform for an arbitrary imported Recording:
  // this guide is a parameter diagram, not a source PCM measurement.
  const onsetX=19+clamp((strum+25)/50)*148;
  const pitchY=60-35*clamp(transpose/24,-1,1);
  line("M18 60 H171 M192 104 H342 M93 24 V96",true);
  line("M93 60 H"+onsetX.toFixed(2)+" V"+pitchY.toFixed(2),
   true,["transpose","strumMs"]);
  // X is the recording's onset displacement; Y is its pitch shift.
  handle(19+clamp((strum+25)/50)*148,60-35*clamp(transpose/24,-1,1),[
   axis(["strumMs"],"linearX",{from:19,to:167,unit:"ms"}),
   axis(["transpose"],"linearY",{from:95,to:25,unit:"st"})
  ],"sample onset / pitch");
  line("M202 83 H332",true);
  line("M"+(202+130*(pan+1)/2).toFixed(2)+" 83 V"+(103-35*gain/2).toFixed(2),
   true,["pan","gain"]);
  handle(202+130*(pan+1)/2,103-35*gain/2,[
   axis(["pan"],"linearX",{from:202,to:332,unit:"pan"}),
   axis(["gain"],"linearY",{from:103,to:68,unit:"percent"})
  ],"stereo position / recording level");
  tag(19,15,"onset / pitch");
  tag(19,112,"control model");
  action(65,107,["followPitch"],[true,false],"follow played note");
  action(299,107,["preserveDynamics"],[false,true],"preserve recorded dynamics");
  // The same octave-up test note teaches pitch-follow versus root playback.
  const rate=2**(transpose/12)*(p.followPitch===false?1:2);
  const start=.025+strum/1000;
  line(pathRange(640,t=>{
   const elapsed=t*.1-start;
   return [19+148*t,60-(elapsed>=0?10*Math.sin(elapsed*55*rate*2*Math.PI):0)];
  }),false,["transpose","strumMs","followPitch"]);
  tag(19,32,"55 hz reference");
  const levels=modeledRecordingLevels(p);
  for(const [i,level] of levels.entries())
   line(pathRange(100,t=>[196+i*74+66*t,31-70*level*Math.sin(t*6*Math.PI)]),
    false,["preserveDynamics","gain"]);
  tag(205,15,"reference levels");
  }
  const angle=(pan+1)*Math.PI/4;
  for(const [i,level] of [Math.cos(angle),Math.sin(angle)].entries())
   line(pathRange(160,t=>[196+146*t,57+i*16-6*level*gain/2*Math.sin(t*8*Math.PI)]),
    false,["pan","gain"]);
  if(gain===0){
   for(const [i,level] of [Math.cos(angle),Math.sin(angle)].entries())
    line(pathRange(160,t=>[196+146*t,57+i*16-4*level*Math.sin(t*8*Math.PI)]),
     true,["pan"],"reference");
   dormant("pan","recording level is zero; dashed left/right signals are a stereo reference");
   if(p.type==="vocal"){
    line(pathRange(400,t=>[19+148*t,75-8*Math.sin(t*.1*55*2**(transpose/12)*2*Math.PI)]),
     true,["transpose"],"reference");
    dormant("transpose","recording level is zero; the dashed tone isolates pitch");
   }else{
    const levels=modeledRecordingLevels({...p,gain:1});
    for(const [i,level] of levels.entries())
     line(pathRange(100,t=>[196+i*74+66*t,31-70*level*Math.sin(t*6*Math.PI)]),
      true,["preserveDynamics"],"reference");
   }
   tag(240,89,"level off · guide");
  }
 }else if(type==="movement"&&page===1){
  const m=movement(p),bend=p.bend??{shape:"straight",amount:2,rate:4};
  line("M18 61 H344",true);
  line(pathRange(250,t=>[18+326*t,61-5*pitchCents({bend},m,t*1.25,1.25)/100]),
   false,["bend.shape","bend.amount","bend.rate","movement.glide","movement.glideTime"]);
  if(bend.shape!=="wave"||bend.amount===0){
   line(pathRange(320,t=>[18+326*t,61-5*pitchCents({bend:{...bend,shape:"wave"}},
    {...m,glide:0},t*1.25,1.25)/100]),true,["bend.amount","bend.rate"],"reference");
   if(bend.amount===0){
    line(pathRange(320,t=>[18+326*t,61-5*pitchCents({bend:{...bend,shape:"wave",amount:3}},
     {...m,glide:0},t*1.25,1.25)/100]),true,["bend.rate"],"reference");
    dormant("bend.rate","bend amount is zero; the dashed wave is a rate reference");
   }else dormant("bend.rate","wave speed only affects the wave bend shape; the dashed wave is a reference");
   if(bend.shape==="straight")dormant("bend.amount","straight has no bend; the dashed wave is a reference");
   tag(166,14,"wave guide");
  }
  handle(42+clamp((bend.rate-.1)/11.9)*275,61-34*clamp(bend.amount/12),[
   axis(["bend","rate"],"linearX",{from:42,to:317}),
   axis(["bend","amount"],"linearY",{from:61,to:27})
  ],"bend speed / amount");
  const waitingPatch=m.depth>0?p:{...p,movement:{...m,depth:50}};
  if(m.depth===0)dormant("movement.delay","vibrato depth is zero; the dashed curve is a waiting-time reference");
  line(pathRange(360,t=>[18+326*t,100-12*modeledVibrato(waitingPatch,t*MOVEMENT_ILLUSTRATION_SECONDS)/100]),
   m.depth===0,["movement.delay","movement.depth","movement.rate"],m.depth>0?"signal":"reference");
  const waitX=18+326*m.delay/MOVEMENT_ILLUSTRATION_SECONDS;
  line("M"+waitX.toFixed(2)+" 85 V110",true);
  handle(waitX,103,[
   axis(["movement","delay"],"linearX",{from:18,to:18+326*3/MOVEMENT_ILLUSTRATION_SECONDS,unit:"s"})
  ],"vibrato waiting time");
  action(87,108,["bend","shape"],BEND_SHAPES.map(([value])=>value),"bend shape");
  tag(18,14,"pitch bend");tag(245,82,m.depth>0?"vibrato waits":"vibrato off · guide");
 }else if(type==="movement"&&page===2){
  const m=movement(p),pulse=clamp(m.tremolo??0),tone=clamp(m.tone??0),pan=clamp(p.pan??0,-1,1);
  line("M18 47 H170 M190 47 H342 M83 103 H277",true);
  line(pathRange(145,t=>[18+152*t,47-15*pulse*Math.sin(2*Math.PI*t*1.3*(m.tremoloRate??5))]),
   false,["movement.tremolo","movement.tremoloRate"]);
  if(pulse===0){
   line(pathRange(240,t=>[18+152*t,47-10*Math.sin(2*Math.PI*t*1.3*(m.tremoloRate??5))]),
    true,["movement.tremoloRate"],"reference");
   dormant("movement.tremoloRate","pulse amount is zero; the dashed curve is a rate reference");
  }
  handle(22+clamp(((m.tremoloRate??5)-.1)/19.9)*143,47-22*pulse,[
   axis(["movement","tremoloRate"],"linearX",{from:22,to:165}),
   axis(["movement","tremolo"],"linearY",{from:47,to:25})
  ],"volume pulse speed / depth");
  // Only the synth has tone movement knobs. A recorded Sound must not gain
  // an illustration-only control that its native renderer cannot mirror.
  if(p.type==="synth"){
   line(pathRange(145,t=>[190+152*t,47-15*tone*Math.sin(2*Math.PI*t*1.3*(m.toneRate??2))]),
    false,["movement.tone","movement.toneRate"]);
   if(tone===0){
    line(pathRange(240,t=>[190+152*t,47-10*Math.sin(2*Math.PI*t*1.3*(m.toneRate??2))]),
     true,["movement.toneRate"],"reference");
    dormant("movement.toneRate","tone movement is zero; the dashed curve is a rate reference");
   }
   handle(194+clamp(((m.toneRate??2)-.1)/19.9)*143,47-22*tone,[
    axis(["movement","toneRate"],"linearX",{from:194,to:337}),
    axis(["movement","tone"],"linearY",{from:47,to:25})
   ],"tone movement speed / depth");
  }
  handle(83+(pan+1)*97,103,[
   axis(["pan"],"linearX",{from:83,to:277})
  ],"stereo pan");
  const panAngle=(pan+1)*Math.PI/4;
  line(pathRange(100,t=>[18+152*t,103-7*Math.cos(panAngle)*Math.sin(t*6*Math.PI)]),false,["pan"]);
  line(pathRange(100,t=>[190+152*t,103-7*Math.sin(panAngle)*Math.sin(t*6*Math.PI)]),false,["pan"]);
  tag(20,16,pulse===0?"pulse off · guide":"volume pulse");
  if(p.type==="synth")tag(196,16,tone===0?"tone off · guide":"tone movement");
  tag(107,89,"left ←  stereo  → right");
 }else if(type==="movement"){
  const m=movement(p);
  line("M15 62 H345",true);
  line(pathRange(640,t=>{
   const time=t*MOVEMENT_ILLUSTRATION_SECONDS;
   return [15+t*330,62-clamp(modeledPitch(p,time)/100*3.5,-43,43)];
  }),false,["bend.shape","bend.amount","bend.rate","movement.glide","movement.glideTime","movement.depth","movement.rate","movement.delay"]);
  if(m.glide===0){
   line(pathRange(320,t=>[15+330*t,62-3.5*pitchCents(null,{...m,glide:6},
    t*MOVEMENT_ILLUSTRATION_SECONDS,MOVEMENT_ILLUSTRATION_SECONDS)/100]),
    true,["movement.glideTime"],"reference");
   dormant("movement.glideTime","glide is zero; the dashed curve is a glide-time reference");
   tag(120,14,"glide off · guide");
  }
  handle(15+330*m.glideTime/MOVEMENT_ILLUSTRATION_SECONDS,62-clamp(m.glide*3.5,-42,42),[
   axis(["movement","glideTime"],"linearX",{from:15+330*.01/MOVEMENT_ILLUSTRATION_SECONDS,to:15+330*3/MOVEMENT_ILLUSTRATION_SECONDS,unit:"s"}),
   axis(["movement","glide"],"linearY",{from:104,to:20})
  ],"glide duration / starting pitch");
  handle(48+clamp((m.rate-.1)/19.9)*260,62-35*m.depth/100,[
   axis(["movement","rate"],"linearX",{from:48,to:308}),
   axis(["movement","depth"],"linearY",{from:62,to:27})
  ],"vibrato rate / depth");
  tag(15,14,"pitch");tag(287,14,"rate →");
  const vibratoPatch=m.depth>0?p:{...p,movement:{...m,depth:50}};
  line(pathRange(640,t=>[18+324*t,98-12*modeledVibrato(vibratoPatch,t*MOVEMENT_ILLUSTRATION_SECONDS)/100]),
   m.depth===0,["movement.rate","movement.depth","movement.delay"],m.depth>0?"signal":"reference");
  if(m.depth===0)dormant("movement.rate","vibrato depth is zero; the dashed curve is a rate reference");
  tag(20,80,m.depth>0?"vibrato":"vibrato off · guide");tag(338,110,"4.5 s");
 }else if(type==="delay"){
  const delayPath=key=>soundParameterPath("effects."+key,p.type);
  const delayLink=key=>delayPath(key).join(".");
  const e=Object.fromEntries(["delayMix","delayTime","delayFeedback"].map(key=>
   [key,readSoundParameter(p,"effects."+key)]));
  const mix=e.delayMix,feedback=e.delayFeedback;
  const space=24+clamp((e.delayTime-.05)/.95)*66,origin=52;
  line("M16 100 H348",true);
  // A unit impulse exposes the host's real dry attenuation and three wet
  // returns: send=mix*.55, wet=.8, then feedback^n with an additional
  // 128-frame cycle delay. Unlike the former sketch, an echo is NOT mix*1.
  // The position scale expands musical delay time so its small quantum lag
  // remains barely visible. The measured scope still shows actual PCM.
  const taps=modeledDelayTaps(e);
  for(const tap of taps){
   const x=origin+space*(tap.time/e.delayTime);
   line("M"+x.toFixed(2)+" 100 V"+(100-72*tap.level).toFixed(2),
    tap.index>0,tap.index?
     [delayLink("delayTime"),delayLink("delayMix"),delayLink("delayFeedback")]:
     [delayLink("delayMix")],"signal");
   if(tap.index>0&&tap.level>0)
    tag(x+4,Math.max(18,94-72*tap.level),String(tap.index));
  }
  if(mix===0){
   for(const tap of modeledDelayTaps({...e,delayMix:.5}).slice(1)){
    const x=origin+space*(tap.time/e.delayTime);
    line("M"+x.toFixed(2)+" 100 V"+(100-72*tap.level).toFixed(2),true,
     [delayLink("delayTime"),delayLink("delayFeedback")],"reference");
   }
   tag(172,15,"wet off · guide");
   dormant(delayLink("delayTime"),"delay mix is zero; dashed returns isolate echo spacing");
   dormant(delayLink("delayFeedback"),"delay mix is zero; dashed returns isolate feedback");
  }
  handle(origin+space,100-72*mix,[
   axis(delayPath("delayTime"),"linearX",
    {from:origin+24,to:origin+90,step:.01,unit:"s"}),
   axis(delayPath("delayMix"),"linearY",{from:100,to:28,unit:"percent"})
  ],"delay time / mix");
  // Feedback is independently editable even with the wet mix at zero.
  // A faint guide communicates potential repeat persistence without falsely
  // depicting an audible echo until delay mix is raised.
  const feedbackX=origin+2*space,feedbackY=100-64*feedback/.8;
  line("M"+feedbackX.toFixed(2)+" 100 V"+feedbackY.toFixed(2),
   true,[delayLink("delayFeedback")]);
  handle(feedbackX,feedbackY,[
   axis(delayPath("delayTime"),"linearX",{from:origin+48,to:origin+180,unit:"s"}),
   axis(delayPath("delayFeedback"),"linearY",
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
   handle(x,y,[axis(["zones",index,"root"],"linearX",
    {from:18,to:342,step:1,unit:"MIDI"})],"sample "+(index+1)+" recorded pitch");
   tag(23,y-8,String(index+1));
  }
 }else if(type==="modulation"){
  const routes=p.modulation?.routes??[];
  const routePages=Math.max(1,Math.ceil(routes.length/4));
  if(page<routePages){
   tag(17,13,"source");tag(161,13,"smoothed");tag(338,13,"target");
   if(!routes.length)line("M24 57 H336",true);
   // The four-route overview is a readable map of the real modulation signal.
   const start=Math.max(0,page)*4,shown=routes.slice(start,start+4),centers=[30,51,73,95];
   shown.forEach((route,j)=>{
    const i=start+j,center=centers[j];
    const target=MOD_TARGETS.find(t=>t.id===route.target),limit=target?.limit||1;
    line("M67 "+center+" H290",true);
    const trace=modulationTrace(route,unit);
    const visualScale=route.unit==="cents"?20:route.unit==="octaves"?.6:.2;
    const tracePath=values=>pathFrom(values.map((value,n)=>
     [67+223*n/(values.length-1),center-9*Math.tanh(value/visualScale)]));
    line(tracePath(trace.raw),true);
    line(tracePath(trace.smoothed),false,["modulation.routes."+i]);
    if(route.depth===0){
     line(tracePath(modulationTrace({...route,depth:limit*.5},unit).smoothed),true,
      ["modulation.routes."+i],"reference");
     dormant("modulation.routes."+i+".smoothing","movement depth is zero; the dashed trace isolates its source and smoothing");
    }
    // Depth is always editable; a time-based source adds a genuine second axis.
    const depth=clamp(route.depth/limit,-1,1);
    const rate=route.source.kind==="lfo"&&!route.source.sync?route.source.rate:null;
    handle(rate===null?75+215*clamp((route.smoothing??0)/.1):
     75+215*clamp((rate-.01)/19.99),center-8*depth,[
     rate===null?axis(["modulation","routes",i,"smoothing"],"linearX",{from:75,to:290,unit:"s"}):
      axis(["modulation","routes",i,"source","rate"],"linearX",{from:75,to:290,unit:"Hz"}),
     axis(["modulation","routes",i,"depth"],"linearY",{from:center+8,to:center-8})
    ],"movement "+(i+1)+" "+(rate===null?"smoothing / depth":"speed / depth"));
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
    const trace=modulationTrace(route,unit);
    const tracePath=values=>pathFrom(values.map((value,n)=>
     [24+312*n/(values.length-1),61-32*clamp(value/Math.max(.001,limit),-1,1)]));
    line(tracePath(trace.raw),true);
    line(tracePath(trace.smoothed),false,["modulation.routes."+i]);
    if(route.depth===0){
     line(tracePath(modulationTrace({...route,depth:limit*.5},unit).smoothed),true,
      ["modulation.routes."+i],"reference");
     for(const path of ["smoothing","source.rate","source.root","source.span",
      "source.envelope.attack","source.envelope.decay","source.envelope.sustain","source.envelope.release"])
      dormant("modulation.routes."+i+"."+path,"movement depth is zero; the dashed trace isolates its source and smoothing");
     tag(192,43,"depth off · guide");
    }
    const primary=source.kind==="lfo"&&!source.sync?
     [axis([...prefix,"source","rate"],"linearX",{from:35,to:317})]:
     [axis([...prefix,"smoothing"],"linearX",{from:35,to:317})];
    handle(35+282*clamp(source.kind==="lfo"&&!source.sync?(source.rate-.01)/19.99:
     (route.smoothing??0)/.1),61-35*depth,[
     ...primary,axis([...prefix,"depth"],"linearY",
      {from:96,to:26,step:target?.unit==="cents"?1:.01})
    ],source.kind==="lfo"&&!source.sync?"route speed / depth":"route smoothing / depth");
    if(source.kind==="lfo"){
     // Smoothing is independent of the oscillator speed and movement depth.
     line("M35 90 H317",true,["modulation.routes."+i+".smoothing"]);
     handle(35+282*clamp((route.smoothing??0)/.1),90-18*depth,[
      axis([...prefix,"smoothing"],"linearX",{from:35,to:317,unit:"s"}),
      axis([...prefix,"depth"],"linearY",
       {from:108,to:72,step:target?.unit==="cents"?1:.01})
     ],"movement smoothing / depth");
     tag(254,112,"smooth →");
    }
    if(source.kind==="lfo"&&randomLfoShape(source.shape)){
     handle(35+282*((source.seed??1)-1)/126,25,[
      axis([...prefix,"source","seed"],"linearX",{from:35,to:317,step:1})
     ],"random sequence seed");
    }
    if(source.kind==="lfo"&&source.shape==="steps"){
     const values=source.steps??DEFAULT_LFO_STEPS;
     for(let step=0;step<4;step++)handle(59+78*step,61-32*values[step],[
      axis([...prefix,"source","steps",step],"linearY",{from:93,to:29,step:.01})
     ],"movement step "+(step+1));
    }
    if(source.kind==="envelope"){
     if(route.depth!==0)tag(248,43,"6.25 s note");
     const e=source.envelope;
     handle(39+110*clamp(e.attack/3),99-31*clamp(e.sustain),[
      axis([...prefix,"source","envelope","attack"],"linearX",
       {from:39,to:149,step:.01}),
      axis([...prefix,"source","envelope","sustain"],"linearY",
       {from:99,to:68,step:.01})
     ],"movement envelope attack / sustain");
     handle(188+138*clamp(e.decay/3),99-31*clamp((e.release-.01)/3.99),[
      axis([...prefix,"source","envelope","decay"],"linearX",
       {from:188,to:326,step:.01}),
      axis([...prefix,"source","envelope","release"],"linearY",
       {from:99,to:68,step:.01})
     ],"movement envelope decay / release");
    }else if(source.kind==="keytrack"){
     handle(39+287*clamp(source.root/127),99-32*clamp((source.span-1)/126),[
      axis([...prefix,"source","root"],"linearX",{from:39,to:326}),
      axis([...prefix,"source","span"],"linearY",{from:99,to:67})
     ],"key tracking center / spread");
    }
    action(73,14,[...prefix,"source","kind"],modulationSourcesFor(p.type),"movement source");
    action(185,14,[...prefix,"polarity"],["unipolar","bipolar"],"movement range");
    action(286,14,[...prefix,"target"],modulationTargetsFor(p.type).map(item=>item.id),"movement target");
    tag(22,111,"route "+(i+1)+" · "+(target?.name||route.target));
    if(source.kind==="lfo")action(286,111,[...prefix,"source","shape"],LFO_SHAPES,"movement shape");
   }
  }
 }
 return {paths,handles,labels,actions,color,inactive};
};
let zoomId=null;
function setZoom(wrapper,id,enabled){
 // The regular disclosure is still present inside a zoomed panel, but zoom
 // has one exit: its X. Restore any prior panel's normal expand control.
 for(const panel of document.querySelectorAll(".visual-sound-panel.zoomed")){
  panel.classList.remove("zoomed");
  const oldButton=panel.querySelector(".visual-panel-expand");
  if(oldButton){
   oldButton.textContent="⤢";
   oldButton.setAttribute("aria-label","expand "+panel.dataset.visualKind+" illustration");
   oldButton.title="expand illustration";
   panel.querySelector(".visual-panel-area")?.append(oldButton);
  }
 }
 zoomId=enabled?id:null;
 document.body.classList.toggle("sound-visual-zoom",enabled);
 wrapper.classList.toggle("zoomed",enabled);
 const button=wrapper.querySelector(".visual-panel-expand");
 if(button){
  button.textContent=enabled?"×":"⤢";
  button.setAttribute("aria-label",(enabled?"close expanded ":"expand ")+id.split("-")[0]+" illustration");
  button.title=enabled?"close expanded illustration":"expand illustration";
  // In zoom the X belongs to the module header, never to the graph itself.
  (enabled?wrapper:wrapper.querySelector(".visual-panel-area"))?.append(button);
 }
}
if(typeof document!=="undefined")document.addEventListener("keydown",event=>{
 if(event.key==="Escape"&&zoomId){
  const wrapper=document.querySelector('.visual-sound-panel.zoomed');
  if(wrapper){setZoom(wrapper,zoomId,false);event.stopPropagation();}
 }
});
export function illustrateSoundPanel(details,kind,patch,onChange,onPreview=()=>{},index=0){
 return layoutSoundPanels(details,kind,patch,onChange,onPreview,index,createSoundPanel);
}
function createSoundPanel(details,kind,patch,onChange,onPreview,index,options){
 const commitSoundEdit=onChange;
 onChange=(path,value)=>{
  const restore=captureSoundGraphView(document.activeElement);
  commitSoundEdit(path,value);restore();
 };
 // The Beat's primary brightness/rise/fade dials sit above the accordion.
 // Capture their common owner before the accordion is moved into its wrapper.
 // Song/freeform Sound also nests its diagram and controls in one content root.
 // Modules are frequently constructed off-DOM and inserted after the
 // illustration wrapper exists. Resolve its final owner when handling input.
 const initiallyAttachedOwner=details.closest(".sound-section,.freeform-sound-content,.vocal-editor,.phone-patch-editor")??details;
 const id=options.id,page=options.page;
 const wrapper=document.createElement("section");wrapper.className="visual-sound-panel";
 const controlOwner=()=>wrapper.closest(".sound-section,.freeform-sound-content,.vocal-editor,.phone-patch-editor")??
  initiallyAttachedOwner;
 wrapper.dataset.visualKind=kind;
 wrapper.dataset.visualId=id;
 const area=document.createElement("div");area.className="visual-panel-area";
 const plot=document.createElement("div");plot.className="visual-panel-plot";
 const graphic=svgNode("svg",{viewBox:"0 0 360 112",preserveAspectRatio:"none",
  role:"group","aria-label":kind.replace(/\\d+/g,"")+" interactive sound illustration"});
 graphic.classList.add("visual-panel-graph");
 // Only the signal geometry scales. HTML captions keep their font metrics at
 // inspector and expanded widths instead of stretching with the SVG viewBox.
 const labelsRoot=document.createElement("div");labelsRoot.className="visual-graph-labels";
 labelsRoot.setAttribute("aria-hidden","true");
 const handlesRoot=document.createElement("div");handlesRoot.className="visual-graph-points";
 const expand=document.createElement("button");expand.type="button";
 expand.className="visual-panel-expand";expand.textContent="⤢";
 expand.setAttribute("aria-label","expand "+kind+" illustration");
 expand.addEventListener("click",()=>{
  const next=!wrapper.classList.contains("zoomed");
  if(next)details.open=true;setZoom(wrapper,id,next);
 });
 const dragReadout=document.createElement("output");
 dragReadout.className="visual-drag-readout";dragReadout.hidden=true;
 plot.append(graphic,labelsRoot,handlesRoot,dragReadout);
 area.append(plot,expand);
 // The drawing belongs inside its accordion: closed sections stay compact.
 const summary=details.querySelector("summary");
 // A zoomed module must not collapse behind the modal backdrop.
 summary?.addEventListener("click",event=>{
  if(wrapper.classList.contains("zoomed"))event.preventDefault();
 });
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
  const {paths,handles,labels,actions,color,inactive}=diagram(current,kind,page,soundIllustrationUnit(patch));
  graphic.setAttribute("aria-description",[...labels.map(label=>label.value),
   ...inactive.map(item=>item.reason)].join("; "));
  wrapper.dataset.visualPage=String(page);
  visibleHandles=handles;visibleActions=actions;
  // Rebuilding the diagram for live previews must not steal keyboard focus.
  const focusedHandle=handlesRoot.contains(document.activeElement)?
   document.activeElement.dataset.handle:null;
  graphic.replaceChildren();labelsRoot.replaceChildren();handlesRoot.replaceChildren();
  graphic.style.setProperty("--visual-color",color);
  for(const path of paths){
   const visible=svgNode("path",{d:path.d,
    class:path.secondary?"visual-graph-secondary":"visual-graph-line",fill:"none"});
   visible.dataset.soundRole=path.role;
   if(path.links?.length){
    visible.dataset.soundLinks=path.links.join("|");
    const hit=svgNode("path",{d:path.d,class:"visual-graph-hit",fill:"none",
     tabindex:"0",role:"button","aria-label":"edit "+path.links[0].split(".").at(-1)});
    hit.dataset.soundLinks=path.links.join("|");
    graphic.append(visible,hit);
   }else graphic.append(visible);
  }
  for(const {x,y,value} of labels){
   const label=document.createElement("span");label.className="visual-graph-label";
   label.style.left=(x/360*100)+"%";label.style.top=(y/112*100)+"%";
   if(x>=285)label.classList.add("visual-label-end");
   label.textContent=value;labelsRoot.append(label);
  }
  handles.forEach((point,i)=>{
   const button=document.createElement("button");button.type="button";
   button.className="visual-graph-point";
   if(point.x<115)button.classList.add("visual-point-start");
   if(point.x>245)button.classList.add("visual-point-end");
   button.style.left=(point.x/360*100)+"%";
   button.style.top=(point.y/112*100)+"%";
   button.dataset.handle=String(i);
   button.dataset.soundLinks=point.axes.map(axis=>axis.path.join(".")).join("|");
   button.dataset.soundKeys=point.axes.map(axis=>{
    const path=axis.path.join(".");return soundControlDomain(kind,path)+":"+path;
   }).join("|");
   button.dataset.soundAxes=JSON.stringify(point.axes);
   button.setAttribute("aria-label",point.label);
   const values=point.axes.map(axis=>axisReadout(axis,axisValue(current,axis.path)));
   // The visible output is inside a labelled button. Its text is otherwise
   // hidden by aria-label, so announce current X/Y values in the accessible
   // description as well as directions. Live previews rebuild both together.
   button.setAttribute("aria-description",[
    ...point.axes.map(axisDirection),...values,...inactive.filter(item=>
     point.axes.some(axis=>axis.path.join(".")===item.path)).map(item=>item.reason)
   ].join("; "));
   const readout=document.createElement("output");
   readout.className="visual-point-readout";
   readout.textContent=point.label+" · "+values.join(" · ");
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
   button.dataset.soundKeys=button.dataset.soundLinks.split("|")
    .map(path=>soundControlDomain(kind,path)+":"+path).join("|");
   button.addEventListener("click",()=>{
    const live=at(latestPatch,entry.path)??entry.choices[0];
    const index=entry.choices.findIndex(choice=>choice===live);
    const next=entry.choices[(index+1)%entry.choices.length];
    if(entry.path[0]==="audioFilterBypassed"){
     // The vocal display patch uses this read-only bypass flag to render the
     // neutral curve, but the canonical edit is the actual filter object.
     const bypass=!(latestPatch.filter==null||processorBypassed(latestPatch,"filter")),chain=withProcessorBypass(latestPatch,"filter",bypass);
     if(!bypass&&latestPatch.filter==null)onChange([["chain"],["filter"]],[chain,{...DEFAULT_SAMPLE_FILTER}]);
     else onChange(["chain"],chain);
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
  // Keep the *existing* knobs visually current while an illustration is
  // dragged. setDialDisplayValue only updates the dial face, readout and ARIA:
  // it never calls the knob's own preview or commit handlers. That preserves
  // the caller's single undo transaction for a multi-axis gesture.
  const editedAxes=new Set(handles.flatMap(point=>point.axes.map(axis=>axis.path.join("."))));
  for(const dial of controlOwner().querySelectorAll(".dial-field")){
   const key=dial.dataset.soundPath||
    dial.parentElement?.closest("[data-sound-path]")?.dataset.soundPath;
   if((dial.closest("[data-sound-domain]")?.dataset.soundDomain??"patch")!==
    soundControlDomain(kind,key??""))continue;
   if(!editedAxes.has(key)||dial.classList.contains("adjusting"))continue;
   const value=at(current,key.split("."));
   if(typeof value==="number"&&Number.isFinite(value))
    dial.setDialDisplayValue?.(value);
  }
  highlight(activeLink);
 }
 function targetFields(keys){
  const fields=[...controlOwner().querySelectorAll("[data-sound-path]")];
  fields.sort((a,b)=>Number(wrapper.contains(b))-Number(wrapper.contains(a)));
  return fields.filter(field=>!field.closest("[hidden]")&&keys.some(key=>{
   const path=field.dataset.soundPath;
   if((field.closest("[data-sound-domain]")?.dataset.soundDomain??"patch")!==
    soundControlDomain(kind,key))return false;
   return path===key||path.startsWith(key+".")||key.startsWith(path+".");
  }));
 }
 function highlight(keys){
  activeLink=keys?.length?keys:null;
  // Quiet focus/adjustment feedback only. Merely crossing a drawing or dial
  // never illuminates its traces; activation still finds the real control.
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
 const ownerListeners={
  focusin:event=>{
   const control=event.target.closest?.("[data-sound-path],[data-sound-links]");
   if(control)highlight(control.dataset.soundLinks?.split("|")??[control.dataset.soundPath]);
  },
  focusout:event=>{
   if(!event.relatedTarget?.closest?.("[data-sound-path],[data-sound-links]"))highlight(null);
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
 const placeDragReadout=(position,commit)=>{
  const width=plot.clientWidth,half=Math.min(245,Math.max(0,width-16))/2;
  dragReadout.style.left=clamp(position.x/360*width,half+8,width-half-8)+"px";
  dragReadout.style.top=(clamp(position.y,14,91)/112*100)+"%";
  dragReadout.hidden=commit;
 };
 // A spectral drawing can be painted in two dimensions: moving horizontally
 // selects neighboring harmonics while vertical movement changes their levels.
 // Consecutive partials are interpolated so fast strokes do not leave holes.
 const paintHarmonics=(stroke,position,commit)=>{
  const local=clamp(Math.round((position.x-23)/(314/31)),0,31);
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
  dragReadout.textContent="harmonics "+(stroke.base+1)+"–"+(stroke.base+32)+
   " · h"+(index+1)+" "+Math.round(level*100)+"%";
  placeDragReadout(position,commit);
  const key=paths.length===1?paths[0]:paths;
  const value=paths.length===1?values[0]:values;
  if(commit&&paths.every((path,i)=>values[i]===at(patch,path))){
   // A painted gesture that returns to its exact authored partial values
   // must restore transient audio/knobs without creating an empty undo step.
   draw(patch);onPreview(key,value);return;
  }
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
  placeDragReadout(position,commit);
  // Two axes are one sound edit and one undo step, never two disconnected edits.
  const key=paths.length===1?paths[0]:paths;
  const value=paths.length===1?values[0]:values;
  if(commit&&paths.every((path,i)=>values[i]===at(patch,path))){
   // The user may change their mind mid-gesture and return to the start.
   // An identical final value is not a Sound edit or a new history entry.
   draw(patch);onPreview(key,value);return;
  }
  if(commit)onChange(key,value);else onPreview(key,value);
 };
 area.addEventListener("pointerdown",event=>{
  const button=event.target.closest(".visual-graph-point");
  if(!button||event.button!==0||active)return;
  const point=visibleHandles[Number(button.dataset.handle)];
  if(!point)return;
  const grab=coord(event);
  // The visible handle has a 28px touch target. A press away from its center
  // must not change either parameter before the user actually drags.
  const offset={x:point.x-grab.x,y:point.y-grab.y};
  active={pointerId:event.pointerId,point,grab,offset,moved:false};
  if(kind.startsWith("harmonics")){
   const oscillator=Number(kind.slice("harmonics".length));
   const index=Number(button.dataset.handle);
   active.stroke={oscillator,base:0,values:new Map(),
    last:{index,level:at(latestPatch,["oscillators",oscillator,"harmonics",index])}};
  }
  area.setPointerCapture(event.pointerId);event.preventDefault();
  // Pointer default prevention otherwise leaves focus on the prior dial.
  // Make Escape cancel available on the actual dragged handle.
  button.focus({preventScroll:true});
 });
 const shiftedPosition=(gesture,event)=>{
  const position=coord(event);
  return {x:position.x+gesture.offset.x,y:position.y+gesture.offset.y};
 };
 area.addEventListener("pointermove",event=>{
  if(!active||active.pointerId!==event.pointerId)return;
  const position=coord(event);
  if(!active.moved&&Math.hypot(position.x-active.grab.x,
   position.y-active.grab.y)<1)return;
  active.moved=true;
  const shifted=shiftedPosition(active,event);
  if(active.stroke)paintHarmonics(active.stroke,shifted,false);
  else apply(active.point,shifted,false);
 });
 area.addEventListener("pointerup",event=>{
  if(!active||active.pointerId!==event.pointerId)return;
  const gesture=active;active=null;
  const position=coord(event);
  const moved=gesture.moved||Math.hypot(position.x-gesture.grab.x,
   position.y-gesture.grab.y)>=1;
  if(moved){
   const shifted=shiftedPosition(gesture,event);
   if(gesture.stroke)paintHarmonics(gesture.stroke,shifted,true);
   else apply(gesture.point,shifted,true);
  }
  if(area.hasPointerCapture(event.pointerId))area.releasePointerCapture(event.pointerId);
 });
 const cancelGesture=()=>{
  if(!active)return;
  const gesture=active;active=null;
  dragReadout.hidden=true;draw(patch);
  const paths=gesture.stroke?[...gesture.stroke.values.keys()].map(index=>
   ["oscillators",gesture.stroke.oscillator,"harmonics",index]):
   gesture.point.axes.map(a=>a.path);
  const values=paths.map(path=>at(patch,path));
  if(paths.length)onPreview(paths.length===1?paths[0]:paths,
   paths.length===1?values[0]:values);
  if(area.hasPointerCapture(gesture.pointerId))
   area.releasePointerCapture(gesture.pointerId);
 };
 area.addEventListener("pointercancel",event=>{
  if(active?.pointerId===event.pointerId)cancelGesture();
 });
 area.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&active){
   event.preventDefault();event.stopPropagation();
   cancelGesture();return;
  }
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
  const coordinateDirection=event.key==="ArrowUp"||event.key==="ArrowLeft"?-1:1;
  const dir=coordinateDirection*Math.sign(selected.to-selected.from);
  const current=axisValue(latestPatch,selected.path);
  // Arrows are precise knob-scale edits, with Shift for coarse movements.
  // The smallest edit matches the paired knob, including frequency axes.
  const step=selected.step*(event.shiftKey?10:1);
  // Keyboard and pointer edits must respect the same discrete grid.
  // Automation positions and recorded pitches are integers; fractional
  // steps would invalidate the existing project format.
  const snapped=Math.round((current+dir*step)/selected.step)*selected.step;
  const next=clamp(Number(snapped.toFixed(4)),
   selected.hardMin??selected.min,selected.hardMax??selected.max);
  if(next!==current)onChange(selected.path,next);
 });
 if(zoomId===id)setZoom(wrapper,id,true);
 draw(patch);wrapper.drawSoundIllustration=draw;
 return {element:wrapper,draw};
}
