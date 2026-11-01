// Reusable illustrations for the existing sound controls. These are teaching
// diagrams, not an alternate audio engine or a second source of patch state.
import {movement,pitchCents} from "./expression.js";
import {harmonicWave} from "./harmonics.js";
import {DEFAULT_SAMPLE_FILTER,driveCurve} from "./audioEffects.js";
import {routeValueAt,MOD_TARGETS} from "./src/dsp/modulation.js";
import {assignSoundEdit} from "./soundEditPath.js";

const NS="http://www.w3.org/2000/svg";
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const at=(patch,path)=>path.reduce((value,key)=>value?.[key],patch);
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
// Diagrams respond to canonical parameters; the measured scope is separate.
export const diagram=(patch,type)=>{
 const color=type==="movement"?"var(--signal-mauve)":"var(--track-accent,#08e4ec)";
 const paths=[],handles=[],labels=[];
 const line=(d,secondary=false)=>paths.push({d,secondary});
 const tag=(x,y,value)=>labels.push({x,y,value});
 const handle=(x,y,axes,label)=>handles.push({x,y,axes,label});
 const axis=(path,min,max,mode,options={})=>({path,min,max,mode,...options});
 const p=patch;
 if(type==="oscillators"){
  const second=Number(p.oscillators?.[1]?.level)>0||
   (p.modulation?.routes??[]).some(route=>route.target==="oscillators.1.level");
  for(const index of second?[0,1]:[0]){
   const o=p.oscillators[index],center=index===0?(second?34:59):87;
   line("M18 "+center+" H342",true);
   const gain=clamp(o.level);
   line(pathRange(280,t=>{
    const phase=t*10*Math.PI*2**(o.octave*.32)*2**(o.detune/1200);
    return [18+t*324,center-20*gain*waveAt(o.wave,phase,o.harmonics)];
   }),index===1);
   const bottom=center+(index===0&&second?20:22),top=center-20;
   handle(38+clamp((o.detune+100)/200)*278,bottom-(bottom-top)*gain,[
    axis(["oscillators",index,"detune"],-100,100,"linearX",{from:38,to:316,step:1}),
    axis(["oscillators",index,"level"],0,1,"linearY",{from:bottom,to:top,step:.01})
   ],"oscillator "+(index+1)+" detune / level");
   tag(18,index===0?11:70,"osc "+(index+1));
  }
  tag(294,11,"detune →");
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
 }else if(type==="filter"){
  const f=p.filter||(p.type==="sample"?DEFAULT_SAMPLE_FILTER:{type:"lowpass",cutoff:8000,resonance:1});
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
  line(pathRange(300,t=>{const px=18+t*324;return [px,95-60*response(px)];}));
  line("M"+x.toFixed(2)+" 97 V19",true);
  handle(x,95-60*base-25*r,[
   axis(["filter","cutoff"],50,14000,"logX",{from:18,to:342,step:1}),
   axis(["filter","resonance"],.1,16,"linearY",{from:95-60*base,to:95-60*base-25,step:.1})
  ],"cutoff / resonance");
  tag(18,15,"low");tag(308,15,"high");
  if(p.type==="sample"){
   const transfer=driveCurve(p.drive??0);
   line(pathRange(121,t=>[205+t*123,99-13*transfer[Math.round(t*(transfer.length-1))]]),true);
   tag(217,110,"drive");
  }else{
   const sweep=f.sweep??0,sweepTime=f.sweepTime??.2;
   const startCutoff=clamp(f.cutoff*2**sweep,50,14000);
   const startX=18+clamp(Math.log(startCutoff/50)/Math.log(280))*324;
   const stopX=18+clamp(Math.log(f.cutoff/50)/Math.log(280))*324;
   const timeY=26+clamp(sweepTime/3)*54;
   // The line represents the cutoff's actual start/end and sweep duration.
   if(sweep!==0){
    line(pathFrom([[startX,26],[startX+(stopX-startX)*.5,timeY*.65+14],[stopX,timeY]]),true);
    tag(clamp(startX+5,24,295),23,"sweep");
   }
   // Noise is unpitched, so show a decaying irregular signal.
   const noise=clamp(p.noise??0),decay=clamp((p.noiseDecay??0)/4);
   if(noise>0){
    line(pathRange(110,t=>[18+140*t,99-14*noise*
     (1-t)**(1.5+6*(1-decay))*Math.sin(t*67)*Math.cos(t*17)]),true);
    tag(18,111,"noise");
   }
  }
 }else if(type==="envelope"||type==="sample"){
  const sample=type==="sample",e=sample?
   {attack:p.attack??0,decay:0,sustain:1,release:p.release??.2}:p.envelope;
  const attackMax=sample?2:3,releaseMax=sample?3:4;
  const attackX=25+clamp(e.attack/attackMax)*78;
  const decayX=attackX+18+clamp(e.decay/3)*80;
  const sustainY=88-65*clamp(e.sustain);
  const releaseX=248+clamp(e.release/releaseMax)*95;
  line("M18 90 H348 M248 18 V96",true);
  line(pathFrom([[18,90],[attackX,23],[decayX,sustainY],[248,sustainY],[releaseX,90],[348,90]]));
  const prefix=sample?[]:["envelope"];
  handle(attackX,23,[axis([...prefix,"attack"],0,attackMax,"linearX",{from:25,to:103,step:.01})],"attack");
  if(!sample){
   handle(decayX,sustainY,[axis(["envelope","decay"],0,3,"linearX",
    {from:attackX+18,to:attackX+98,step:.01})],"decay");
   handle(214,sustainY,[axis(["envelope","sustain"],0,1,"linearY",
    {from:88,to:23,step:.01})],"sustain");
  }
  handle(releaseX,90,[axis([...prefix,"release"],.01,releaseMax,"linearX",
   {from:248,to:343,step:.01})],"release");
  tag(18,14,"on");tag(248,14,"off");
  if(sample){
   const gain=clamp(p.gain??.9,0,2),transpose=p.transpose??0,pan=p.pan??0;
   const strum=p.strumMs??0,root=p.zones?.[0]?.root??60;
   const pitchFollow=p.followPitch!==false,oneShot=!!p.oneShot,dynamics=!!p.preserveDynamics;
   line("M20 "+(112-9*gain).toFixed(2)+" H150",true);
   line("M173 "+(105-6*transpose/12).toFixed(2)+" H252",true);
   line("M274 104 H340 M"+(307+30*pan).toFixed(2)+" 98 V110",true);
   tag(19,110,"level");tag(171,110,(pitchFollow?"pitch ":"root ")+root);
   tag(290,95,"pan");
   line("M"+(18+(strum+25)/50*52).toFixed(2)+" 94 V102",true);
   if(oneShot)line("M344 40 V91",true);
   if(dynamics)line("M331 41 L338 35 L345 41",true);
  }
 }else if(type==="movement"){
  const m=movement(p);
  line("M15 62 H345",true);
  line(pathRange(320,t=>{
   const time=t*1.5;
   const cents=pitchCents({bend:p.bend},m,Math.min(time,1.25),1.25)/100;
   const vibrato=time>=m.delay?m.depth/100*Math.sin(time*2*Math.PI*m.rate):0;
   return [15+t*330,62-clamp((cents+vibrato)*5,-43,43)];
  }));
  handle(27,62-clamp(m.glide*5,-43,43),[
   axis(["movement","glide"],-12,12,"linearY",{from:104,to:20,step:.1})
  ],"glide");
  handle(48+clamp((m.rate-.1)/19.9)*260,62-35*m.depth/100,[
   axis(["movement","rate"],.1,20,"linearX",{from:48,to:308,step:.1}),
   axis(["movement","depth"],0,100,"linearY",{from:62,to:27,step:1})
  ],"vibrato rate / depth");
  tag(15,14,"pitch");tag(287,14,"rate →");
  // Separate amplitude and timbre motion cannot be seen on a pitch plot.
  const pulse=m.tremolo??0,pulseRate=m.tremoloRate??5;
  const tone=m.tone??0,toneRate=m.toneRate??2;
  line(pathRange(150,t=>[18+t*324,86-8*pulse*Math.sin(2*Math.PI*t*1.5*pulseRate)]),true);
  line(pathRange(150,t=>[18+t*324,100-7*tone*Math.sin(2*Math.PI*t*1.5*toneRate)]),true);
  const pan=clamp(p.pan??0,-1,1);
  line("M22 109 H"+(22+22*(1-pan)).toFixed(2),true);
  line("M294 109 H"+(294+22*(1+pan)).toFixed(2),true);
  tag(20,79,"level");tag(20,96,"tone");tag(260,110,"l / r");
 }else if(type==="distortion"){
  const drive=p.effects.drive||0,transfer=driveCurve(drive);
  line("M18 96 H344 M180 17 V97",true);
  line(pathRange(300,t=>{
   const output=transfer[Math.round(t*(transfer.length-1))];
   return [24+t*312,58-output*37];
  }));
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
   line("M"+x.toFixed(2)+" 100 V"+(100-72*level).toFixed(2),i>0);
   if(i>0)tag(x+4,Math.max(18,94-72*level),String(i));
  }
  handle(origin+space,100-72*mix,[
   axis(["effects","delayTime"],.05,1,"linearX",
    {from:origin+24,to:origin+90,step:.01}),
   axis(["effects","delayMix"],0,1,"linearY",{from:100,to:28,step:.01})
  ],"delay time / mix");
  if(mix>.05)handle(origin+2*space,100-72*mix*feedback,[
   axis(["effects","delayFeedback"],0,.8,"linearY",
    {from:100,to:100-72*mix*.8,step:.01})
  ],"feedback");
  tag(18,13,"mix ↑");tag(287,13,"time →");tag(30,112,"dry");
 }else if(type==="modulation"){
  const routes=p.modulation?.routes??[];
  tag(17,13,"source");tag(291,13,"target");
  if(!routes.length)line("M24 57 H336",true);
  // Modulation amplitudes come from the actual source and route math.
  const shown=routes.slice(0,4),centers=[30,51,73,95];
  shown.forEach((route,i)=>{
   const center=centers[i],limit=MOD_TARGETS.find(t=>t.id===route.target)?.limit||1;
   line("M67 "+center+" H290",true);
   line(pathRange(130,t=>{
    const seconds=1.25*t;
    const value=routeValueAt(route,{elapsed:seconds,gate:1,velocity:.7,pitch:65});
    const visualScale=route.unit==="cents"?20:route.unit==="octaves"?.6:.2;
    return [67+223*t,center-9*Math.tanh(value/visualScale)];
   }));
   const source=route.source.kind==="lfo"?"lfo":route.source.kind==="keytrack"?"keys":
    route.source.kind==="velocity"?"touch":"env";
   const target=MOD_TARGETS.find(item=>item.id===route.target);
   tag(18,center+3,source);tag(294,center+3,target?.name.replace("oscillator ","osc ")||"target");
  });
  if(routes.length>4)tag(18,111,"+"+(routes.length-4)+" routes");

 }
 return {paths,handles,labels,color};
};
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
 const id=idFor(kind,index);
 const wrapper=document.createElement("section");wrapper.className="visual-sound-panel";
 wrapper.dataset.visualKind=kind;
 const area=document.createElement("div");area.className="visual-panel-area";
 const graphic=svgNode("svg",{viewBox:"0 0 360 112",preserveAspectRatio:"none",
  role:"img","aria-label":kind.replace(/\\d+/g,"")+" sound illustration"});
 graphic.classList.add("visual-panel-graph");
 const handlesRoot=document.createElement("div");handlesRoot.className="visual-graph-points";
 const expand=document.createElement("button");expand.type="button";
 expand.className="visual-panel-expand";expand.textContent="⤢";
 expand.setAttribute("aria-label","expand "+kind+" illustration");
 expand.addEventListener("click",()=>{
  const next=!wrapper.classList.contains("zoomed");
  if(next)details.open=true;setZoom(wrapper,id,next);
 });
 area.append(graphic,handlesRoot,expand);
 // The drawing belongs inside its accordion: closed sections stay compact.
 const summary=details.querySelector("summary");
 if(summary)summary.after(area);else details.prepend(area);
 wrapper.append(details);
 let active=null,latestPatch=patch,visibleHandles=[];
 const setValue=(next,path,value)=>{
  const ownerPath=path.slice(0,-1);let owner=next;
  for(const key of ownerPath)owner=owner[key]??={};
  owner[path.at(-1)]=value;
 };
 function draw(current=latestPatch){
  latestPatch=current;
  const {paths,handles,labels,color}=diagram(current,kind);
  visibleHandles=handles;
  graphic.replaceChildren();handlesRoot.replaceChildren();
  graphic.style.setProperty("--visual-color",color);
  for(const path of paths)graphic.append(svgNode("path",{
   d:path.d,class:path.secondary?"visual-graph-secondary":"visual-graph-line",fill:"none"}));
  for(const {x,y,value} of labels)graphic.append(svgNode("text",{x,y,
   class:"visual-graph-label"},value));
  handles.forEach((point,i)=>{
   const button=document.createElement("button");button.type="button";
   button.className="visual-graph-point";
   button.style.left=(point.x/360*100)+"%";
   button.style.top=(point.y/112*100)+"%";
   button.dataset.handle=String(i);
   button.setAttribute("aria-label",point.label);
   // A two-dimensional handle is a button, not an inaccurately labelled slider.
   if(point.axes.length===1){
    const a=point.axes[0];button.setAttribute("role","slider");
    button.setAttribute("aria-valuemin",String(a.min));
    button.setAttribute("aria-valuemax",String(a.max));
    button.setAttribute("aria-valuenow",String(at(current,a.path)??0));
   }
   handlesRoot.append(button);
  });
 }
 const coord=event=>{
  const rect=graphic.getBoundingClientRect();
  return {x:(event.clientX-rect.left)/rect.width*360,
   y:(event.clientY-rect.top)/rect.height*112};
 };
 const valueAt=(axis,position)=>{
  const fraction=clamp((position[axis.mode.endsWith("X")?"x":"y"]-axis.from)/
   (axis.to-axis.from));
  const raw=axis.mode==="logX"?axis.min*(axis.max/axis.min)**fraction:
   axis.min+(axis.max-axis.min)*fraction;
  return clamp(Number((Math.round(raw/axis.step)*axis.step).toFixed(4)),axis.min,axis.max);
 };
 const apply=(point,position,commit)=>{
  const next=structuredClone(patch);
  const paths=point.axes.map(a=>a.path);
  const values=point.axes.map(a=>valueAt(a,position));
  assignSoundEdit(next,paths,values);
  draw(next);
  // Two axes are one sound edit and one undo step, never two disconnected edits.
  const key=paths.length===1?paths[0]:paths;
  const value=paths.length===1?values[0]:values;
  if(commit)onChange(key,value);else onPreview(key,value);
 };
 area.addEventListener("pointerdown",event=>{
  const button=event.target.closest(".visual-graph-point");
  if(!button){return;}
  const point=visibleHandles[Number(button.dataset.handle)];
  if(!point)return;
  active={point};
  area.setPointerCapture(event.pointerId);event.preventDefault();
  apply(point,coord(event),false);
 });
 area.addEventListener("pointermove",event=>{
  if(active)apply(active.point,coord(event),false);
 });
 area.addEventListener("pointerup",event=>{
  if(!active)return;
  const point=active.point;active=null;
  apply(point,coord(event),true);
  if(area.hasPointerCapture(event.pointerId))area.releasePointerCapture(event.pointerId);
 });
 area.addEventListener("pointercancel",()=>{
  if(!active)return;
  const paths=active.point.axes.map(a=>a.path);
  active=null;draw(patch);
  const values=paths.map(path=>at(patch,path));
  onPreview(paths.length===1?paths[0]:paths,paths.length===1?values[0]:values);
 });
 area.addEventListener("keydown",event=>{
  if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
  const button=event.target.closest(".visual-graph-point");if(!button)return;
  const point=visibleHandles[Number(button.dataset.handle)];if(!point)return;
  const horizontal=event.key==="ArrowLeft"||event.key==="ArrowRight";
  const selected=point.axes.find(a=>horizontal?a.mode.endsWith("X"):a.mode.endsWith("Y"));
  if(!selected)return;event.preventDefault();
  const dir=event.key==="ArrowUp"||event.key==="ArrowRight"?1:-1;
  const current=Number(at(latestPatch,selected.path));
  const step=selected.mode==="logX"?Math.max(20,current*.07):
   Math.max(selected.step,(selected.max-selected.min)/60);
  const next=clamp(current+dir*step,selected.min,selected.max);
  onChange(selected.path,Number(next.toFixed(3)));
 });
 if(zoomId===id){wrapper.classList.add("zoomed");expand.textContent="−";}
 draw(patch);wrapper.drawSoundIllustration=draw;
 return {element:wrapper,draw};
}
