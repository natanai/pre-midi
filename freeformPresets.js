// The existing Sound catalog can author Song-owned freeform Instruments.
// Reuse the canonical selection operation, Beat Sound schema and factory
// assets. No new preset format or alternate synthesis state is introduced.
import {clone,makeInstrument,makeSound} from "./schema.js";
import {addFreeformInstrument} from "./freeformModel.js";
import {selectionOperation,referencedSampleIds,MAX_SOUNDS} from "./soundModel.js";

const safeName=name=>{
 if(typeof name!=="string"||!name.trim())throw Error("Choose a named Sound.");
 return name.trim().slice(0,60);
};
const hasCutoffMovement=instrument=>
 instrument?.notes?.some(note=>note.cutoffAutomation!==undefined)||
 instrument?.chunks?.some(chunk=>chunk.notes.some(note=>note.cutoffAutomation!==undefined));
const referenced=patch=>patch?.type==="sample"?
 patch.zones.map(zone=>zone.assetId):[];

export function applyFreeformPreset(layer,selection,{
 name,patch,trigger,assets=[],rackSounds=null,settings=null
}={}){
 if(!layer||!Array.isArray(layer.instruments)||!Array.isArray(layer.samples))
  throw Error("Open a freeform Song lane first.");
 if(!selection||!["add","replace","replace-row"].includes(selection.mode))
  throw Error("Choose how the Sound should be added.");
 if(!["hit","pitched"].includes(trigger))throw Error("Invalid Sound trigger.");
 if(!patch||!Array.isArray(assets))throw Error("Choose a complete Sound preset.");
 const label=safeName(name);
 const target=layer.instruments.find(item=>item.id===selection.instrumentId);
 if(selection.mode!=="add"&&!target)throw Error("This freeform Instrument no longer exists.");
 const row=target?.sounds.find(item=>item.id===selection.soundId);
 if(selection.mode==="replace-row"&&(!row||target.layout!=="rack"))
  throw Error("Choose an existing rack Sound.");
 if(selection.mode==="replace-row"&&rackSounds)
  throw Error("A complete rack cannot replace one Sound.");
 const operation=selection.mode==="replace-row"?"replace-row":rackSounds?"create-rack":
  selectionOperation(target?.layout,trigger,selection.mode==="add");
 if(operation==="append-rack"&&target.sounds.length>=MAX_SOUNDS)
  throw Error("This Rack already contains 64 Sounds.");
 if(operation.startsWith("create-")&&layer.instruments.length>=64)
  throw Error("This freeform lane already contains 64 Instruments.");
 if(operation==="replace-pitched"&&patch.type!=="synth"&&hasCutoffMovement(target))
  throw Error("The Instrument contains cutoff movement. Keep a synthesizer or remove its movement first.");

 // Resolve all external sample references *before* modifying the live project.
 const incoming=rackSounds?rackSounds.flatMap(sound=>referenced(sound.patch)):referenced(patch);
 const assetsById=new Map(layer.samples.map(asset=>[asset.id,asset]));
 const supplied=new Map();
 for(const asset of assets){
  if(!asset||typeof asset.id!=="string")throw Error("Invalid sample Asset.");
  const existing=assetsById.get(asset.id)||supplied.get(asset.id);
  if(existing&&JSON.stringify(existing)!==JSON.stringify(asset))
   throw Error("A different sample Asset already uses this ID.");
  supplied.set(asset.id,asset);
 }
 for(const assetId of incoming)
  if(!assetsById.has(assetId)&&!supplied.has(assetId))
   throw Error("Sound preset is missing sample Asset "+assetId+".");

 for(const asset of supplied.values())
  if(!assetsById.has(asset.id))layer.samples.push(clone(asset));
 let resultInstrument=target,resultSound=null;
 if(operation.startsWith("create-")){
  const sound=makeSound(label,clone(patch),trigger);
  if(settings){
   sound.referencePitch=settings.referencePitch??sound.referencePitch;
   sound.gain=settings.gain??sound.gain;
  }
  const original=makeInstrument(layer.instruments.length+1,1,sound);
  if(rackSounds){
   original.layout="rack";
   original.sounds=clone(rackSounds);
  }
  original.name=label;
  if(settings?.volume!==undefined)original.volume=settings.volume;
  resultInstrument=addFreeformInstrument(layer,original);
  resultSound=resultInstrument.sounds[0];
 }else if(operation==="append-rack"){
  resultSound=makeSound(label,clone(patch),"hit");
  resultSound.referencePitch=settings?.referencePitch??resultSound.referencePitch;
  resultSound.gain=settings?.gain??resultSound.gain;
  target.sounds.push(resultSound);
 }else{
  resultSound=operation==="replace-row"?row:target.sounds[0];
  resultSound.patch=clone(patch);
  resultSound.name=label;
  resultSound.referencePitch=settings?.referencePitch??resultSound.referencePitch;
  resultSound.gain=settings?.gain??resultSound.gain;
  if(operation==="replace-pitched"){
   target.name=label;
   if(settings?.volume!==undefined)target.volume=settings.volume;
  }
 }
 const needed=referencedSampleIds(layer.instruments);
 layer.samples=layer.samples.filter(asset=>needed.has(asset.id));
 return {operation,instrumentId:resultInstrument.id,soundId:resultSound.id};
}
