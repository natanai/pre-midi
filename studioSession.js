// DOM-free Beat/Song editing session. One command and history contract for every host.
import {clone,create,makeInstrument,makeSound,id,validate,upgradeBeatFeatures} from "./schema.js";
import {selectionOperation,MAX_SOUNDS} from "./soundModel.js";
import {validateSong,upgradeSongFeatures,createSong,addBeat,addSongTrack,addBeatClip,editBeatClip,addVocalTake} from "./songModel.js";
import {applyNoteCommand} from "./studioCommands.js";
import {assignSoundEdit} from "./soundEditPath.js";

export function createStudioSession(initial=create(),onCommit=()=>{}){
 let document=clone(initial),activeBeatId=null,activeInstrumentId=null;
 const chunks=new Map();
 let history=[],future=[],preview=null;
 const beat=()=>document.kind==="song"?
  document.beats.find(item=>item.id===activeBeatId)||document.beats[0]:document;
 const instrument=()=>beat().instruments.find(item=>item.id===activeInstrumentId)||beat().instruments[0];
 const chunk=()=>instrument().chunks.find(item=>item.id===chunks.get(instrument().id))||instrument().chunks[0];
 function repair(){
  const currentBeat=beat();activeBeatId=currentBeat.id;
  if(!currentBeat.instruments.some(item=>item.id===activeInstrumentId))
   activeInstrumentId=currentBeat.instruments[0].id;
  for(const item of currentBeat.instruments)
   if(!item.chunks.some(entry=>entry.id===chunks.get(item.id)))chunks.set(item.id,item.chunks[0].id);
 }
 function check(){
  if(document.kind==="song"){
   upgradeSongFeatures(document);
   return validateSong(document);
  }
  upgradeBeatFeatures(document);
  return validate(document);
 }
 repair();
 const errors=check();
 if(errors.length)throw Error(errors[0]);
 const notify=()=>onCommit(document);
 function beginPreview(){
  if(preview)throw Error("An edit is already active.");
  preview=clone(document);
 }
 function applyPreview(command){
  if(!preview)throw Error("Begin the edit before applying a command.");
  return applyNoteCommand(chunk(),command,{
   layout:instrument().layout,sounds:instrument().sounds,minPitch:36,maxPitch:96
  });
 }
 function finishPreview(cancel=false){
  if(!preview)return false;
  const before=preview;preview=null;
  if(cancel){document=before;repair();return false;}
  const problems=check();
  if(problems.length){document=before;repair();throw Error(problems[0]);}
  if(JSON.stringify(before)===JSON.stringify(document))return false;
  history.push(before);
  if(history.length>100)history.shift();
  future=[];notify();return true;
 }
 function dispatch(command){
  beginPreview();
  try{
   const result=applyPreview(command);
   const changed=finishPreview();
   return {...result,changed};
  }catch(error){
   finishPreview(true);throw error;
  }
 }
 function replace(next){
  if(preview)throw Error("Cannot replace during an edit.");
  const old=document;document=clone(next);
  activeBeatId=null;activeInstrumentId=null;chunks.clear();
  try{repair();const problems=check();if(problems.length)throw Error(problems[0]);}
  catch(error){document=old;repair();throw error;}
  history=[];future=[];notify();
 }
 function stepBack(from,to){
  if(preview)throw Error("Cannot undo during an edit.");
  if(!from.length)return false;
  to.push(clone(document));document=from.pop();repair();notify();return true;
 }
 function setBpm(value){
  const tempo=Number(value);
  if(preview||!Number.isInteger(tempo)||tempo<40||tempo>240)return false;
  const current=beat();if(current.bpm===tempo)return false;
  const before=clone(document);current.bpm=tempo;
  const problems=check();
  if(problems.length){document=before;repair();throw Error(problems[0]);}
  history.push(before);if(history.length>100)history.shift();
  future=[];notify();return true;
 }
 function editInstrument(mutate){
  if(preview)return false;
  const previous=clone(document),current=instrument();
  let changed;
  try{changed=mutate(current);}
  catch(error){document=previous;repair();throw error;}
  if(!changed)return false;
  const problems=check();
  if(problems.length){document=previous;repair();throw Error(problems[0]);}
  history.push(previous);if(history.length>100)history.shift();
  future=[];notify();return true;
 }
 function renameInstrument(name){
  if(typeof name!=="string"||!name.trim()||name.length>60)return false;
  return editInstrument(inst=>{
   if(inst.name===name.trim())return false;
   inst.name=name.trim();return true;
  });
 }
 function changeInstrumentVolume(volume){
  if(!Number.isFinite(volume)||volume<0||volume>1)return false;
  return editInstrument(inst=>{
   if(inst.volume===volume)return false;
   inst.volume=volume;return true;
  });
 }
 function changeSoundGain(soundId,gain){
  if(!Number.isFinite(gain)||gain<0||gain>2)return false;
  return editInstrument(inst=>{
   const sound=inst.sounds.find(row=>row.id===soundId);
   if(!sound||sound.gain===gain)return false;
   sound.gain=gain;return true;
  });
 }
 function changeSoundPatch(soundId,path,value){
  if(!Array.isArray(path)||!path.length)return false;
  return editInstrument(inst=>{
   const sound=inst.sounds.find(row=>row.id===soundId);
   if(!sound)return false;
   const patch=clone(sound.patch);
   assignSoundEdit(patch,path,clone(value));
   if(patch.modulation!==undefined)patch.version=2;
   patch.presetId="custom";
   if(JSON.stringify(patch)===JSON.stringify(sound.patch))return false;
   sound.patch=patch;return true;
  });
 }
 // The same factory catalogue used by desktop supplies this host-independent
 // score command. Loading samples happens in the host before the one undoable edit.
 function selectCatalogSound({name,patch,trigger="pitched",sounds=null,assets=[],mode="add",soundId=null,volume=null,referencePitch=null,gain=null}){
  if(preview||typeof name!=="string"||!name.trim()||name.length>60||
     !["pitched","hit"].includes(trigger)||!["add","replace","replace-row"].includes(mode)||
     !Array.isArray(assets)||!Array.isArray(sounds)&&sounds!==null)return false;
  const before=clone(document),beforeId=activeInstrumentId,current=beat(),target=instrument();
  try{
   const operation=mode==="replace-row"?"replace-row":sounds?"create-rack":
    selectionOperation(target.layout,trigger,mode==="add");
   if(operation.startsWith("create-")){
    if(current.instruments.length>=12)return false;
    const row=makeSound(name,clone(patch),trigger);
    if(referencePitch!==null)row.referencePitch=referencePitch;
    if(gain!==null)row.gain=gain;
    const added=makeInstrument(current.instruments.length+1,current.bars,row);
    added.name=name;
    if(sounds){
     added.layout="rack";
     added.sounds=clone(sounds).map(sound=>({...sound,id:id()}));
    }
    if(volume!==null)added.volume=volume;
    current.instruments.push(added);
    activeInstrumentId=added.id;
   }else if(operation==="append-rack"){
    if(target.sounds.length>=MAX_SOUNDS)return false;
    const row=makeSound(name,clone(patch),"hit");
    if(referencePitch!==null)row.referencePitch=referencePitch;
    if(gain!==null)row.gain=gain;
    target.sounds.push(row);
   }else{
    const row=operation==="replace-row"?
     target.sounds.find(sound=>sound.id===soundId):target.sounds[0];
    if(!row)return false;
    row.name=name;row.patch=clone(patch);
    if(referencePitch!==null)row.referencePitch=referencePitch;
    if(gain!==null)row.gain=gain;
    if(operation==="replace-pitched"){
     target.name=name;
     if(volume!==null)target.volume=volume;
    }
   }
   for(const asset of assets)if(!current.samples.some(item=>item.id===asset.id))
    current.samples.push(clone(asset));
   const problems=check();
   if(problems.length)throw Error(problems[0]);
   repair();history.push(before);if(history.length>100)history.shift();
   future=[];notify();return true;
  }catch(error){
   document=before;activeInstrumentId=beforeId;repair();throw error;
  }
 }
 function convertBeatToSong(){
  if(document.kind==="song"||preview)return false;
  const before=clone(document);document=createSong(before);
  const problems=check();
  if(problems.length){document=before;repair();throw Error(problems[0]);}
  history.push(before);if(history.length>100)history.shift();
  future=[];repair();notify();return true;
 }
 function changeSong(mutator){
  if(preview||document.kind!=="song")return false;
  const before=clone(document);
  let changed;
  try{changed=mutator(document);}
  catch(error){document=before;repair();throw error;}
  if(!changed)return false;
  const problems=check();
  if(problems.length){document=before;repair();throw Error(problems[0]);}
  history.push(before);if(history.length>100)history.shift();
  future=[];repair();notify();return true;
 }
 function setSongBpm(bpm){
  const value=Number(bpm);
  if(!Number.isInteger(value)||value<40||value>240)return false;
  return changeSong(song=>{
   if(song.bpm===value)return false;
   song.bpm=value;return true;
  });
 }
 function renameSong(name){
  if(typeof name!=="string"||!name.trim()||name.length>100)return false;
  return changeSong(song=>{
   if(song.title===name.trim())return false;
   song.title=name.trim();return true;
  });
 }
 function addSongBeat(){
  return changeSong(song=>{
   const next=create();next.bpm=song.bpm;
   const added=addBeat(song,next);
   activeBeatId=added.id;return true;
  });
 }
 function addTrack(kind="beat"){
  return changeSong(song=>{addSongTrack(song,kind);return true;});
 }
 function renameTrack(trackId,name){
  if(typeof name!=="string"||!name.trim()||name.length>100)return false;
  return changeSong(song=>{
   const track=song.tracks.find(item=>item.id===trackId);
   if(!track||track.name===name.trim())return false;
   track.name=name.trim();return true;
  });
 }
 function appendSongClip(trackId,beatId,startStep=0,lengthSteps=null){
  return changeSong(song=>{addBeatClip(song,trackId,beatId,startStep,lengthSteps);return true;});
 }
 function changeSongClip(clipId,changes){
  return changeSong(song=>{
   const track=song.tracks.find(item=>item.kind==="beat"&&item.clips.some(clip=>clip.id===clipId));
   if(!track)return false;
   const old=track.clips.find(clip=>clip.id===clipId);
   if(Object.entries(changes).every(([key,value])=>old[key]===value))return false;
   editBeatClip(song,clipId,changes);return true;
  });
 }
 function attachVocalRecording(recording,{startStep=0}={}){
  return changeSong(song=>{addVocalTake(song,recording,{startStep});return true;});
 }
 function removeSongClip(clipId){
  return changeSong(song=>{
   const track=song.tracks.find(item=>item.clips.some(clip=>clip.id===clipId));
   if(!track)return false;
   track.clips=track.clips.filter(clip=>clip.id!==clipId);return true;
  });
 }
 function addInstrument(){
  if(preview||beat().instruments.length>=12)return false;
  const before=clone(document),current=beat();
  current.instruments.push(makeInstrument(current.instruments.length+1,current.bars));
  activeInstrumentId=current.instruments.at(-1).id;repair();
  const problems=check();
  if(problems.length){document=before;repair();throw Error(problems[0]);}
  history.push(before);if(history.length>100)history.shift();
  future=[];notify();return true;
 }
 return {
  getDocument:()=>document,getBeat:beat,getInstrument:instrument,getChunk:chunk,
  getSelection:()=>({beatId:beat().id,instrumentId:instrument().id,chunkId:chunk().id}),
  selectBeat(value){
   if(preview||document.kind!=="song"||!document.beats.some(item=>item.id===value))return false;
   activeBeatId=value;activeInstrumentId=null;repair();return true;
  },
  selectInstrument(value){
   if(preview||!beat().instruments.some(item=>item.id===value))return false;
   activeInstrumentId=value;repair();return true;
  },
  selectChunk(value){
   if(preview||!instrument().chunks.some(item=>item.id===value))return false;
   chunks.set(instrument().id,value);return true;
  },
  beginPreview,applyPreview,finishPreview,dispatch,replace,addInstrument,setBpm,
  renameInstrument,changeInstrumentVolume,changeSoundGain,changeSoundPatch,selectCatalogSound,
  convertBeatToSong,changeSong,setSongBpm,renameSong,addSongBeat,addTrack,renameTrack,appendSongClip,changeSongClip,removeSongClip,
  attachVocalRecording,
  undo:()=>stepBack(history,future),redo:()=>stepBack(future,history),
  canUndo:()=>history.length>0,canRedo:()=>future.length>0
 };
}
