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
 const graph=svg("svg",{viewBox:"0 0 320 64","aria-label":"Pitch movement preview",role:"img",preserveAspectRatio:"none"});
 const center=svg("line",{x1:0,x2:320,y1:32,y2:32,stroke:"#484848","stroke-dasharray":"3 4"});
 const shape=svg("polyline",{fill:"none",stroke:"currentColor","stroke-width":2});
 graph.append(center,shape);
 const visual=make("div",undefined,"expression-visual");
 visual.append(graph);
 function draw(){
  current.shape=select.value;
  rate.hidden=current.shape!=="wave";
  const total=durationSeconds;
  const points=Array.from({length:81},(_,i)=>{
   const x=i/80,value=bendSemitones(current,x,x*total);
   return Math.round(x*320)+","+Math.round(32-value*2.1);
  });
  shape.setAttribute("points",points.join(" "));
 }
 root.append(caption,level,controls,visual);
 draw();
}
