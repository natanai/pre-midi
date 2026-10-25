// One reusable instrument dial. Native patch validation and the caller's
// modify() remain the ONLY mutation path. Drag previews are transient.

const labelHelp=Object.freeze({
 "bend shape":"scoop into the note, fall off it, or wobble around",
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
const unitHelp=Object.freeze({st:"semitones",ct:"cents",hz:"hertz",khz:"kilohertz",ms:"milliseconds","%":"percent",l:"left",r:"right",c:"center"});
export function helpForLabel(label){
 const key=String(label).toLowerCase();
 return labelHelp[key] || (/^h(?:[9]|[12][0-9]|3[0-2])$/.test(key)
  ? Number(key.slice(1))<=16?"for the finer edges":Number(key.slice(1))<=24?"the skinny stuff above the buzz":"tiny splinters way up top"
  : "");
}
// Help belongs to the text alone; not the interactive knob or select.
export function explainLabel(node,label,override){
 const help=override??helpForLabel(label);
 if(!help)return;
 node.classList.add("control-help");
 node.dataset.help=help;
 node.addEventListener("click",()=>{
  const expanded=node.classList.contains("help-open");
  document.querySelectorAll(".control-help.help-open").forEach(item=>item.classList.remove("help-open"));
  if(!expanded)node.classList.add("help-open");
 });
}
export function explainUnit(output,rendered){
 const text=String(rendered).toLowerCase();
 const match=/^(.*?)(\s*)(khz|hz|ms|ct|st|%|l|r|c)$/.exec(text);
 if(!match){output.textContent=text;return;}
 const [,prefix,space,abbreviation]=match;
 const unit=document.createElement("span");
 unit.className="unit-help";
 unit.textContent=abbreviation;
 unit.dataset.help=unitHelp[abbreviation];
 unit.addEventListener("click",()=>{
  const expanded=unit.classList.contains("help-open");
  document.querySelectorAll(".unit-help.help-open").forEach(item=>item.classList.remove("help-open"));
  if(!expanded)unit.classList.add("help-open");
 });
 output.replaceChildren(document.createTextNode(prefix+space),unit);
}

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
 const title=document.createElement("span");title.className="dial-label";
 const name=document.createElement("span");name.textContent=field.label.toLowerCase();title.append(name);
 explainLabel(name,field.label,field.help);
 const knob=document.createElement("div");knob.className="dial-knob";
 knob.tabIndex=field.disabled?-1:0;knob.setAttribute("role","slider");
 if(field.disabled){control.classList.add("dial-disabled");knob.setAttribute("aria-disabled","true");}
 knob.setAttribute("aria-label",field.label);
 const explanation=field.help??helpForLabel(field.label);
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
