// One reusable instrument dial. Native patch validation and the caller's
// modify() remain the ONLY mutation path. Drag previews are transient.

const labelHelp=Object.freeze({
 "cutoff timeline":"move brightness between two spots in this beat; presets keep the base sound",
 "automation bar":"the bar where this value belongs",
 "automation beat":"the beat inside that bar; quarters pick the smaller grid steps",
 "begin cutoff":"how bright it is at the first spot",
 "end cutoff":"how bright it becomes at the last spot",
 "movement amount":"how far this movement changes the sound",
 "movement speed":"how quickly this movement repeats",
 "movement source":"choose what makes this sound move",
 "movement target":"choose which part of the sound moves",
 "movement range":"move in one direction or swing both ways",
 "move attack":"how slowly the movement rises",
 "move decay":"how quickly the movement settles after rising",
 "move sustain":"where the movement stays while the note is held",
 "move release":"how slowly the movement fades after the note ends",
 "bend shape":"scoop into the note, fall off it, or wobble around",
 "shape":"choose how the pitch gets there",
 "bend amount":"a tiny pitch dip or a full octave yowl",
 "amount":"a tiny pitch dip or a full octave yowl",
 "wave speed":"how fast the pitch goes wee-woo-wee-woo",
 "vibrato rate":"how fast the note shakes",
 "vibrato speed":"how fast the note shakes",
 "vibrato depth":"how far the note shakes",
 "vibrato":"how far the note shakes",
 "vibrato waits":"starts steady, gets nervous later",
 "glide from":"arrive from the wrong note on purpose",
 "glide time":"snap into tune or take the scenic route",
 "pulse amount":"make the volume throb harder",
 "pulse":"make the volume throb harder",
 "pulse speed":"how fast the volume goes loud-quiet-loud",
 "tone wave":"more waaaah per note",
 "tone speed":"lazy wah or a very busy wah",
 "pan":"left ear, right ear, your call",
 "wave":"sine goes ooo, saw goes bzzz, square goes beep",
 "level":"how loud this sound is in the mix",
 "sound level":"just this sound, not the whole rack",
 "rack volume":"every sound in the rack together",
 "volume":"how loud this instrument is in the mix",
 "octave":"same note, twelve keys higher or lower",
 "detune":"make two pitches disagree just a little",
 "attack":"an instant smack or a slow fade-in",
 "decay":"how quickly the initial smack calms down",
 "sustain":"how loud the note stays while you hold it",
 "release":"how long it fades after you let go",
 "filter":"choose which parts of the sound get through",
 "filter type":"choose which parts of the sound get through",
 "brightness":"move the filter to shape the high and low parts of the sound",
 "cutoff":"move where the filtering happens",
 "resonance":"make the filter's edge whistle",
 "filter sweep":"make the filter slide into place with each note",
 "sweep time":"how long that slide takes",
 "noise":"mix some shhhhh into the sound",
 "noise decay":"how quickly the shhhhh dies",
 "distortion":"turn smooth sound into crunchy sound",
 "delay":"hear the sound answer itself",
 "delay time":"how late the answer comes",
 "feedback":"make the echo echo its own echo",
 "transpose":"move the entire recording up or down in pitch",
 "strum":"one string after another instead of all at once",
 "h1 · root":"the actual note",
 "h2":"bring its octave along",
 "h3":"getting a bit brassy",
 "h4":"another octave upstairs",
 "h5":"a little major-third sparkle",
 "h6":"more of that brassy stuff",
 "h7":"things are getting weird",
 "h8":"way up there"
});
const unitHelp=Object.freeze({oct:"octaves",st:"semitones",ct:"cents",hz:"hertz",khz:"kilohertz",ms:"milliseconds","%":"percent",l:"left",r:"right",c:"center"});
export function helpForLabel(label){
 const key=String(label).toLowerCase();
 return labelHelp[key] || (/^h(?:[9]|[12][0-9]|3[0-2])$/.test(key)
  ? Number(key.slice(1))<=16?"for the finer edges":Number(key.slice(1))<=24?"the skinny stuff above the buzz":"tiny splinters way up top"
  : "");
}
// One floating help layer per document. Tooltips must escape scrolling sound panels.
// Only label and unit text may trigger it; the interactive dial never does.
export function placeHelp(anchor, bubble, viewport, gap=8){
 const edge=8, leftEdge=viewport.left??0, topEdge=viewport.top??0;
 const rightEdge=leftEdge+viewport.width, bottomEdge=topEdge+viewport.height;
 const left=Math.max(leftEdge+edge,Math.min(
  anchor.left+anchor.width/2-bubble.width/2,rightEdge-edge-bubble.width));
 const above=anchor.top-gap-bubble.height, below=anchor.bottom+gap;
 const spaceAbove=anchor.top-(topEdge+edge), spaceBelow=bottomEdge-edge-anchor.bottom;
 const top=above>=topEdge+edge?above:
  below+bubble.height<=bottomEdge-edge?below:
  spaceBelow>=spaceAbove?below:above;
 return {
  left:Math.max(leftEdge+edge,Math.min(left,rightEdge-edge-bubble.width)),
  top:Math.max(topEdge+edge,Math.min(top,bottomEdge-edge-bubble.height))
 };
}
const helpDocuments=new WeakMap();
function installHelp(doc=document){
 if(helpDocuments.has(doc))return helpDocuments.get(doc);
 const win=doc.defaultView;
 const tooltip=doc.createElement("div");
 tooltip.className="floating-help";
 tooltip.id="studio-floating-help";
 tooltip.setAttribute("role","tooltip");
 tooltip.hidden=true;
 doc.body.append(tooltip);
 const state={tooltip,target:null,pinned:false};
 const nodeFor=target=>target?.closest?.(".control-help,.unit-help");
 const viewport=()=>{
  const visual=win.visualViewport;
  return {
   left:visual?.offsetLeft??0,top:visual?.offsetTop??0,
   width:visual?.width??win.innerWidth,height:visual?.height??win.innerHeight
  };
 };
 function hide(){
  if(state.target?.getAttribute("aria-describedby")===tooltip.id)
   state.target.removeAttribute("aria-describedby");
  state.target=null;state.pinned=false;tooltip.hidden=true;
 }
 function position(){
  if(!state.target?.isConnected){hide();return;}
  const rect=state.target.getBoundingClientRect();
  const screen=viewport();
  if(rect.bottom<screen.top||rect.top>screen.top+screen.height||
     rect.right<screen.left||rect.left>screen.left+screen.width){hide();return;}
  const geometry=placeHelp(rect,tooltip.getBoundingClientRect(),screen);
  tooltip.style.left=geometry.left+"px";
  tooltip.style.top=geometry.top+"px";
 }
 function show(target,pinned=false){
  const help=target?.dataset.help;
  if(!help)return;
  if(state.target!==target&&state.target?.getAttribute("aria-describedby")===tooltip.id)
   state.target.removeAttribute("aria-describedby");
  state.target=target;state.pinned=pinned;
  tooltip.textContent=help;
  tooltip.hidden=false;
  target.setAttribute("aria-describedby",tooltip.id);
  position();
 }
 // pointerover/out bubble reliably even when labels are rebuilt by the editor.
 doc.addEventListener("pointerover",event=>{
  if(event.pointerType==="touch")return;
  const target=nodeFor(event.target);
  if(target?.dataset.help&&(!state.pinned||state.target===target))
   show(target,state.pinned&&state.target===target);
 });
 doc.addEventListener("pointerout",event=>{
  const target=nodeFor(event.target);
  if(target&&target===state.target&&!state.pinned&&!target.contains(event.relatedTarget))hide();
 });
 doc.addEventListener("focusin",event=>{
  const target=nodeFor(event.target);
  if(target?.dataset.help&&!state.pinned)show(target);
 });
 doc.addEventListener("focusout",event=>{
  const target=nodeFor(event.target);
  if(target&&target===state.target&&!state.pinned&&!target.contains(event.relatedTarget))hide();
 });
 doc.addEventListener("click",event=>{
  const target=nodeFor(event.target);
  if(!target?.dataset.help)return;
  if(target.closest("label"))event.preventDefault();
  if(state.target===target&&state.pinned)hide();
  else show(target,true);
 });
 doc.addEventListener("pointerdown",event=>{
  if(state.pinned&&!nodeFor(event.target))hide();
 },true);
 doc.addEventListener("keydown",event=>{
  if(event.key==="Escape"){hide();return;}
  if(!["Enter"," "].includes(event.key))return;
  const target=nodeFor(doc.activeElement);
  if(!target?.dataset.help)return;
  event.preventDefault();
  if(state.target===target&&state.pinned)hide();
  else show(target,true);
 });
 doc.addEventListener("scroll",()=>{
  if(!state.target)return;
  if(state.pinned)position();else hide();
 },true);
 win.addEventListener("resize",()=>{if(state.target)position();});
 win.visualViewport?.addEventListener("resize",()=>{if(state.target)position();});
 win.visualViewport?.addEventListener("scroll",()=>{if(state.target)position();});
 helpDocuments.set(doc,state);
 return state;
}
export function explainLabel(node,label,override){
 const help=override??helpForLabel(label);
 if(!help)return;
 installHelp(node.ownerDocument);
 node.classList.add("control-help");
 node.dataset.help=help;
 node.tabIndex=0;
 node.setAttribute("aria-description",help);
}
function makeUnit(output,abbreviation){
 const unit=output.ownerDocument.createElement("span");
 unit.className="unit-help";
 unit.textContent=abbreviation;
 unit.dataset.help=unitHelp[abbreviation];
 unit.tabIndex=0;
 unit.setAttribute("aria-label",abbreviation+" means "+unitHelp[abbreviation]);
 return unit;
}
export function explainUnit(output,rendered){
 installHelp(output.ownerDocument);
 const text=String(rendered).toLowerCase();
 const match=/^(.*?)(\s*)(khz|hz|ms|ct|st|oct|%|l|r|c)$/.exec(text);
 if(!match){
  const pan=/^(l|r) (\d+)$/.exec(text);
  if(pan)output.replaceChildren(makeUnit(output,pan[1]),
   output.ownerDocument.createTextNode(" "+pan[2]));
  else output.textContent=text;
  return;
 }
 const [,prefix,space,abbreviation]=match;
 output.replaceChildren(output.ownerDocument.createTextNode(prefix+space),
  makeUnit(output,abbreviation));
}

const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const pretty=(n,p)=>Number(n.toFixed(p));
export const asUnit=(value,display="number")=>{
 if(display==="percent")return Math.round(value*100)+"%";
 if(display==="seconds")return Math.round(value*1000)+" ms";
 if(display==="hz")return value>=1000?(value/1000).toFixed(1)+" kHz":Math.round(value)+" Hz";
 if(display==="octaves")return pretty(value,2)+" oct";
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
 const title=document.createElement("span");title.className="dial-label";
 const name=document.createElement("span");name.textContent=field.label.toLowerCase();title.append(name);
 const explanation=field.disabled&&field.disabledReason?
  field.disabledReason.toLowerCase().replace(/[.!]+$/,""):(field.help??helpForLabel(field.label));
 explainLabel(name,field.label,explanation);
 const knob=document.createElement("div");knob.className="dial-knob";
 knob.tabIndex=field.disabled?-1:0;knob.setAttribute("role","slider");
 if(field.disabled){control.classList.add("dial-disabled");knob.setAttribute("aria-disabled","true");}
 knob.setAttribute("aria-label",field.label);
 if(explanation)knob.setAttribute("aria-description",explanation);
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
  explainUnit(output,format(current));
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
 if(field.disabled&&field.disabledReason)knob.setAttribute("aria-description",field.disabledReason);
 control.append(title,knob,output);
 return control;
}
