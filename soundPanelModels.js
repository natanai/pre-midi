import {soundAxis} from "./soundParameterAdapter.js";
// Isolated reference lessons for the visible Sound modules. These reuse
// playback's control equations; source recordings remain in the measured scope.
import {movement,pitchCents,BEND_SHAPES} from "./expression.js";
import {modeledVibrato,MOVEMENT_ILLUSTRATION_SECONDS as duration} from "./movementIllustrationResponse.js";
import {modeledRecordingLevels} from "./sampleIllustrationResponse.js";
export const ISOLATED_SOUND_PANELS=new Set(["filter-sweep","noise","glide","bend","vibrato","pulse","tone-movement","stereo","recording-pitch","recording-level"]);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function isolatedSoundDiagram(p,type){
 const paths=[],handles=[],labels=[],actions=[],inactive=[];
 const line=(d,links=[],role="signal")=>paths.push({d,links,role,secondary:role!=="signal"});
 const path=points=>points.map(([x,y],i)=>(i?"L":"M")+x.toFixed(2)+" "+y.toFixed(2)).join(" ");
 const trace=(fn,links,role="signal",count=640)=>line(path(Array.from({length:count},(_,i)=>fn(i/(count-1)))),links,role);
 const tag=(x,y,value)=>labels.push({x,y,value});
 const axis=(path,mode,from,to,unit)=>soundAxis(p,path,mode,{from,to,unit});
 const point=(x,y,axes,label)=>handles.push({x,y,axes,label});
 const choice=(x,y,path,choices,label)=>actions.push({x,y,path,choices,label});
 const dormant=(path,reason)=>inactive.push({path,reason});
 const log=value=>Math.log(Math.max(50,value)/50)/Math.log(280);
 const frequencyY=value=>98-72*clamp(Math.log(Math.max(50,value)/50)/Math.log(504));
 const m=movement(p);
 if(type==="filter-sweep"){
  const f=p.filter,end=30+300*(f.sweepTime-.01)/2.99;
  const start=clamp(f.cutoff*2**f.sweep,50,14000),y=v=>98-72*clamp(log(v));
  line("M18 98 H342",[],"guide");
  line(path([[18,y(start)],[end,y(f.cutoff)],[342,y(f.cutoff)]]),["filter.cutoff","filter.sweep","filter.sweepTime"]);
  if(f.sweep===0){
   line(path([[18,y(clamp(f.cutoff>1000?f.cutoff/4:f.cutoff*4,50,14000))],[end,y(f.cutoff)]]),["filter.sweepTime"],"reference");
   dormant("filter.sweepTime","sweep is zero; the dashed curve isolates its duration");
  }
  point(end,62-7*f.sweep,[axis(["filter","sweepTime"],"linearX",30,330,"s"),
   axis(["filter","sweep"],"linearY",97,27,"oct")],"sweep duration / amount");
  point(26+308*clamp(log(f.cutoff)),106,[axis(["filter","cutoff"],"logX",26,334,"Hz")],"resting cutoff");
  tag(18,14,"cutoff (hz)");tag(300,14,"time →");
 }else if(type==="noise"){
  const level=p.noise??0,decay=p.noiseDecay??0;
  const noise=(t,gain)=>gain*(decay>0?Math.exp(-t*4*5/decay):1)*Math.cos(t*83)*Math.cos(t*9);
  line("M18 62 H342",[],"guide");
  trace(t=>[18+324*t,62-35*noise(t,level)],["noise","noiseDecay"]);
  if(level===0){trace(t=>[18+324*t,62-25*noise(t,1)],["noiseDecay"],"reference");
   dormant("noiseDecay","noise level is zero; the dashed trace is a decay reference");}
  point(30+300*decay/4,100-75*level,[axis(["noiseDecay"],"linearX",30,330,"s"),
   axis(["noise"],"linearY",100,25,"percent")],"noise decay / level");
  tag(18,14,level===0?"noise off · guide":"noise source");tag(307,111,"4 s");
 }else if(type==="glide"){
  line("M18 62 H342",[],"guide");
  trace(t=>[18+324*t,62-pitchCents(null,m,t*duration,duration)/100*3.5],["movement.glide","movement.glideTime"]);
  if(m.glide===0){trace(t=>[18+324*t,62-pitchCents(null,{...m,glide:6},t*duration,duration)/100*3.5],
   ["movement.glideTime"],"reference");dormant("movement.glideTime","glide is zero; the dashed curve is a duration reference");}
  point(18+324*m.glideTime/duration,62-3.5*m.glide,[axis(["movement","glideTime"],"linearX",18+324*.01/duration,18+324*3/duration,"s"),
   axis(["movement","glide"],"linearY",104,20,"st")],"glide duration / starting pitch");
  tag(18,14,m.glide===0?"glide off · guide":"pitch");tag(307,111,"4.5 s");
 }else if(type==="bend"){
  const bend=p.bend??{shape:"straight",amount:2,rate:4};
  const curve=b=>trace(t=>[18+324*t,62-5*pitchCents({bend:b},{...m,glide:0},t*1.25,1.25)/100],
   ["bend.shape","bend.amount","bend.rate"],b===bend?"signal":"reference");
  line("M18 62 H342",[],"guide");curve(bend);
  if(bend.shape!=="wave"||bend.amount===0){curve({...bend,shape:"wave",amount:bend.amount||3});
   dormant("bend.rate","speed affects a nonzero wave bend; the dashed wave is a reference");
   if(bend.shape==="straight")dormant("bend.amount","straight has no bend; the dashed wave previews its stored amount");}
  point(35+282*(bend.rate-.1)/11.9,62-35*bend.amount/12,[axis(["bend","rate"],"linearX",35,317,"Hz"),
   axis(["bend","amount"],"linearY",62,27,"st")],"bend speed / amount");
  choice(180,104,["bend","shape"],BEND_SHAPES.map(([id])=>id),"bend shape");
  tag(18,14,"pitch bend");tag(280,111,"1.25 s");
 }else if(type==="vibrato"){
  line("M18 62 H342",[],"guide");
  trace(t=>[18+324*t,62-35*modeledVibrato(p,t*duration)/100],["movement.rate","movement.depth","movement.delay"]);
  if(m.depth===0){trace(t=>[18+324*t,62-35*modeledVibrato({...p,movement:{...m,depth:50}},t*duration)/100],
   ["movement.rate","movement.delay"],"reference");
   for(const key of ["rate","delay"])dormant("movement."+key,"vibrato depth is zero; the dashed wave is a reference");}
  point(35+282*(m.rate-.1)/19.9,62-35*m.depth/100,[axis(["movement","rate"],"linearX",35,317,"Hz"),
   axis(["movement","depth"],"linearY",62,27,"ct")],"vibrato rate / depth");
  point(18+324*m.delay/duration,104,[axis(["movement","delay"],"linearX",18,18+324*3/duration,"s")],"vibrato waiting time");
  tag(18,14,m.depth===0?"vibrato off · guide":"pitch (cents)");tag(307,111,"4.5 s");
 }else if(type==="pulse"){
  const gain=(t,amount)=>1+.45*amount*Math.sin(t*1.3*2*Math.PI*m.tremoloRate);
  line("M18 62 H342",[],"guide");
  trace(t=>[18+324*t,62-15*gain(t,m.tremolo)*Math.sin(t*1.3*25*2*Math.PI)],
   ["movement.tremolo","movement.tremoloRate"]);
  if(m.tremolo===0){trace(t=>[18+324*t,62-15*gain(t,.8)*Math.sin(t*1.3*25*2*Math.PI)],
   ["movement.tremoloRate"],"reference");dormant("movement.tremoloRate","pulse amount is zero; the dashed waveform isolates its speed");}
  point(35+282*(m.tremoloRate-.1)/19.9,100-75*m.tremolo,[axis(["movement","tremoloRate"],"linearX",35,317,"Hz"),
   axis(["movement","tremolo"],"linearY",100,25,"percent")],"pulse speed / amount");
  tag(18,14,"25 hz reference");tag(290,111,"1.3 s");
 }else if(type==="tone-movement"){
  const cutoff=p.filter?.cutoff??14000;
  const curve=amount=>trace(t=>[18+324*t,frequencyY(cutoff*(1+.8*amount*Math.sin(t*1.3*2*Math.PI*m.toneRate)))],
   ["filter.cutoff","movement.tone","movement.toneRate"],amount===m.tone?"signal":"reference");
  curve(m.tone);if(m.tone===0){curve(.7);dormant("movement.toneRate","tone amount is zero; the dashed curve isolates its speed");}
  point(35+282*(m.toneRate-.1)/19.9,100-75*m.tone,[axis(["movement","toneRate"],"linearX",35,317,"Hz"),
   axis(["movement","tone"],"linearY",100,25,"percent")],"tone speed / amount");
  point(26+308*clamp(log(cutoff)),106,[axis(["filter","cutoff"],"logX",26,334,"Hz")],"resting cutoff");
  tag(18,14,"cutoff (hz)");tag(290,111,"1.3 s");
 }else if(type==="stereo"){
  const pan=p.pan??0,recording=p.type==="sample"||p.type==="vocal",gain=recording?(p.gain??.9):1;
  const angle=(pan+1)*Math.PI/4,levels=[Math.cos(angle),Math.sin(angle)];
  for(const [i,level] of levels.entries())trace(t=>[18+324*t,42+i*32-14*level*gain*Math.sin(t*8*Math.PI)],recording?["pan","gain"]:["pan"]);
  if(gain===0){for(const [i,level] of levels.entries())trace(t=>[18+324*t,42+i*32-14*level*Math.sin(t*8*Math.PI)],["pan"],"reference");
   dormant("pan","recording level is zero; dashed left/right signals isolate stereo balance");}
  point(26+308*(pan+1)/2,recording?100-75*gain/2:100,[axis(["pan"],"linearX",26,334,"pan"),
   ...(recording?[axis(["gain"],"linearY",100,25,"percent")]:[])],recording?"pan / recording level":"stereo balance");
  tag(18,14,"left · reference");tag(18,62,"right");tag(225,111,"equal power pan");
 }else if(type==="recording-pitch"){
  const shift=p.transpose??0,strum=p.strumMs??0,vocal=p.type==="vocal";
  const rate=2**(shift/12)*(vocal||p.followPitch===false?1:2),start=vocal?0:.025+strum/1000;
  trace(t=>{const elapsed=t*.1-start;return [18+324*t,62-(elapsed>=0?25*Math.sin(elapsed*55*rate*2*Math.PI):0)];},
   vocal?["transpose"]:["transpose","strumMs","followPitch"]);
  point(vocal?180:26+308*(strum+25)/50,62-35*shift/24,[
   ...(!vocal?[axis(["strumMs"],"linearX",26,334,"ms")]:[]),
   axis(["transpose"],"linearY",97,27,"st")],vocal?"recording pitch":"onset / pitch");
  if(!vocal)choice(180,105,["followPitch"],[true,false],"follow played note");
  tag(18,14,"55 hz reference");tag(265,14,"pitch ↑");
 }else if(type==="recording-level"){
  const gain=p.gain??.9,vocal=p.type==="vocal",levels=vocal?[gain*.15,gain*.15]:modeledRecordingLevels(p);
  for(const [i,level] of levels.entries())trace(t=>[18+324*t,40+i*37-40*level*Math.sin(t*8*Math.PI)],vocal?["gain"]:["gain","preserveDynamics"]);
  if(!vocal){
   choice(180,105,["preserveDynamics"],[false,true],"preserve recorded dynamics");
   if(gain===0){
    for(const [i,level] of modeledRecordingLevels({...p,gain:1}).entries())
     trace(t=>[18+324*t,40+i*37-40*level*Math.sin(t*8*Math.PI)],["preserveDynamics"],"reference");
    dormant("preserveDynamics","recording level is zero; dashed takes isolate normalization");
   }
  }
  point(330,100-75*gain/2,[axis(["gain"],"linearY",100,25,"percent")],"recording level");
  tag(18,14,vocal?"level reference":"quiet / loud reference takes");
 }
 return {paths,handles,labels,actions,inactive,color:["glide","bend","vibrato","pulse","tone-movement"].includes(type)?"var(--signal-mauve)":"var(--track-accent,#08e4ec)"};
}
