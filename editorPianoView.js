// The Beat and Song-time freeform rolls use one keyboard and scale selector.
// Music ownership, note timing and undo remain the responsibility of each host.
import {pianoKeyGeometry} from "./pianoKeyboard.js";
import {SCALE_ROOTS,SCALE_MODES} from "./scaleGuide.js";

export function mountPianoKeyOverlay({low=36,high=83,rowHeight=23,noteLabel,onPlay}){
 const element=document.createElement("div");
 element.className="piano-keys-overlay";
 element.setAttribute("role","group");
 element.setAttribute("aria-label","Play piano keys");
 const keys=new Map();
 const geometry=pianoKeyGeometry(low,high,rowHeight);
 for(const [kind,entries] of [["white",geometry.white],["black",geometry.black]]){
  for(const {pitch,top,height} of entries){
   const key=document.createElement("button");
   key.type="button";
   key.className="piano-key "+kind;
   key.style.top=top+"px";
   key.style.height=height+"px";
   key.dataset.pitch=String(pitch);
   key.setAttribute("aria-label","Play "+noteLabel(pitch));
   key.title="play "+noteLabel(pitch);
   if(kind==="white"&&pitch%12===0){
    const caption=document.createElement("span");
    caption.className="piano-key-caption";
    caption.textContent=noteLabel(pitch);
    key.append(caption);
   }
   key.addEventListener("click",()=>onPlay(pitch,key));
   element.append(key);
   keys.set(pitch,key);
  }
 }
 return {element,keys};
}

export function populateScaleSelectors(root,mode){
 root.replaceChildren();
 mode.replaceChildren();
 SCALE_ROOTS.forEach((name,index)=>{
  const option=document.createElement("option");
  option.value=String(index);option.textContent=name;root.append(option);
 });
 SCALE_MODES.forEach(({id,name})=>{
  const option=document.createElement("option");
  option.value=id;option.textContent=name;mode.append(option);
 });
}
