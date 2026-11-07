import {mountSoundPanelView} from "./soundPanelView.js";
import {movement,movementDefaults} from "./expression.js";
import {illustrateSoundPanel} from "./soundIllustrations.js";
import {collectSoundFields} from "./soundPanelLayout.js";
import {assignSoundEdit} from "./soundEditPath.js";
import {renderAudioToneControls,renderAudioMovementControls,renderAudioArticulationControls} from "./audioControlUI.js";
import {sampleTone,DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";
// Sample controls and synth controls share the same dial and visualization
// owner. All durable edits still flow through studio.js modify().
const sampleOpenStates=new Map();
export function activeSamplePanels(patch){
 const active=new Set(),tone=sampleTone(patch),move=movement(patch);
 if(JSON.stringify(tone.filter)!==JSON.stringify(DEFAULT_SAMPLE_FILTER)||tone.drive!==0)
  active.add("tone");
 if(Object.keys(movementDefaults).some(key=>move[key]!==movementDefaults[key])||
    (patch.bend?.shape??"straight")!=="straight"||(patch.bend?.amount??2)!==2||(patch.bend?.rate??4)!==4)
  active.add("movement");
 if((patch.gain??.9)!==.9||(patch.transpose??0)!==0||
    (patch.pan??0)!==0||(patch.strumMs??0)!==0||
    (patch.attack??.005)!==.005||(patch.release??.17)!==.17||
    !!patch.preserveDynamics)
  active.add("sample");
 if((patch.zones?.length??0)>1)active.add("mapping");
 return active;
}
export function renderSamplerEditor(root,patch,onChange,metadata,openUpload,onPreview=()=>{},soundId=null){
 const stateKey=soundId??patch;
 let expanded=sampleOpenStates.get(stateKey);
 if(!expanded){expanded=activeSamplePanels(patch);sampleOpenStates.set(stateKey,expanded);}
 const visuals=[];
 const preview=(path,value)=>{
  onPreview(path,value);
  if(!path?.length)return;
  const next=structuredClone(patch);assignSoundEdit(next,path,value);
  for(const visual of visuals)visual.draw(next);
 };

 root.soundPanelView?.dispose();
 root.replaceChildren();
 const header=document.createElement("div");header.className="sampler-description";
 const count=new Set(patch.zones.map(zone=>zone.root)).size;
 header.textContent=(metadata&&patch.zones.length<=8?metadata+" · ":"")+
  count+" recorded pitch"+(count===1?"":"es");
 root.append(header);
 // Direct sound shaping is prominent, including on imported and recorded audio.
 const toneGroup=document.createElement("details");toneGroup.className="synth-group sample-tone";toneGroup.open=expanded.has("tone");
 toneGroup.addEventListener("toggle",()=>toneGroup.open?expanded.add("tone"):expanded.delete("tone"));
 const toneTitle=document.createElement("summary");toneTitle.textContent="Tone · filter & distortion";
 const toneFields=document.createElement("div");toneFields.className="synth-fields dial-grid";
 renderAudioToneControls(toneFields,patch,onChange,preview,{showCutoff:true});
 toneGroup.append(toneTitle,toneFields);root.append(toneGroup);
 const movementGroup=document.createElement("details");movementGroup.className="synth-group";movementGroup.open=expanded.has("movement");
 movementGroup.addEventListener("toggle",()=>movementGroup.open?expanded.add("movement"):expanded.delete("movement"));
 const movementTitle=document.createElement("summary");movementTitle.textContent="Pitch & movement";
 const movementFields=document.createElement("div");movementFields.className="synth-fields dial-grid";
 renderAudioMovementControls(movementFields,patch,onChange,preview);
 movementGroup.append(movementTitle,movementFields);root.append(movementGroup);
 const details=document.createElement("details");details.className="synth-group sample-shaping";details.open=expanded.has("sample");
 details.addEventListener("toggle",()=>details.open?expanded.add("sample"):expanded.delete("sample"));
 const summary=document.createElement("summary");summary.textContent="Sample & articulation";
 const fields=document.createElement("div");fields.className="synth-fields dial-grid";
 renderAudioArticulationControls(fields,patch,onChange,preview);
 const toggles=document.createElement("div");toggles.className="sample-toggles";
 const addToggle=(label,path,checked)=>{
  const control=document.createElement("label");control.className="sample-pitch-setting";
  const box=document.createElement("input");box.type="checkbox";box.checked=checked;
  box.addEventListener("change",()=>onChange([path],box.checked));
  control.dataset.soundPath=path;
  control.append(box,document.createTextNode(label));toggles.append(control);
 };
 addToggle("Follow note pitch","followPitch",patch.followPitch);
 addToggle("Play full recording","oneShot",!!patch.oneShot);
 addToggle("Keep recorded dynamics","preserveDynamics",!!patch.preserveDynamics);
 details.append(summary,fields,toggles);root.append(details);
 const mapping=document.createElement("div");mapping.className="sample-zones";
 const notes=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
 const populateMapping=()=>patch.zones.forEach((zone,index)=>{
  const label=document.createElement("label");label.className="synth-field";
  const name=document.createElement("span");name.textContent="Sample "+(index+1)+" · recorded pitch";
  const select=document.createElement("select");
  select.setAttribute("aria-label","Sample "+(index+1)+" recorded note");
  for(let midi=0;midi<=127;midi++){
   const option=document.createElement("option");
   option.value=String(midi);
   option.textContent=notes[midi%12]+(Math.floor(midi/12)-1);
   select.append(option);
  }
  select.value=String(zone.root);
  select.addEventListener("change",()=>onChange(["zones",index,"root"],Number(select.value)));
  label.dataset.soundPath="zones."+index+".root";
   label.append(name,select);mapping.append(label);
 });
 const mapDetails=document.createElement("details");
 mapDetails.className="synth-group sample-map-details";
 mapDetails.open=expanded.has("mapping");
 mapDetails.addEventListener("toggle",()=>{
  if(mapDetails.open){expanded.add("mapping");if(!mapping.childElementCount)populateMapping();}
  else expanded.delete("mapping");
 });
 const mapHeading=document.createElement("summary");mapHeading.textContent="sample mapping";
 mapDetails.append(mapHeading,mapping);
 // Defer thousands of option nodes for large multisamples until opened.
 mapDetails.populateMapping=()=>{if(!mapping.childElementCount)populateMapping();};
 mapDetails.populateMapping();
 root.append(mapDetails);
 const soundFields=collectSoundFields(root);
 // Keep the same diagrams and direct manipulation for recorded instruments.
 // These wrappers leave the actual sampler dials and mapping controls intact.
 for(const [section,kind] of [[toneGroup,"filter"],[movementGroup,"movement"],[details,"sample"],[mapDetails,"mapping"]]){
  // illustrateSoundPanel moves section inside its new wrapper. Anchor the
  // original position *before* wrapping; replacing section afterward would
  // attempt to insert the wrapper into its own child.
  section.soundFields=soundFields;
  const anchor=document.createComment("sound visual position");
  section.before(anchor);
  const visual=illustrateSoundPanel(section,kind,patch,onChange,preview,soundId);
  visuals.push(visual);
  anchor.replaceWith(visual.element);
 }
 const action=document.createElement("button");action.type="button";action.className="sample-replace-action";
 action.textContent="Replace with my audio…";action.addEventListener("click",openUpload);
 root.append(action);
 mountSoundPanelView(root);
}
