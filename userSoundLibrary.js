// One browser-local user sound catalog for both desktop and phone hosts.
// Presets are musical instructions + Asset metadata only, never sample bytes.
// Sample data persists separately via storage.js and must travel in exported ZIPs.
import {create,clone,id,validate,upgradeBeatFeatures} from "./schema.js";
import {validatePatch} from "./synth.js";
export const USER_SOUNDS_KEY="premidi-user-sounds-v2";
const LEGACY_KEY="premidi-user-sounds-v1";
export const MAX_USER_SOUNDS=100;

export function validUserSound(item){
 if(!item||typeof item!=="object"||typeof item.id!=="string"||
  !item.id||item.id.length>=80||typeof item.name!=="string"||
  !item.name.trim()||item.name.length>60)return false;
 if(item.sounds){
  const trial=create(),instrument=trial.instruments[0];
  instrument.layout="rack";instrument.sounds=clone(item.sounds);
  trial.samples=clone(item.samples||[]);
  upgradeBeatFeatures(trial);
  return validate(trial).length===0;
 }
 return validatePatch(item.patch).length===0;
}
export function loadUserSounds(storage=globalThis.localStorage){
 try{
  const entries=JSON.parse(storage.getItem(USER_SOUNDS_KEY)??storage.getItem(LEGACY_KEY)??"[]");
  return Array.isArray(entries)?entries.filter(validUserSound).slice(0,MAX_USER_SOUNDS):[];
 }catch{return [];}
}
export function writeUserSounds(items,storage=globalThis.localStorage){
 if(!Array.isArray(items)||items.length>MAX_USER_SOUNDS||
  new Set(items.map(item=>item.id)).size!==items.length||
  items.some(item=>!validUserSound(item)))throw Error("Invalid saved sound library.");
 storage.setItem(USER_SOUNDS_KEY,JSON.stringify(items));
 return items;
}
export function presetFromInstrument(instrument,beat,{name,wholeRack=false,soundId=null}={}){
 if(typeof name!=="string"||!name.trim()||name.length>60)
  throw Error("Preset name must be 1–60 characters.");
 if(wholeRack&&instrument.layout!=="rack")throw Error("Choose a rack to save.");
 const sound=instrument.sounds.find(item=>item.id===soundId)||instrument.sounds[0];
 if(!sound)throw Error("Choose a sound to save.");
 const copied=wholeRack?clone(instrument.sounds):[clone(sound)];
 const referenced=new Set(copied.flatMap(item=>item.patch.type==="sample"?
  item.patch.zones.map(zone=>zone.assetId):[]));
 const samples=clone(beat.samples.filter(asset=>referenced.has(asset.id)));
 if(samples.length!==referenced.size)throw Error("Missing sample Asset metadata.");
 const preset={id:"user-"+id(),name:name.trim(),category:"Mine",
  description:wholeRack?"Rack · "+copied.length+" sounds":"Saved sound",samples};
 if(wholeRack){
  preset.sounds=copied;preset.layout="rack";preset.volume=instrument.volume;
 }else{
  preset.patch=copied[0].patch;preset.trigger=sound.trigger;preset.volume=instrument.volume;
  preset.referencePitch=sound.referencePitch;preset.gain=sound.gain;
 }
 if(!validUserSound(preset))throw Error("Preset cannot be saved in the current format.");
 return preset;
}
