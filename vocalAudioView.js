import {sourceSettings} from './src/dsp/source-processing.js';
import {waveformPeaksFromOverview} from "./audioWaveform.js";
// Map the Song Clip's canonical audio processing to the existing sample
// illustration contract. No Recording bytes, note-zone mapping, or Song clock
// state is copied into these temporary display patches.
import {vocalEffects,vocalSourceRange} from "./vocalEffects.js";
import {DEFAULT_SAMPLE_FILTER} from "./audioEffects.js";
import {assignSoundEdit} from "./soundEditPath.js";

const ALLOWED=new Set(["sourceProcessing","reverb","stereoWidth","msBalance","delayTone","delayPingPong","eq","filterStages","chain","filter","drive","movement","bend","gain",
 "delaySync","automation","modulation","transpose","pan","attack","release","delayMix","delayTime","delayFeedback"]);
export function vocalDisplayPatch(clip,recording){
 const fx=vocalEffects(clip);
 return {
  type:"vocal",audioFilterBypassed:fx.filter===null,
  sourceProcessing:fx.sourceProcessing,reverb:fx.reverb,stereoWidth:fx.stereoWidth,msBalance:fx.msBalance,delayTone:fx.delayTone,delayPingPong:fx.delayPingPong,eq:fx.eq,filterStages:fx.filterStages,delaySync:clip.effects?.delaySync,chain:fx.chain,filter:fx.filter,drive:fx.drive,
  movement:fx.movement,bend:fx.bend,modulation:fx.modulation,automation:fx.automation,
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

export function vocalEventFromPatch(patch,context,level=1){
 const {clip,recording}=context.vocal;
 return {recording,track:{kind:"vocal"},clip:{...structuredClone(clip),gain:level,
  effects:{sourceProcessing:patch.sourceProcessing,reverb:patch.reverb,stereoWidth:patch.stereoWidth,msBalance:patch.msBalance,delayTone:patch.delayTone,delayPingPong:patch.delayPingPong,eq:patch.eq,filterStages:patch.filterStages,delaySync:patch.delaySync,chain:patch.chain,...vocalChangesFromControl(patch,[["filter"],["drive"],["movement"],["bend"],["transpose"],["pan"],["attack"],["release"]],
   [patch.filter,patch.drive,patch.movement,patch.bend,patch.transpose,patch.pan,patch.attack,patch.release]),
   ...patch.effects,...(patch.automation?{automation:patch.automation}:{}),...(patch.modulation?{modulation:patch.modulation}:{})}}};
}

// Song thumbnail and tile width use the same source window as playback.
export function vocalClipDisplay(recording,clip,bpm,bins=120){
 const unit=60/bpm/4,{offset,duration,rate}=vocalSourceRange(recording,clip,unit);
 return {duration,steps:duration/unit,sourceStart:offset,sourceEnd:offset+duration*rate/sourceSettings(clip.effects).time,
  peaks:recording.waveform?.length?waveformPeaksFromOverview(recording.waveform,recording.durationSeconds,offset,offset+duration*rate/sourceSettings(clip.effects).time,bins)[sourceSettings(clip.effects).reverse?'reverse':'slice']():[]};
}
