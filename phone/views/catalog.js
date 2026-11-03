// One factory catalog, same PRESETS/SAMPLE_LIBRARY/DRUM_RACKS as desktop.
// Asset downloads are explicit user actions; never encode samples in .premidi.
import {FACTORY_SOUND_CATALOG} from "../../soundCatalog.js";
import {getPreset,makePatch,patchCopy} from "../../synth.js";
import {SAMPLE_LIBRARY,makeSamplerPatch,sampleAsset} from "../../samples.js";
import {loadLibrarySample} from "../../sampler.js";
import {makeInstrument,makeSound} from "../../schema.js";
import {audition} from "../../audio.js";
import {nextRackPreview} from "../../rackPreview.js";

const assetRequests=new Map(),previewPositions=new Map();
const categoryOf=preset=>preset.category||"Other";
export const catalogCategories=()=>["All",...new Set(FACTORY_SOUND_CATALOG.map(categoryOf))];
export const catalogEntries=category=>FACTORY_SOUND_CATALOG.filter(preset=>
 category==="All"||categoryOf(preset)===category);
export const factorySpec=preset=>{
 const patch=preset.sounds?patchCopy(preset.sounds[0].patch):
  getPreset(preset.id)?makePatch(preset.id):
  preset.patch?patchCopy(preset.patch):
  preset.assets?makeSamplerPatch(preset):makePatch(preset.id);
 const trigger=preset.trigger||
  SAMPLE_LIBRARY.find(item=>item.id===patch.presetId)?.trigger||
  getPreset(patch.presetId)?.trigger||"pitched";
 return {name:preset.name,patch,trigger,referencePitch:preset.referencePitch??null,
  volume:preset.volume??null,gain:preset.gain??null,sounds:preset.sounds||null};
};
export async function resolveFactoryAssets(preset,beat){
 const patchSet=preset.sounds?.map(sound=>sound.patch)??[factorySpec(preset).patch];
 const ids=[...new Set(patchSet.flatMap(patch=>patch.type==="sample"?
  patch.zones.map(zone=>zone.assetId):[]))];
 return Promise.all(ids.map(id=>{
  const saved=(preset.samples||[]).find(item=>item.id===id)||beat.samples.find(item=>item.id===id);
  if(saved)return saved;
  if(!sampleAsset(id))throw Error("Missing imported recording "+id);
  if(!assetRequests.has(id))assetRequests.set(id,loadLibrarySample(id).catch(error=>{assetRequests.delete(id);throw error;}));
  return assetRequests.get(id);
 }));
}
export async function previewFactoryPreset(preset,beat){
 const spec=factorySpec(preset);
 if(spec.sounds){
  const chosen=nextRackPreview(previewPositions,"catalog:"+preset.id,spec.sounds);
  const row=chosen.sound,assets=await resolveFactoryAssets({patch:row.patch,samples:preset.samples},beat);
  const inst=makeInstrument(1,1,row);inst.layout="rack";inst.volume=spec.volume??.7;
  await audition(inst,row.referencePitch,{samples:assets},{soundId:row.id,duration:.5});
  return chosen.index+1+"/"+chosen.total;
 }
 const assets=await resolveFactoryAssets(preset,beat);
 const row=makeSound(preset.name,spec.patch,spec.trigger);
 row.referencePitch=spec.referencePitch??row.referencePitch;
 row.gain=spec.gain??1;
 const inst=makeInstrument(1,1,row);inst.volume=spec.volume??.7;
 await audition(inst,row.referencePitch,{samples:assets},{soundId:row.id,duration:.5});
 return null;
}
export function renderPhoneCatalog({filters,list,category,mode,beat,onCategory,onUse,onPreview}){
 filters.replaceChildren();list.replaceChildren();
 for(const name of catalogCategories()){
  const button=document.createElement("button");button.type="button";button.textContent=name;
  button.setAttribute("aria-pressed",String(category===name));
  button.addEventListener("click",()=>onCategory(name));filters.append(button);
 }
 for(const preset of catalogEntries(category).filter(p=>mode!=="replace-row"||!p.sounds)){
  const card=document.createElement("article");card.className="phone-catalog-item";
  card.dataset.presetId=preset.id;
  const desc=document.createElement("div");desc.className="phone-catalog-meta";
  const title=document.createElement("strong");title.textContent=preset.name;
  const text=document.createElement("span");text.textContent=preset.description||
   (preset.sounds?"factory rack · "+preset.sounds.length+" sounds":categoryOf(preset));
  desc.append(title,text);
  const buttons=document.createElement("div");buttons.className="phone-catalog-actions";
  const preview=document.createElement("button");preview.type="button";preview.textContent="▶";
  preview.setAttribute("aria-label","Preview "+preset.name);
  preview.addEventListener("click",()=>onPreview(preset,preview));
  const choose=document.createElement("button");choose.type="button";
  choose.textContent=preset.sounds?"add rack":mode==="add"?"add":"use";
  choose.setAttribute("aria-label",choose.textContent+" "+preset.name);
  choose.addEventListener("click",()=>onUse(preset,choose));
  buttons.append(preview,choose);card.append(desc,buttons);list.append(card);
 }
}
