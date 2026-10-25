// pre-midi native score. This is the only file-format definition.
// Pre-midi remains the source of truth; game compatibility is frozen separately.
export const FORMAT = "pre-midi";
export const VERSION = 4;
import { makePatch, validatePatch } from "./synth.js";
import {validateBend} from "./expression.js";
import { validateSampleAsset, MAX_SCORE_BYTES } from "./sampler.js";
export const id = () => globalThis.crypto?.randomUUID?.() || ("id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
export const clone = x => JSON.parse(JSON.stringify(x));

export const makeChunk = (name = "Chunk 1") => ({id:id(),name,notes:[]});
export function makeInstrument(n = 1, bars = 8) {
 const chunk = makeChunk();
 return {
  id:id(), name:"Instrument "+n, volume:0.7,
  patch:makePatch(),
  chunks:[chunk], timeline:Array.from({length:bars},(_,bar)=>bar<4?chunk.id:null)
 };
}
export function create() {
 const instrument=makeInstrument();
 instrument.name="Glass Keys";
 instrument.patch=makePatch("glass-keys");
 instrument.chunks[0].name="Opening";
 instrument.chunks[0].notes=[60,64,67,72].map((pitch,i)=>({
  id:id(),pitch,start:i*4,duration:3,velocity:0.8
 }));
 return {format:FORMAT,version:VERSION,id:id(),title:"Untitled composition",
  bpm:120,beatsPerBar:4,stepsPerBeat:4,bars:8,samples:[],instruments:[instrument]};
}
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const text=(x,max)=>typeof x==="string"&&!!x.trim()&&x.length<=max;
const within=(x,low,high)=>typeof x==="number"&&Number.isFinite(x)&&x>=low&&x<=high;
export function validate(doc) {
 const errors=[];
 if(!object(doc)||doc.format!==FORMAT||doc.version!==VERSION)
  return ["Unsupported .premidi file. The current format is pre-midi v4."];
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
  errors.push(...validatePatch(instrument.patch).map(error => instrument.name + ": " + error));
  if(instrument.patch?.type==="sample" && Array.isArray(instrument.patch.zones))
   for(const zone of instrument.patch.zones)if(!sampleIds.has(zone.assetId))errors.push("Sample instrument references missing audio.");
  if(!Array.isArray(instrument.chunks)||!instrument.chunks.length||instrument.chunks.length>32){
   errors.push("Each instrument must have 1–32 chunks.");continue;
  }
  const chunks=new Set();
  for(const chunk of instrument.chunks) {
   if(!object(chunk)||!text(chunk.id,128)||!text(chunk.name,60)||
      !Array.isArray(chunk.notes)||chunk.notes.length>256){
    errors.push("Invalid chunk.");continue;
   }
   if(chunks.has(chunk.id))errors.push("Chunk IDs must be distinct.");
   chunks.add(chunk.id);
   const notes=new Set();
   for(const note of chunk.notes){
    if(!object(note)||!text(note.id,128)||notes.has(note.id)||
       !Number.isInteger(note.pitch)||!within(note.pitch,36,96)||
       !Number.isInteger(note.start)||!within(note.start,0,15)||
       !Number.isInteger(note.duration)||!within(note.duration,1,16-note.start)||
       !within(note.velocity,0,1)) errors.push("Invalid chunk note.");
    else notes.add(note.id);
    errors.push(...validateBend(note?.bend));
   }
  }
  if(!Array.isArray(instrument.timeline)||instrument.timeline.length!==doc.bars||
     instrument.timeline.some(value=>value!==null&&!chunks.has(value)))
   errors.push("Instrument timeline contains a missing chunk.");
 }
 return errors.slice(0,20);
}
export function parse(raw) {
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>MAX_SCORE_BYTES)
  throw Error("Composition exceeds the 15 MB limit.");
 const doc=JSON.parse(raw),issues=validate(doc);
 if(issues.length)throw Error(issues.join("\n"));
 return doc;
}
export const filename=(doc,extension)=>(doc.title.trim().replace(/[^a-z0-9 _-]/gi,"")
 .replace(/\s+/g,"-").slice(0,64)||"composition")+extension;
