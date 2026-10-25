// pre-midi native score. This is the only file-format definition.
// Pre-midi remains the source of truth; game compatibility is frozen separately.
export const FORMAT = "pre-midi";
export const VERSION = 7;
import {placementFor,STEPS_PER_BAR} from "./arrangement.js";
import {MAX_SOUNDS,MAX_EVENTS,canConvertToRack,convertToRack} from "./soundModel.js";
import { makePatch, validatePatch } from "./synth.js";
import {validateBend} from "./expression.js";
import { validateSampleAsset, MAX_SCORE_BYTES } from "./sampler.js";
export const id = () => globalThis.crypto?.randomUUID?.() || ("id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
export const clone = x => JSON.parse(JSON.stringify(x));

export const makeChunk = (name = "Chunk 1") => ({id:id(),name,notes:[]});
export const makeSound = (name="Sound",patch=makePatch(),trigger="pitched") => ({
 id:id(),name,trigger,referencePitch:patch.zones?.[0]?.root??60,gain:1,patch
});
export function makeInstrument(n = 1, bars = 8, sound=makeSound()) {
 const chunk = makeChunk();
 return {
  id:id(), name:"Instrument "+n, volume:0.7,
  layout:sound.trigger==="hit"?"rack":"pitched", sounds:[sound],
  chunks:[chunk], timeline:Array.from({length:bars},(_,bar)=>bar===0?chunk.id:null),
  placements:Array.from({length:bars},()=>null)
 };
}
export function create() {
 const instrument=makeInstrument();
 instrument.name="Glass Keys";
 instrument.sounds[0]=makeSound("Glass Keys",makePatch("glass-keys"));
 instrument.chunks[0].name="Chunk 1";
 // A single empty editable slot is assigned so first notes play immediately.
 return {format:FORMAT,version:VERSION,id:id(),title:"Untitled composition",
  bpm:120,beatsPerBar:4,stepsPerBeat:4,bars:8,samples:[],instruments:[instrument]};
}
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const text=(x,max)=>typeof x==="string"&&!!x.trim()&&x.length<=max;
const within=(x,low,high)=>typeof x==="number"&&Number.isFinite(x)&&x>=low&&x<=high;
export function validate(doc) {
 const errors=[];
 if(!object(doc)||doc.format!==FORMAT||doc.version!==VERSION)
  return ["Unsupported .premidi file. The current format is pre-midi v7."];
 if(!text(doc.id,128)||!text(doc.title,100))errors.push("Composition needs an ID and title.");
 if(!Number.isInteger(doc.bpm)||!within(doc.bpm,40,240))errors.push("BPM must be 40–240.");
 if(doc.beatsPerBar!==4||doc.stepsPerBeat!==4)errors.push("This version uses 4/4 with 16 steps per bar.");
 if(!Number.isInteger(doc.bars)||!within(doc.bars,1,16))errors.push("Timeline must have 1–16 bars.");
 if(!Array.isArray(doc.samples)||doc.samples.length>160)return [...errors,"Invalid sample asset list."];
 const sampleIds=new Set();
 for(const asset of doc.samples){
  const error=validateSampleAsset(asset);
  if(error)errors.push(error);
  if(sampleIds.has(asset?.id))errors.push("Duplicate sample ID.");
  sampleIds.add(asset?.id);
 }
 if(!Array.isArray(doc.instruments)||doc.instruments.length<1||doc.instruments.length>12)
  return [...errors,"The composition needs 1–12 instruments."];
 const ids=new Set();
 for(const instrument of doc.instruments) {
  if(!object(instrument)||!text(instrument.id,128)||!text(instrument.name,60)){
   errors.push("Invalid instrument identity.");continue;
  }
  if(ids.has(instrument.id))errors.push("Instrument IDs must be distinct.");
  ids.add(instrument.id);
  if(!within(instrument.volume,0,1)) errors.push("Invalid instrument volume.");
  if(!["pitched","rack"].includes(instrument.layout)||instrument.patch!==undefined)
   errors.push("Invalid instrument layout.");
  if(!Array.isArray(instrument.sounds)||!instrument.sounds.length||instrument.sounds.length>MAX_SOUNDS||
    (instrument.layout==="pitched"&&instrument.sounds.length!==1)){
   errors.push("Each instrument needs 1–64 sounds; piano rolls use one sound.");continue;
  }
  const soundIds=new Set();
  for(const sound of instrument.sounds){
   if(!object(sound)||!text(sound.id,128)||!text(sound.name,60)||soundIds.has(sound.id)){
    errors.push("Invalid or duplicate sound identity.");continue;
   }
   soundIds.add(sound.id);
   if(sound.trigger!==(instrument.layout==="rack"?"hit":"pitched")||!within(sound.gain,0,1)||
     !Number.isInteger(sound.referencePitch)||!within(sound.referencePitch,0,127))errors.push("Invalid sound trigger, reference pitch, or level.");
   errors.push(...validatePatch(sound.patch).map(error=>sound.name+": "+error));
   if(sound.patch?.type==="sample"&&Array.isArray(sound.patch.zones))
    for(const zone of sound.patch.zones)if(!sampleIds.has(zone.assetId))errors.push("Sound references missing audio.");
  }
  if(!Array.isArray(instrument.chunks)||!instrument.chunks.length||instrument.chunks.length>32){
   errors.push("Each instrument must have 1–32 chunks.");continue;
  }
  const chunks=new Set();
  for(const chunk of instrument.chunks) {
   if(!object(chunk)||!text(chunk.id,128)||!text(chunk.name,60)||
      !Array.isArray(chunk.notes)||chunk.notes.length>(instrument.layout==="rack"?MAX_EVENTS:256)){
    errors.push("Invalid chunk.");continue;
   }
   if(chunks.has(chunk.id))errors.push("Chunk IDs must be distinct.");
   chunks.add(chunk.id);
   const notes=new Set(),steps=new Set();
   for(const note of chunk.notes){
    if(!object(note)||!text(note.id,128)||notes.has(note.id)||
       (instrument.layout==="rack"?(!soundIds.has(note.soundId)||note.pitch!==undefined):
        (!Number.isInteger(note.pitch)||!within(note.pitch,36,96)||note.soundId!==undefined))||
       !Number.isInteger(note.start)||!within(note.start,0,15)||
       !Number.isInteger(note.duration)||!within(note.duration,1,16-note.start)||
       !within(note.velocity,0,1)) errors.push("Invalid chunk note.");
    else notes.add(note.id);
    if(instrument.layout==="rack"&&object(note)){
     const key=note.soundId+":"+note.start;
     if(steps.has(key))errors.push("Duplicate hit on the same sound and step.");
     steps.add(key);
    }
    errors.push(...validateBend(note?.bend));
   }
  }
  if(!Array.isArray(instrument.timeline)||instrument.timeline.length!==doc.bars||
     instrument.timeline.some(value=>value!==null&&!chunks.has(value)))
   errors.push("Instrument timeline contains a missing chunk.");
  if(instrument.placements!==undefined){
   if(!Array.isArray(instrument.placements)||instrument.placements.length!==doc.bars)
    errors.push("Phrase placement list must match song bars.");
   else for(let bar=0;bar<doc.bars;bar++){
    const item=instrument.placements[bar];
    if(item===null)continue;
    if(!object(item)||instrument.timeline[bar]===null||
      !Number.isInteger(item.offset)||!within(item.offset,0,15)||
      !Number.isInteger(item.every)||!within(item.every,1,64)||
      !Number.isInteger(item.repeats)||!within(item.repeats,1,32))
     errors.push("Invalid offset or polymeter repeat at bar "+(bar+1)+".");
   }
  }
 }
 return errors.slice(0,20);
}
// New timing fields require a version bump: a v6 player must never silently
// reinterpret a v7 offset as a regular bar-aligned chunk.
export function migrate(input){
 if(input?.format!==FORMAT||![5,6,7].includes(input.version))return input;
 if(input.version===7)return input;
 if(!Array.isArray(input.instruments))throw Error("Invalid older instrument list.");
 const doc=clone(input),wasV5=doc.version===5;
 if(wasV5){
  for(const inst of doc.instruments||[]){
   if(!object(inst))continue;
   const patch=inst.patch;
   const sound={id:"sound-1",name:inst.name,trigger:"pitched",referencePitch:patch?.zones?.[0]?.root??60,gain:1,patch};
   inst.layout="pitched";inst.sounds=[sound];delete inst.patch;
  }
 }
 doc.version=VERSION;
 for(const inst of doc.instruments){
  inst.placements=Array.from({length:doc.bars},()=>null);
 }
 const issues=validate(doc);
 if(issues.length)throw Error(issues.join("\n"));
 if(wasV5)for(const inst of doc.instruments){
  const patch=inst.sounds[0].patch;
  if(patch.type==="sample"&&!patch.followPitch&&canConvertToRack(inst))convertToRack(inst);
 }
 return doc;
}
export function parse(raw) {
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>MAX_SCORE_BYTES)
  throw Error("Composition exceeds the 1 MB limit.");
 const doc=migrate(JSON.parse(raw)),issues=validate(doc);
 if(issues.length)throw Error(issues.join("\n"));
 return doc;
}
export const filename=(doc,extension)=>(doc.title.trim().replace(/[^a-z0-9 _-]/gi,"")
 .replace(/\s+/g,"-").slice(0,64)||"composition")+extension;
