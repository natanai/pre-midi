// Dedicated phone Sound presentation, backed by the same fully featured synth
// and sampler editors/descriptors as desktop. Never import the desktop studio.
import {renderPatchEditor} from "../../instrumentUI.js";
import {renderSamplerEditor} from "../../samplerUI.js";
import {canConvertToRack} from "../../soundModel.js";

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

export function renderPhoneSound(root,{session,selectedSoundId=null,onSelectSound,onPatchChange,onLevelChange,onNameChange,onBrowse,onPreview,onSave,onRenameSound,onRemoveInstrument,onRemoveSound,onExtractSound,onConvertToRack,onError}){
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
 const save=element("button","phone-sound-save");
 save.type="button";save.textContent="▣";save.setAttribute("aria-label","Save selected sound preset");
 save.title="save sound preset locally";save.addEventListener("click",()=>onSave(false,selectedSoundId));
 heading.append(save);
 if(inst.layout==="rack"){
  const rack=element("button","phone-sound-save");rack.type="button";
  rack.textContent="▣ rack";rack.setAttribute("aria-label","Save whole rack preset");
  rack.addEventListener("click",()=>onSave(true));heading.append(rack);
 }
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
 controls.append(namedSlider("sound level",active.gain,{min:0,max:1},value=>onLevelChange("sound",value,active.id)));
 root.append(controls);
 const browse=element("button","phone-sound-browse");browse.type="button";browse.textContent=inst.layout==="rack"?"+ add sound":"browse sounds";
 browse.addEventListener("click",()=>onBrowse("replace"));
 root.append(browse);
 if(inst.layout==="rack"){
  const replace=element("button","phone-sound-browse");replace.type="button";
  replace.textContent="replace selected rack row";replace.addEventListener("click",()=>onBrowse("replace-row"));
  root.append(replace);
 }
 const more=element("details","phone-sound-more");
 const summary=element("summary");summary.textContent="more · instrument and rack";
 more.append(summary);
 const actions=element("div","phone-sound-more-actions");
 const rowName=element("label","phone-sound-row-name");rowName.textContent="selected sound name";
 const rowInput=element("input");rowInput.type="text";rowInput.value=active.name;rowInput.maxLength=60;
 rowInput.setAttribute("aria-label","Selected sound name");
 rowInput.addEventListener("change",()=>onRenameSound(active.id,rowInput.value));
 rowName.append(rowInput);actions.append(rowName);
 if(inst.layout==="pitched"){
  const convert=element("button");convert.type="button";convert.textContent="convert to rack";
  convert.disabled=!canConvertToRack(inst);
  if(convert.disabled)convert.title="conversion would change pitches, zones or simultaneous notes";
  convert.addEventListener("click",onConvertToRack);actions.append(convert);
 }else{
  const extract=element("button");extract.type="button";extract.textContent="move sound to piano roll";
  extract.addEventListener("click",()=>onExtractSound(active.id));actions.append(extract);
  const remove=element("button");remove.type="button";remove.textContent="remove selected rack sound";
  remove.addEventListener("click",()=>onRemoveSound(active.id));actions.append(remove);
 }
 const del=element("button","phone-destructive");del.type="button";
 del.textContent=inst.layout==="rack"?"delete rack":"delete instrument";
 del.addEventListener("click",onRemoveInstrument);actions.append(del);
 more.append(actions);root.append(more);
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
