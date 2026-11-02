// DOM-free Beat/Song editing session. One command and history contract for every host.
import {clone,create,makeInstrument,validate,upgradeBeatFeatures} from "./schema.js";
import {validateSong,upgradeSongFeatures} from "./songModel.js";
import {applyNoteCommand} from "./studioCommands.js";

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
  selectInstrument(value){
   if(preview||!beat().instruments.some(item=>item.id===value))return false;
   activeInstrumentId=value;repair();return true;
  },
  selectChunk(value){
   if(preview||!instrument().chunks.some(item=>item.id===value))return false;
   chunks.set(instrument().id,value);return true;
  },
  beginPreview,applyPreview,finishPreview,dispatch,replace,addInstrument,
  undo:()=>stepBack(history,future),redo:()=>stepBack(future,history),
  canUndo:()=>history.length>0,canRedo:()=>future.length>0
 };
}
