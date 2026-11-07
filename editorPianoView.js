// The Beat and Song-time freeform rolls use one keyboard and scale selector.
// Music ownership, note timing and undo remain the responsibility of each host.
import {pianoKeyGeometry} from "./pianoKeyboard.js";
import {SCALE_ROOTS,SCALE_MODES,isPitchInScaleAtStep,scaleDirectionAtStep} from "./scaleGuide.js";

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

// The keyboard and row guide agree in both time modes, including directional
// melodic minor. Stored note data never changes when the guide changes.
export function paintPianoScale(rows,keys,guide,notes,step,noteLabel){
 const active=guide.mode!=="chromatic";
 const mode=SCALE_MODES.find(mode=>mode.id===guide.mode);
 for(const {rowData,row,label} of rows){
  const pitch=rowData.pitch;if(pitch===null)continue;
  const valid=isPitchInScaleAtStep(pitch,guide,notes,step);
  for(const target of [row,keys.get(pitch)]){
   if(!target)continue;
   target.classList.toggle("in-scale",active&&valid);
   target.classList.toggle("out-of-scale",active&&!valid);
  }
  const direction=mode?.descendingSteps?scaleDirectionAtStep(pitch,notes,step):"";
  label.title=noteLabel(pitch)+(active?" · "+(valid?"in ":"outside ")+
   SCALE_ROOTS[guide.root]+" "+mode.name+
   (direction?" · "+(direction==="either"?"either direction":direction):""):"");
 }
}
