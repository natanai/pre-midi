// Dedicated phone Sound presentation, backed by the same fully featured synth
// and sampler editors/descriptors as desktop. Never import the desktop studio.
import {renderPatchEditor} from "../../instrumentUI.js";
import {renderSamplerEditor} from "../../samplerUI.js";

const element=(tag,name)=>{const node=document.createElement(tag);if(name)node.className=name;return node;};
function namedSlider(label,value,{min=0,max=1,step=.01}={},onCommit){
 const group=element("label","phone-level");
 const text=element("span");text.textContent=label;
 const slider=element("input");slider.type="range";slider.min=String(min);slider.max=String(max);
 slider.step=String(step);slider.value=String(value);
 slider.setAttribute("aria-label",label);
 const output=element("output");output.textContent=String(value);
 slider.addEventListener("input",()=>{output.textContent=String(slider.value);});
 slider.addEventListener("change",()=>onCommit(Number(slider.value)));
 group.append(text,slider,output);return group;
}

export function renderPhoneSound(root,{session,selectedSoundId=null,onSelectSound,onPatchChange,onLevelChange,onNameChange,onPreview,onError}){
 root.replaceChildren();
 const inst=session.getInstrument(),beat=session.getBeat();
 const heading=element("div","phone-sound-heading");
 const title=element("label","phone-sound-title");
 title.textContent="instrument";
 const name=element("input");name.type="text";name.value=inst.name;name.maxLength=60;
 name.setAttribute("aria-label","Instrument name");
 name.addEventListener("change",()=>onNameChange(name.value));
 title.append(name);heading.append(title);
 const audition=element("button","phone-sound-audition");
 audition.type="button";audition.textContent="▶";audition.setAttribute("aria-label","Preview selected sound");
 audition.addEventListener("click",()=>onPreview(selectedSoundId));
 heading.append(audition);
 root.append(heading);
 const controls=element("div","phone-sound-head-controls");
 controls.append(namedSlider("instrument level",inst.volume,{},value=>onLevelChange("instrument",value)));
 const selectLabel=element("label","phone-sound-selector");
 selectLabel.textContent=inst.layout==="rack"?"rack sound":"sound";
 const picker=element("select");picker.id="phone-sound-select";picker.setAttribute("aria-label","Sound to edit");
 for(const sound of inst.sounds){
  const opt=element("option");opt.value=sound.id;opt.textContent=sound.name;picker.append(opt);
 }
 const active=inst.sounds.find(sound=>sound.id===selectedSoundId)||inst.sounds[0];
 picker.value=active.id;
 picker.addEventListener("change",()=>onSelectSound(picker.value));
 selectLabel.append(picker);controls.append(selectLabel);
 controls.append(namedSlider("sound level",active.gain,{min:0,max:2},value=>onLevelChange("sound",value,active.id)));
 root.append(controls);
 const info=element("p","phone-sound-info");
 info.textContent=active.patch.type==="sample"?"recorded sample · mapped to external audio":"native synthesizer · full parameter editor";
 root.append(info);
 const editor=element("div","phone-patch-editor");
 const change=(path,value)=>onPatchChange(active.id,path,value);
 // These are the actual desktop parameter and visualization components, not
 // a manually truncated phone copy. Phone owns their responsive layout.
 if(active.patch.type==="synth")renderPatchEditor(editor,active.patch,change,()=>{},active.id);
 else{
  renderSamplerEditor(editor,active.patch,change,undefined,()=>{
   onError("Replacing a sample is not yet available on phone; the original recording is preserved");
  },()=>{},active.id);
  const replace=editor.querySelector(".sample-replace-action");
  if(replace){replace.disabled=true;replace.title="Sample replacement is coming to phone";}
 }
 root.append(editor);
 return {soundId:active.id,beatId:beat.id,kind:active.patch.type};
}
