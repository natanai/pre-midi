// Deterministic, source-backed phone feature index. docs/phone-studio.md is canonical.
import {readFile,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
const SOURCE_FILES=[
 "index.html",
 "soundInspector.js",
 "editorWorkspace.js",
 "studio.js",
 "songUI.js",
 "timelinePointer.js",
 "freeformUI.js",
 "vocalEditor.js",
 "audioControlUI.js",
 "audioWaveform.js",
 "instrumentUI.js",
 "samplerUI.js",
 "automationUI.js",
 "modulationUI.js",
 "expressionUI.js",
 "microphoneUI.js",
 "keyboardPiano.js",
 "pianoNoteGesture.js",
 "editorInstrumentCard.js",
 "editorPianoRoll.js",
 "dial.js",
 "desktopAudioUI.js",
 "desktopUI.js",
 "dragNumber.js",
 "soundIllustrations.js",
 "soundScope.js"
];
function buildInventory(sources){
 const actions=[],seen=new Set();
 const norm=x=>String(x||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"unnamed";
 const choose=(path,id,event,kind)=>{
  const k=(path+" "+id).toLowerCase();
  if(path==="desktopUI.js"||path==="desktopAudioUI.js")return "settings/host-equivalent";
  if(path==="keyboardPiano.js")return "notes/external-keyboard";
  if(path==="editorInstrumentCard.js")return "notes/instrument-sheet";
  if(path==="songUI.js"||path==="timelinePointer.js"||path==="freeformUI.js"||path==="vocalEditor.js"||path==="audioWaveform.js"||/\b(song|voice|vocal|clip|track)\b/.test(k))return "song";
  if(path==="microphoneUI.js"||/\b(mic|record|sample|sampling)\b/.test(k))return "sound/recording";
  if(["instrumentUI.js","samplerUI.js","audioControlUI.js","modulationUI.js","automationUI.js","soundIllustrations.js","soundScope.js","dial.js"].includes(path))return "sound";
  if(/\b(export|import|file|new|examples|save-preset|library|close-library|close-examples)\b/.test(k))return "project";
  if(/\b(sound|synth|preset|change-sound|instrument-volume|convert|rack|remove-instrument)\b/.test(k))return "sound";
  if(/\b(instrument|add-instrument|library-sounds|library-filters)\b/.test(k))return "notes/instrument-sheet";
  if(/\b(play|loop|bpm|bars|position|transport|native-pause)\b/.test(k))return "transport";
  return "notes";
 };
 const push=(action)=>{
  if(seen.has(action.id))throw Error("Duplicate capability identity "+action.id);
  seen.add(action.id);
  actions.push({...action,phoneRoute:choose(action.source,action.anchor,action.event,action.kind),
   phoneStatus:"todo",proof:"not-qualified"});
 };
 // The Sound controls have moved from static index HTML into one shared
 // template, mounted by Beat and freeform. They retain their stable IDs and
 // must not silently disappear from the phone capability inventory.
 const chrome=sources["soundInspector.js"].match(/const SOUND_INSPECTOR_CHROME=String\.raw`([\s\S]*?)`;/)?.[1];
 if(!chrome)throw Error("Canonical Sound Inspector template is missing.");
 const workspace=sources["editorWorkspace.js"].match(/const EDITOR_WORKSPACE_CHROME=`([\s\S]*?)`;/)?.[1];
 if(!workspace)throw Error("Canonical editor workspace is missing.");
 const tag=/<(button|input|select|textarea|dialog|details|summary)\b([^>]*?)>/gi;
 for(const [path,html] of [["index.html",sources["index.html"]],["soundInspector.js",chrome],["editorWorkspace.js",workspace]]){
  for(const m of html.matchAll(tag)){
   const id=m[2].match(/\bid\s*=\s*["']([^"']+)["']/)?.[1];
   if(!id)continue;
   const type=m[2].match(/\btype\s*=\s*["']([^"']+)["']/)?.[1]||"";
   const kind=m[1].toLowerCase();
   push({id:"html:"+id,source:path,anchor:id,kind,event:kind==="dialog"?"open/close":type||"activate",desktopRoute:path+"#"+id,
    contract:kind==="dialog"?"dialog accessibility and dismiss":"user control; canonical project/UI state"});
  }
 }
 for(const path of SOURCE_FILES.filter(p=>p!=="index.html"&&p!=="soundInspector.js"&&p!=="editorWorkspace.js")){
  const src=sources[path],counts=new Map();
  const eventPattern=/\.addEventListener\s*\(\s*["']([a-zA-Z-]+)["']/g;
  for(const m of src.matchAll(eventPattern)){
   const before=src.slice(Math.max(0,m.index-120),m.index);
   const receiver=before.match(/(\$\(["'][^"']+["']\)|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/)?.[1]||"dynamic";
   const event=m[1],anchor=receiver+"."+event,key=norm(anchor);
   const serial=(counts.get("event:"+key)||0)+1;counts.set("event:"+key,serial);
   push({id:"event:"+path.replace(".js","")+":"+key+":"+serial,source:path,anchor:receiver,kind:"listener",event,
    desktopRoute:path+" "+anchor,contract:"same semantic action or documented host-equivalent"});
  }
  const assignments=/\b([a-zA-Z_$][\w$]*)\s*\.\s*(onclick|onchange|oninput|onpointerdown|onkeydown|onkeyup)\s*=/g;
  for(const m of src.matchAll(assignments)){
   const anchor=m[1]+"."+m[2],key=norm(anchor);
   const serial=(counts.get("assign:"+key)||0)+1;counts.set("assign:"+key,serial);
   push({id:"handler:"+path.replace(".js","")+":"+key+":"+serial,source:path,anchor:m[1],kind:"assigned-handler",event:m[2].slice(2),
    desktopRoute:path+" "+anchor,contract:"same semantic action or documented host-equivalent"});
  }
  if(path==="instrumentUI.js"){
   const param=/\bpath:\s*\[([^\]]+)\]\s*,\s*label:\s*["']([^"']+)["']/g;
   for(const m of src.matchAll(param)){
    const key=m[1].replace(/["'\s]+/g,"");
    push({id:"synth:"+key,source:path,anchor:key,kind:"parameter",event:"set",desktopRoute:path+" "+m[2],
     contract:"canonical patch path "+key});
   }
   // Harmonics are generated in a loop rather than one declaration per dial.
   push({id:"synth:oscillators.harmonics[1..32]",source:path,anchor:"oscillators harmonics",kind:"parameter-family",event:"set",
    desktopRoute:path+" harmonicControls",contract:"each oscillator's 32 independently editable harmonic partials"});
  }
  if(path==="samplerUI.js"){
   // Existing sample IDs now derive from shared Beat / vocal UI definitions.
   const definitions=sources["audioControlUI.js"];
   for(const matcher of [
    /export const AUDIO_MOVEMENT_CONTROLS=Object\.freeze\(\[([\s\S]*?)\]\.map\(Object\.freeze\)\)/,
    /export const AUDIO_COMMON_CONTROLS=Object\.freeze\(\[([\s\S]*?)\]\.map\(Object\.freeze\)\)/,
    /export const AUDIO_SAMPLE_EXTRA_CONTROLS=Object\.freeze\(\[([\s\S]*?)\]\.map\(Object\.freeze\)\)/
   ]){
    const body=definitions.match(matcher)?.[1]||"";
    for(const m of body.matchAll(/\[\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g)){
     push({id:"sample:"+m[1],source:path,anchor:m[1],kind:"parameter",event:"set",desktopRoute:path+" "+m[2],
      contract:"canonical sampler parameter "+m[1]});
    }
   }
   for(const m of src.matchAll(/addToggle\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g)){
    push({id:"sample:"+m[2],source:path,anchor:m[2],kind:"parameter",event:"toggle",desktopRoute:path+" "+m[1],
     contract:"canonical sampler boolean "+m[2]});
   }
   push({id:"sample:zones[].root",source:path,anchor:"zones[].root",kind:"parameter-family",event:"set",desktopRoute:path+" mapping",
    contract:"edit every recorded pitch zone, including overflow mapping"});
  }
 }
 return {format:"pre-midi-phone-capabilities",version:1,
  notice:"Generated source-index; phoneRoute is an intended UI location, never proof of implementation. Todo is explicitly unimplemented. This index is evidence for docs/phone-studio.md, not an independent roadmap.",
  sourceFiles:SOURCE_FILES,actions:actions.sort((a,b)=>a.id.localeCompare(b.id))};
}
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const sources={};
for(const path of SOURCE_FILES)sources[path]=(await readFile(resolve(root,path),"utf8")).replace(/\r\n?/g,"\n");
const data=buildInventory(sources);
const output=JSON.stringify(data,null,2)+"\n";
const indexPath=resolve(root,"docs/phone-capabilities.json");
if(process.argv.includes("--write")){await writeFile(indexPath,output);console.log("Updated",data.actions.length,"capabilities");}
else if(process.argv.includes("--check")){
 const saved=(await readFile(indexPath,"utf8").catch(()=>null))?.replace(/\r\n?/g,"\n");
 if(saved!==output){console.error("Phone action inventory out of date: run node scripts/phone-capabilities.mjs --write and review every new phone mapping in docs/phone-capabilities.json");process.exitCode=1;}
 else if(data.actions.length<140){console.error("Phone inventory unexpectedly shrank");process.exitCode=1;}
 else console.log("Phone action inventory verified:",data.actions.length,"entries; every phone item remains explicitly unqualified until tested");
}else console.log(JSON.stringify({total:data.actions.length,byRoute:Object.fromEntries([...new Set(data.actions.map(a=>a.phoneRoute))].sort().map(k=>[k,data.actions.filter(a=>a.phoneRoute===k).length]))},null,2));
