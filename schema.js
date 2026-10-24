export const FORMAT = "pre-midi";
export const VERSION = 1;
export const WAVES = ["sine","triangle","square","sawtooth"];
export const id = () => globalThis.crypto?.randomUUID?.() || ("id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const pattern = (name = "Pattern 1") => ({id:id(),name,notes:[]});
export function track(n=1,bars=8) {
 const p=pattern();
 return {id:id(),name:"Track "+n,waveform:WAVES[(n-1)%4],volume:0.7,attack:0.01,release:0.15,patterns:[p],arrangement:Array(bars).fill(p.id)};
}
export function create() {
 const t=track();t.name="Lead";t.patterns[0].notes=[60,64,67,72].map((pitch,i)=>({id:id(),pitch,start:i*4,duration:3,velocity:0.8}));
 return {format:FORMAT,version:VERSION,id:id(),title:"Untitled composition",bpm:120,beatsPerBar:4,stepsPerBeat:4,bars:8,tracks:[t]};
}
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const str=(x,n)=>typeof x==="string"&&!!x.trim()&&x.length<=n;
const range=(x,a,b)=>typeof x==="number"&&Number.isFinite(x)&&x>=a&&x<=b;
export function validate(x) {
 const errors=[];
 if (!obj(x)||x.format!==FORMAT||x.version!==VERSION) return ["Unsupported .premidi version (expected pre-midi v1)."];
 if (!str(x.id,128)||!str(x.title,100)) errors.push("Invalid composition name or identity.");
 if (!Number.isInteger(x.bpm)||!range(x.bpm,40,240)) errors.push("Tempo must be 40–240 BPM.");
 if (x.beatsPerBar!==4||x.stepsPerBeat!==4) errors.push("Version 1 requires 4/4 and 16 steps per bar.");
 if (!Number.isInteger(x.bars)||!range(x.bars,1,16)) errors.push("Bars must be 1–16.");
 if (!Array.isArray(x.tracks)||x.tracks.length<1||x.tracks.length>12) return [...errors,"Expected 1–12 tracks."];
 const trackIds=new Set();
 for(const t of x.tracks) {
  if(!obj(t)||!str(t.id,128)||!str(t.name,60)){errors.push("Invalid track identity.");continue;}
  if(trackIds.has(t.id)) errors.push("Duplicate track ID.");trackIds.add(t.id);
  if(!WAVES.includes(t.waveform)) errors.push("Unsupported waveform.");
  if(!range(t.volume,0,1)||!range(t.attack,0,1)||!range(t.release,0,1)) errors.push("Invalid instrument parameter.");
  if(!Array.isArray(t.patterns)||!t.patterns.length||t.patterns.length>32){errors.push("Expected 1–32 patterns.");continue;}
  const patternIds=new Set();
  for(const p of t.patterns) {
   if(!obj(p)||!str(p.id,128)||!str(p.name,60)||!Array.isArray(p.notes)||p.notes.length>256){errors.push("Invalid pattern.");continue;}
   if(patternIds.has(p.id))errors.push("Duplicate pattern ID.");patternIds.add(p.id);
   const noteIds=new Set();
   for(const n of p.notes) {
    if(!obj(n)||!str(n.id,128)||noteIds.has(n.id)||!Number.isInteger(n.pitch)||!range(n.pitch,36,96)||!Number.isInteger(n.start)||!range(n.start,0,15)||!Number.isInteger(n.duration)||!range(n.duration,1,16-n.start)||!range(n.velocity,0,1))errors.push("Invalid note.");
    else noteIds.add(n.id);
   }
  }
  if(!Array.isArray(t.arrangement)||t.arrangement.length!==x.bars||t.arrangement.some(p=>p!==null&&!patternIds.has(p)))errors.push("Invalid pattern arrangement.");
 }
 return errors.slice(0,20);
}
export function parse(raw) {
 if(typeof raw!=="string"||raw.length>1000000)throw Error("Composition exceeds the 1 MB limit.");
 const doc=JSON.parse(raw),errors=validate(doc);if(errors.length)throw Error(errors.join("\n"));return doc;
}
export const filename=(x,ext)=>(x.title.trim().replace(/[^a-z0-9 _-]/gi,"").replace(/\s+/g,"-").slice(0,64)||"composition")+ext;
