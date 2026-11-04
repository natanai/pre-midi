import {BEND_SHAPES,bendSemitones} from "./expression.js";
import {createDial} from "./dial.js";
const svgNS="http://www.w3.org/2000/svg";
function make(tag,text,cls){
 const element=document.createElement(tag);
 if(text!==undefined)element.textContent=text;
 if(cls)element.className=cls;
 return element;
}
function svg(tag,attrs={}){
 const el=document.createElementNS(svgNS,tag);
 for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
 return el;
}
export function renderNoteExpression(root,note,pitchLabel,durationSeconds,onChange,onDelete,onHear,defaultBend,onLevelChange){
 root.replaceChildren();
 root.hidden=!note;
 if(!note)return;
 const bend=note.bend||defaultBend||{shape:"straight",amount:2,rate:4};
 const caption=make("div",undefined,"expression-title");
 caption.append(make("strong","Bend · "+pitchLabel+(note.bend?"":" · instrument default"),"expression-note"));
 const play=make("button","▶ hear note","expression-hear");
 play.type="button";play.addEventListener("click",onHear);
 caption.append(play);
 const clear=make("button","Delete note","expression-delete");
 clear.type="button";clear.addEventListener("click",onDelete);
 caption.append(clear);
 const level=make("label",undefined,"expression-level");
 level.title="the level of this note; samples may respond with a different recorded layer";
 const levelTitle=make("span","note level");
 const levelRow=make("div",undefined,"expression-level-row");
 const levelInput=make("input");
 levelInput.type="range";levelInput.min="0";levelInput.max="1";levelInput.step=".01";
 levelInput.value=String(note.velocity);
 levelInput.setAttribute("aria-label","Note level");
 const levelValue=make("output",Math.round(note.velocity*100)+"%");
 levelInput.addEventListener("input",()=>{levelValue.value=Math.round(Number(levelInput.value)*100)+"%";});
 levelInput.addEventListener("change",()=>onLevelChange?.(Number(levelInput.value)));
 levelRow.append(levelInput,levelValue);
 level.append(levelTitle,levelRow);
 const controls=make("div",undefined,"expression-controls");
 const choice=make("label","Shape");
 const select=make("select");
 select.setAttribute("aria-label","Held note bend shape");
 for(const [id,name] of BEND_SHAPES){
  const option=make("option",name);option.value=id;select.append(option);
 }
 select.value=bend.shape;
 select.addEventListener("change",()=>onChange({...bend,shape:select.value}));
 choice.append(select);controls.append(choice);
 const current={shape:bend.shape,amount:bend.amount,rate:bend.rate};
 const amount=createDial({label:"Amount",min:0,max:12,step:.25,display:"semitones"},bend.amount,
  value=>onChange({...bend,amount:value}),value=>{current.amount=value;draw();});
 const rate=createDial({label:"Wave speed",min:.1,max:12,step:.1,display:"hz"},bend.rate,
  value=>onChange({...bend,rate:value}),value=>{current.rate=value;draw();});
 controls.append(amount,rate);
 const graph=svg("svg",{viewBox:"0 0 320 112",
  "aria-label":"Bend and note level",role:"button",tabindex:"0",
  preserveAspectRatio:"none"});
 graph.classList.add("visual-panel-graph");
 const center=svg("path",{d:"M0 32 H320 M0 91 H320",class:"visual-graph-secondary"});
 const shape=svg("polyline",{fill:"none",class:"visual-graph-line"});
 const levelBar=svg("path",{fill:"none",class:"visual-graph-level"});
 const levelLabel=svg("text",{x:"13",y:"107",class:"visual-graph-label"});
 levelLabel.textContent="level";
 graph.append(center,shape,levelBar,levelLabel);
 const visual=make("div",undefined,"expression-visual");
 const area=make("div",undefined,"visual-panel-area");
 const points=make("div",undefined,"visual-graph-points");
 const dot=make("button",undefined,"visual-graph-point");
 dot.type="button";dot.setAttribute("aria-label","bend amount");
 points.append(dot);area.append(graph,points);visual.append(area);
 let noteLevel=note.velocity,dragging=null;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const focusAmount=()=>amount.querySelector('[role="slider"]')?.focus();
 function draw(){
  current.shape=select.value;
  rate.hidden=current.shape!=="wave";
  const total=durationSeconds;
  const values=Array.from({length:121},(_,i)=>{
   const x=i/120,value=bendSemitones(current,x,x*total);
   return Math.round(x*320)+","+Math.round(32-value*2.1);
  });
  shape.setAttribute("points",values.join(" "));
  levelBar.setAttribute("d","M14 91 H"+(14+290*noteLevel).toFixed(1));
  dot.hidden=current.shape==="straight";
  dot.style.left=(current.shape==="wave"?15+clamp((current.rate-.1)/11.9,0,1)*70:74)+"%";
  dot.style.top=(32-2.1*current.amount)/112*100+"%";
  dot.setAttribute("aria-label",current.shape==="wave"?"bend amount and speed":"bend amount");
  dot.setAttribute("aria-valuetext",current.amount.toFixed(2)+" semitones"+
   (current.shape==="wave"?", "+current.rate.toFixed(2)+" hertz":""));
 }
 levelInput.addEventListener("input",()=>{
  noteLevel=Number(levelInput.value);
  levelBar.setAttribute("d","M14 91 H"+(14+290*noteLevel).toFixed(1));
 });
 function setLink(enabled){
  area.classList.toggle("visual-panel-linked",enabled);
  shape.classList.toggle("visual-graph-linked",enabled);
  dot.classList.toggle("visual-point-linked",enabled);
 }
 for(const dial of [amount,rate]){
  dial.addEventListener("pointerenter",()=>setLink(true));
  dial.addEventListener("pointerleave",()=>setLink(false));
  dial.addEventListener("focusin",()=>setLink(true));
  dial.addEventListener("focusout",()=>setLink(false));
 }
 dot.addEventListener("pointerenter",()=>setLink(true));
 dot.addEventListener("pointerleave",()=>{if(!dragging)setLink(false);});
 function position(event){
  const bounds=graph.getBoundingClientRect();
  return {x:(event.clientX-bounds.left)/bounds.width*320,
   y:(event.clientY-bounds.top)/bounds.height*112};
 }
 function edit(event,commit=false){
  const pos=position(event);
  const next={...current,
   amount:Math.round(clamp((32-pos.y)/2.1,0,12)*4)/4};
  if(current.shape==="wave")
   next.rate=Math.round((.1+clamp((pos.x/320-.15)/.7,0,1)*11.9)*10)/10;
  current.amount=next.amount;current.rate=next.rate;
  draw();
  if(commit)onChange({...bend,amount:next.amount,rate:next.rate,shape:current.shape});
 }
 dot.addEventListener("pointerdown",event=>{
  if(event.button!==0)return;
  dragging={id:event.pointerId,amount:current.amount,rate:current.rate};
  area.setPointerCapture(event.pointerId);event.preventDefault();
  setLink(true);
 });
 area.addEventListener("pointermove",event=>{
  if(dragging?.id===event.pointerId)edit(event);
 });
 area.addEventListener("pointerup",event=>{
  if(dragging?.id!==event.pointerId)return;
  dragging=null;edit(event,true);
  if(area.hasPointerCapture(event.pointerId))area.releasePointerCapture(event.pointerId);
  setLink(false);
 });
 area.addEventListener("pointercancel",event=>{
  if(dragging?.id!==event.pointerId)return;
  current.amount=dragging.amount;current.rate=dragging.rate;dragging=null;
  draw();setLink(false);
 });
 dot.addEventListener("keydown",event=>{
  if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
  event.preventDefault();
  if(event.key==="ArrowUp"||event.key==="ArrowDown")
   current.amount=clamp(current.amount+(event.key==="ArrowUp"?.25:-.25),0,12);
  else if(current.shape==="wave")
   current.rate=clamp(Math.round((current.rate+(event.key==="ArrowRight"?.1:-.1))*10)/10,.1,12);
  else return;
  draw();onChange({...bend,amount:current.amount,rate:current.rate,shape:current.shape});
 });
 graph.addEventListener("click",focusAmount);
 graph.addEventListener("keydown",event=>{
  if(event.key==="Enter"||event.key===" "){event.preventDefault();focusAmount();}
 });
 root.append(caption,level,controls,visual);
 draw();
}
