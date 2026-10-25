import {BEND_SHAPES,bendSemitones} from "./expression.js";
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
export function renderNoteExpression(root,note,pitchLabel,durationSeconds,onChange,onDelete,onHear){
 root.replaceChildren();
 root.hidden=!note;
 if(!note)return;
 const bend=note.bend||{shape:"straight",amount:2,rate:4};
 const caption=make("div",undefined,"expression-title");
 caption.append(make("strong","Bend · "+pitchLabel,"expression-note"));
 const play=make("button","▶ Hear bend","expression-hear");
 play.type="button";play.addEventListener("click",onHear);
 caption.append(play);
 const clear=make("button","Delete note","expression-delete");
 clear.type="button";clear.addEventListener("click",onDelete);
 caption.append(clear);
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
 const amount=make("label","Amount");
 const amountRow=make("div",undefined,"expression-range");
 const slider=make("input");
 slider.type="range";slider.min="0";slider.max="12";slider.step=".25";
 slider.value=String(bend.amount);slider.setAttribute("aria-label","Bend amount in semitones");
 const output=make("output",bend.amount+" st");
 slider.addEventListener("input",()=>{output.textContent=slider.value+" st";draw();});
 slider.addEventListener("change",()=>onChange({...bend,amount:Number(slider.value)}));
 amountRow.append(slider,output);amount.append(amountRow);controls.append(amount);
 const rate=make("label","Wave speed");
 rate.className="expression-rate";
 const rateRow=make("div",undefined,"expression-range");
 const rateSlider=make("input");rateSlider.type="range";rateSlider.min=".1";rateSlider.max="12";rateSlider.step=".1";
 rateSlider.value=String(bend.rate);rateSlider.setAttribute("aria-label","Pitch wave speed");
 const rateOut=make("output",bend.rate+" Hz");
 rateSlider.addEventListener("input",()=>{rateOut.textContent=rateSlider.value+" Hz";draw();});
 rateSlider.addEventListener("change",()=>onChange({...bend,rate:Number(rateSlider.value)}));
 rateRow.append(rateSlider,rateOut);rate.append(rateRow);controls.append(rate);
 const graph=svg("svg",{viewBox:"0 0 320 64","aria-label":"Pitch movement preview",role:"img",preserveAspectRatio:"none"});
 const center=svg("line",{x1:0,x2:320,y1:32,y2:32,stroke:"#484848","stroke-dasharray":"3 4"});
 const shape=svg("polyline",{fill:"none",stroke:"currentColor","stroke-width":2});
 graph.append(center,shape);
 const visual=make("div",undefined,"expression-visual");
 visual.append(graph);
 function draw(){
  const current={shape:select.value,amount:Number(slider.value),rate:Number(rateSlider.value)};
  rate.hidden=current.shape!=="wave";
  const total=durationSeconds;
  const points=Array.from({length:81},(_,i)=>{
   const x=i/80,value=bendSemitones(current,x,x*total);
   return Math.round(x*320)+","+Math.round(32-value*2.1);
  });
  shape.setAttribute("points",points.join(" "));
 }
 root.append(caption,controls,visual);
 draw();
}
