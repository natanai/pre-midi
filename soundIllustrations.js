// Reusable illustrations for the existing sound controls. These are teaching
// diagrams, not an alternate audio engine or a second source of patch state.
import {movement,pitchCents} from "./expression.js";
import {harmonicWave} from "./harmonics.js";

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
const C="#08e4ec";
const mono=(p,type)=>{
 const color=type==="movement"?"var(--signal-mauve)": "var(--track-accent, #08e4ec)";
 const paths=[],handles=[],labels=[];
 const line=(d,secondary=false,fill="none")=>paths.push({d,secondary,fill});
 const dot=(path,x,y,min,max,axis="x",label="")=>handles.push({path,x,y,min,max,axis,label:label||String(path.at(-1))});
 const tag=(x,y,text)=>labels.push([x,y,text]);
 if(type.startsWith("oscillator")){
  const index=Number(type.slice(-1)),o=p.oscillators[index];
  const brightness=clamp(Math.log(Math.max(50,p.filter.cutoff)/50)/Math.log(280));
  const drive=p.effects.drive||0;
  line("M12 60 H348",true);
  line(pathRange(300,t=>{
   const phase=t*5*Math.PI*2*2**(o.octave*.35);
   let value=waveAt(o.wave,phase,o.harmonics);
   const harmonicEnergy=brightness*.9+.1;
   value=value*harmonicEnergy+(1-harmonicEnergy)*Math.sin(phase);
   value=Math.tanh(value*(1+drive*5))/(1+drive*.3);
   return [12+t*336,60-value*40*o.level];
  }));
  tag(16,16,"osc "+(index+1));
  dot(["oscillators",index,"level"],330,60-40*o.level,0,1,"y","level");
  // The controls below the diagram remain the authoritative wave selector.
 }else if(type==="filter"){
  const f=p.filter||{type:"lowpass",cutoff:8000,resonance:1};
  const frequency=x=>50*280**((x-18)/324);
  const px=clamp(Math.log(Math.max(50,f.cutoff)/50)/Math.log(280))*324+18;
  const resonance=clamp((f.resonance-.1)/15.9);
  line("M18 95 H344 M18 25 V95",true);
  const response=x=>{
   const relative=Math.log2(frequency(x)/Math.max(50,f.cutoff));
   const roll=1/(1+Math.exp(relative*2.6));
   let gain=f.type==="highpass"?1-roll:f.type==="bandpass"?4*roll*(1-roll):
    f.type==="notch"?1-4*roll*(1-roll):roll;
   gain+=Math.exp(-relative*relative*4)*resonance*.35;
   return clamp(gain,0,1.35);
  };
  line(pathRange(280,t=>{const x=18+t*324;return [x,95-65*response(x)];}));
  const y=95-65*response(px);
  line("M"+px.toFixed(2)+" 100 V20",true);
  dot(["filter","cutoff"],px,y,50,14000,"log","brightness");
  dot(["filter","resonance"],px,clamp(y-17,12,83),.1,16,"y-inverted","resonance");
  tag(18,15,"low");tag(318,15,"high");
 }else if(type==="envelope"||type==="sample"){
  const env=type==="envelope"?p.envelope:{
   attack:p.attack??0,decay:0,sustain:1,release:p.release??.2};
  const attackX=25+clamp(env.attack/3)*78;
  const decayX=attackX+18+clamp(env.decay/3)*80;
  const sustainY=88-65*clamp(env.sustain);
  const releaseX=248+clamp(env.release/4)*95;
  line("M18 92 H348 M248 15 V96",true);
  line(pathFrom([[18,90],[attackX,23],[decayX,sustainY],[248,sustainY],[releaseX,90],[348,90]]]));
  const prefix=type==="sample"?[]:["envelope"];
  dot([...prefix,"attack"],attackX,23,0,3,"x-attack","attack");
  if(type==="envelope"){
   dot(["envelope","decay"],decayX,sustainY,0,3,"x-decay","decay");
   dot(["envelope","sustain"],209,sustainY,0,1,"y-inverted","sustain");
  }
  dot([...prefix,"release"],releaseX,90,.01,4,"x-release","release");
  tag(16,14,"on");tag(248,14,"off");
 }else if(type==="movement"){
  const m=movement(p);
  line("M15 62 H345",true);
  line(pathRange(280,t=>{
   const time=t*1.5;
   const bend=pitchCents({bend:p.bend},m,Math.min(time,1.25),1.25)/100;
   const glide=m.glide*(1-clamp(time/Math.max(.01,m.glideTime)));
   const vibrato=time>=m.delay?m.depth/100*Math.sin(time*2*Math.PI*m.rate):0;
   return [15+t*330,62-clamp((bend+glide+vibrato)*5,-42,42)];
  }));
  dot(["movement","glide"],28,62-clamp(m.glide*5,-42,42),-12,12,"y-signed","glide");
  dot(["movement","depth"],274,62-clamp(m.depth*.4,0,40),0,100,"y-vibrato","vibrato");
  tag(16,15,"pitch");tag(290,15,"time");
 }else if(type==="effects"){
  const drive=p.effects.drive||0,delay=p.effects.delayMix||0,feedback=p.effects.delayFeedback||0;
  line("M15 95 H160 M15 18 V95 M200 95 H345",true);
  line(pathRange(120,t=>{
   const input=2*t-1,shaped=Math.tanh(input*(1+drive*8))/Math.tanh(1+drive*8);
   return [15+t*145,56-shaped*38];
  }));
  for(let i=0;i<5;i++){
   const x=205+i*30,level=(i===0?1:delay*feedback**(i-1));
   line("M"+x+" 95 V"+(95-65*level).toFixed(2),i>0);
  }
  dot(["effects","drive"],87,56-(Math.tanh((1+drive*8)*.5)/Math.tanh(1+drive*8))*38,0,1,"y-drive","distortion");
  dot(["effects","delayMix"],235,95-65*delay,0,1,"y-delay","delay");
  tag(18,14,"drive");tag(202,14,"echo");
 }else if(type==="modulation"){
  const routes=p.modulation?.routes??[];
  line("M20 58 H340",true);
  routes.slice(0,5).forEach((route,i)=>{
   const y=25+i*14;
   line("M20 "+y+" Q160 "+(y+30)+" 340 "+y);
  });
  tag(16,13,"source");tag(294,13,"target");
  if(!routes.length)line("M40 55 Q180 20 320 55",true);
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
document.addEventListener("keydown",event=>{
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
 const graphic=svgNode("svg",{viewBox:"0 0 360 112",role:"img",
  "aria-label":kind.replace(/\d+/g,"")+" sound illustration"});
 graphic.classList.add("visual-panel-graph");
 const expand=document.createElement("button");expand.type="button";
 expand.className="visual-panel-expand";expand.textContent="⤢";
 expand.setAttribute("aria-label","expand "+kind+" illustration");
 expand.addEventListener("click",()=>setZoom(wrapper,id,!wrapper.classList.contains("zoomed")));
 area.append(graphic,expand);
 wrapper.append(area,details);
 let active=null,latestPatch=patch;
 function draw(current=latestPatch){
  latestPatch=current;
  const {paths,handles,labels,color}=mono(current,kind);
  graphic.replaceChildren();
  graphic.style.setProperty("--visual-color",color);
  for(const path of paths)graphic.append(svgNode("path",{d:path.d,
   class:path.secondary?"visual-graph-secondary":"visual-graph-line",fill:path.fill}));
  for(const [x,y,t] of labels)graphic.append(svgNode("text",{x,y,class:"visual-graph-label"},t));
  for(const handle of handles){
   const point=svgNode("circle",{cx:handle.x,cy:handle.y,r:5,
    class:"visual-graph-handle",tabindex:"0",role:"slider",
    "aria-label":handle.label+" illustration",
    "aria-valuemin":handle.min,"aria-valuemax":handle.max,
    "aria-valuenow":at(current,handle.path)??0,
    "data-sound-path":JSON.stringify(handle.path)});
   graphic.append(point);
  }
  graphic._handles=handles;
 }
 function coords(event){
  const rect=graphic.getBoundingClientRect();
  return {x:(event.clientX-rect.left)/rect.width*360,
   y:(event.clientY-rect.top)/rect.height*112};
 }
 function mapped(handle,pos){
  const {x,y}=pos;
  let ratio=0;
  switch(handle.axis){
   case "x-attack":ratio=(x-25)/78;break;
   case "x-decay":ratio=(x-(25+clamp((latestPatch.envelope?.attack||0)/3)*78)-18)/80;break;
   case "x-release":ratio=(x-248)/95;break;
   case "log":ratio=(x-18)/324;break;
   case "y":ratio=(60-y)/40;break;
   case "y-inverted":ratio=(88-y)/65;break;
   case "y-signed":ratio=(62-y+42)/84;break;
   case "y-vibrato":ratio=(62-y)/40;break;
   case "y-drive":ratio=(85-y)/70;break;
   case "y-delay":ratio=(95-y)/65;break;
   default:ratio=x/360;
  }
  ratio=clamp(ratio);
  if(handle.axis==="log")return Math.round(handle.min*(handle.max/handle.min)**ratio);
  let value=handle.min+(handle.max-handle.min)*ratio;
  const step=handle.path.at(-1)==="cutoff"?1:
   ["attack","release","decay","glide"].includes(handle.path.at(-1))?.01:
    handle.path.at(-1)==="depth"?1:.01;
  return clamp(Math.round(value/step)*step,handle.min,handle.max);
 }
 function edit(handle,pos,commit=false){
  const value=mapped(handle,pos);
  const next=cloneEdit(patch,handle.path,value);
  draw(next);onPreview(handle.path,value);
  if(commit)onChange(handle.path,value);
 }
 graphic.addEventListener("pointerdown",event=>{
  const target=event.target.closest?.("[data-sound-path]");
  const handle=graphic._handles?.find(item=>JSON.stringify(item.path)===target?.getAttribute("data-sound-path"));
  if(!handle){details.open=true;return;}
  active={handle};graphic.setPointerCapture(event.pointerId);
  event.preventDefault();edit(handle,coords(event));
 });
 graphic.addEventListener("pointermove",event=>{
  if(active)edit(active.handle,coords(event));
 });
 graphic.addEventListener("pointerup",event=>{
  if(!active)return;
  const handle=active.handle;active=null;edit(handle,coords(event),true);
  if(graphic.hasPointerCapture(event.pointerId))graphic.releasePointerCapture(event.pointerId);
 });
 graphic.addEventListener("pointercancel",()=>{
  if(!active)return;active=null;draw(patch);onPreview([""],undefined);
 });
 graphic.addEventListener("keydown",event=>{
  const target=event.target.closest?.("[data-sound-path]");
  const handle=graphic._handles?.find(item=>JSON.stringify(item.path)===target?.getAttribute("data-sound-path"));
  if(!handle||!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
  event.preventDefault();
  const current=Number(at(latestPatch,handle.path));
  const step=handle.axis==="log"?Math.max(20,current*.07):(handle.max-handle.min)/60;
  const direction=["ArrowUp","ArrowRight"].includes(event.key)?1:-1;
  const next=clamp(current+direction*step,handle.min,handle.max);
  onChange(handle.path,handle.axis==="log"?Math.round(next):Number(next.toFixed(3)));
 });
 if(zoomId===id){wrapper.classList.add("zoomed");expand.textContent="−";}
 draw(patch);
 return {element:wrapper,draw};
}
