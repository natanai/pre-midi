// One reusable instrument dial. Native patch validation and the caller's
// modify() remain the ONLY mutation path. Drag previews are transient.
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const pretty=(n,p)=>Number(n.toFixed(p));
export const asUnit=(value,display="number")=>{
 if(display==="percent")return Math.round(value*100)+"%";
 if(display==="seconds")return Math.round(value*1000)+" ms";
 if(display==="hz")return value>=1000?(value/1000).toFixed(1)+" kHz":Math.round(value)+" Hz";
 if(display==="cents")return Math.round(value)+" ct";
 if(display==="semitones")return (value>0?"+":"")+pretty(value,1)+" st";
 if(display==="pan")return value===0?"C":value<0?"L "+Math.round(-value*100):"R "+Math.round(value*100);
 return pretty(value,2).toString();
};
const fraction=(value,field)=>field.log?
 (Math.log(value)-Math.log(field.min))/(Math.log(field.max)-Math.log(field.min)):
 (value-field.min)/(field.max-field.min);
const fromFraction=(t,field)=>{
 const value=field.log?
  Math.exp(Math.log(field.min)+(Math.log(field.max)-Math.log(field.min))*clamp(t,0,1)):
  field.min+(field.max-field.min)*clamp(t,0,1);
 const step=field.step||.01;
 return clamp(pretty(Math.round(value/step)*step,6),field.min,field.max);
};
export function createDial(field,value,onCommit,onPreview=()=>{}){
 const control=document.createElement("div");control.className="dial-field";
 const title=document.createElement("span");title.className="dial-label";title.textContent=field.label;
 const knob=document.createElement("div");knob.className="dial-knob";
 knob.tabIndex=field.disabled?-1:0;knob.setAttribute("role","slider");
 if(field.disabled){control.classList.add("dial-disabled");knob.setAttribute("aria-disabled","true");}
 knob.setAttribute("aria-label",field.label);
 knob.setAttribute("aria-valuemin",String(field.min));
 knob.setAttribute("aria-valuemax",String(field.max));
 knob.setAttribute("aria-orientation","vertical");
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 64 64");
 svg.setAttribute("aria-hidden","true");
 const background=document.createElementNS("http://www.w3.org/2000/svg","circle");
 background.setAttribute("cx","32");background.setAttribute("cy","32");background.setAttribute("r","25");
 background.setAttribute("class","dial-ring");
 const track=document.createElementNS("http://www.w3.org/2000/svg","circle");
 track.setAttribute("cx","32");track.setAttribute("cy","32");track.setAttribute("r","25");
 track.setAttribute("pathLength","100");track.setAttribute("class","dial-amount");
 const pointer=document.createElementNS("http://www.w3.org/2000/svg","line");
 pointer.setAttribute("x1","32");pointer.setAttribute("y1","11");
 pointer.setAttribute("x2","32");pointer.setAttribute("y2","22");
 pointer.setAttribute("class","dial-pointer");
 svg.append(background,track,pointer);knob.append(svg);
 const output=document.createElement("output");output.className="dial-value";
 let current=value;
 const format=field.format||((v)=>asUnit(v,field.display));
 function update(next,preview=false){
  current=clamp(next,field.min,field.max);
  const pct=clamp(fraction(current,field),0,1);
  const angle=-135+pct*270;
  pointer.style.transform="rotate("+angle+"deg)";
  track.style.strokeDasharray=(pct*75).toFixed(2)+" 100";
  track.style.transform="rotate(135deg)";
  output.textContent=format(current);
  knob.setAttribute("aria-valuenow",String(current));
  knob.setAttribute("aria-valuetext",format(current));
  if(preview)onPreview(current);
 }
 update(value);
 const moveTo=(t)=>update(fromFraction(t,field),true);
 let pointerStart=null,startFraction=0,startValue=value;
 knob.addEventListener("pointerdown",event=>{
  if(field.disabled||event.button!==0)return;
  event.preventDefault();
  knob.focus({preventScroll:true});
  pointerStart={id:event.pointerId,y:event.clientY};
  startValue=current;startFraction=fraction(current,field);
  knob.setPointerCapture(event.pointerId);
  control.classList.add("adjusting");
 });
 knob.addEventListener("pointermove",event=>{
  if(!pointerStart||pointerStart.id!==event.pointerId)return;
  // Vertical travel follows a real hardware knob: up raises the value,
  // Shift enables finer control.
  const distance=(pointerStart.y-event.clientY)/(event.shiftKey?720:150);
  moveTo(startFraction+distance);
 });
 function finish(event){
  if(!pointerStart||pointerStart.id!==event.pointerId)return;
  if(knob.hasPointerCapture(event.pointerId))knob.releasePointerCapture(event.pointerId);
  if(event.type==="pointercancel")update(startValue,true);
  else if(current!==startValue)onCommit(current);
  pointerStart=null;control.classList.remove("adjusting");
 }
 knob.addEventListener("pointerup",finish);
 knob.addEventListener("pointercancel",finish);
 knob.addEventListener("keydown",event=>{
  if(field.disabled)return;
  const delta=event.shiftKey?.1:1;
  const up=["ArrowUp","ArrowRight"].includes(event.key);
  const down=["ArrowDown","ArrowLeft"].includes(event.key);
  let next=null;
  if(up||down)next=current+(up?1:-1)*(field.step||.01)*delta;
  else if(event.key==="PageUp"||event.key==="PageDown")
   next=current+(event.key==="PageUp"?1:-1)*(field.max-field.min)/10;
  else if(event.key==="Home")next=field.min;
  else if(event.key==="End")next=field.max;
  if(next===null)return;
  event.preventDefault();
  const adjusted=fromFraction(fraction(clamp(next,field.min,field.max),field),field);
  if(current!==adjusted){update(adjusted,true);onCommit(adjusted);}
 });
 knob.addEventListener("dblclick",()=>{
  if(field.disabled)return;
  const reset=field.defaultValue??(field.min+field.max)/2;
  const next=fromFraction(fraction(reset,field),field);
  if(current!==next){update(next,true);onCommit(next);}
 });
 knob.title=field.disabled?(field.disabledReason||"This control is currently inactive."):"Drag up/down, use arrows, or double-click to reset";
 control.append(title,knob,output);
 return control;
}
