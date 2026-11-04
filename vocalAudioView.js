// Map the Song Clip's canonical audio processing to the existing sample
// illustration contract. No Recording bytes, note-zone mapping, or Song clock
// state is copied into these temporary display patches.
import {vocalEffects} from "./vocalEffects.js";
import {DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";
import {assignSoundEdit} from "./soundEditPath.js";

const ALLOWED=new Set(["filter","drive","movement","bend","gain",
 "transpose","pan","attack","release","delayMix","delayTime","delayFeedback"]);
export function vocalDisplayPatch(clip,recording){
 const fx=vocalEffects(clip);
 return {
  type:"vocal",audioFilterBypassed:fx.filter===null,
  filter:fx.filter??DEFAULT_SAMPLE_FILTER,drive:fx.drive,
  movement:fx.movement,bend:fx.bend,
  gain:clip.gain??1,transpose:fx.transpose,pan:fx.pan,
  attack:fx.attack,release:fx.release,
  effects:{delayMix:fx.delayMix,delayTime:fx.delayTime,delayFeedback:fx.delayFeedback},
  // Only required by the generic sample envelope rendering contract.
  zones:[{assetId:recording.id,root:60}]
 };
}
// An illustration may edit two axes at once. The returned flat patch changes
// must be applied in one Song transaction and therefore one undo step.
export function vocalChangesFromControl(display,path,value){
 const paths=Array.isArray(path?.[0])?path:[path];
 if(!paths?.length||paths.some(p=>!Array.isArray(p)||!p.length))
  throw Error("Invalid vocal control path");
 const next=structuredClone(display),keys=new Set();
 assignSoundEdit(next,path,value);
 for(const p of paths){
  const key=p[0]==="effects"?p[1]:p[0];
  if(!ALLOWED.has(key))throw Error("Unsupported vocal control "+String(key));
  keys.add(key);
 }
 const changes={};
 for(const key of keys){
  if(key==="filter")changes.filter=next.filter;
  else if(key==="delayMix"||key==="delayTime"||key==="delayFeedback")
   changes[key]=next.effects[key];
  else changes[key]=next[key];
 }
 return changes;
}
