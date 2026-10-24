import {create,track,pattern,id,clone,parse,validate,filename} from "./schema.js";
import {play,audition,wav} from "./audio.js";
const $=s=>document.getElementById(s),cache="premidi-v1-draft";
const cached=(()=>{try{return parse(localStorage.getItem(cache)||"");}catch{return null;}})();
let doc=cached||create(),selected=doc.tracks[0].id,chosen=new Map(),undoStack=[],redoStack=[],player=null,playbar=-1;
const current=()=>doc.tracks.find(t=>t.id===selected)||doc.tracks[0];
const currentPattern=t=>t.patterns.find(p=>p.id===chosen.get(t.id))||t.patterns[0];
function status(message,bad=false){$("status").textContent=message;$("status").className=bad?"error":"ok";}
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(text,click,cls){const b=node("button",text,cls);b.type="button";b.addEventListener("click",click);return b;}
function stop(){if(player){player.stop();player=null;}playbar=-1;$("play").textContent="▶ Play";$("position").textContent="1.1";}
function store(){try{localStorage.setItem(cache,JSON.stringify(doc));status("Draft saved in this browser. Export .premidi to keep a portable copy.");}catch{status("Browser storage unavailable. Export .premidi to save.",true);}}
function mutate(fn){const previous=clone(doc);fn();const errors=validate(doc);if(errors.length){doc=previous;status(errors[0],true);return;}undoStack.push(previous);if(undoStack.length>100)undoStack.shift();redoStack=[];stop();store();render();}
function swap(next){stop();doc=next;selected=doc.tracks[0].id;chosen=new Map();undoStack=[];redoStack=[];store();render();}
function undo(){if(!undoStack.length)return;redoStack.push(clone(doc));doc=undoStack.pop();stop();store();render();}
function redo(){if(!redoStack.length)return;undoStack.push(clone(doc));doc=redoStack.pop();stop();store();render();}
function download(data,name){const url=URL.createObjectURL(data),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function tracks(){
 const root=$("track-list");root.replaceChildren();
 for(const t of doc.tracks){const b=button(t.name,()=>{selected=t.id;render();},"track"+(selected===t.id?" active":""));b.append(node("small",t.waveform+" · "+t.patterns.length+" patterns"));root.append(b);}
 $("add-track").disabled=doc.tracks.length>=12;
}
function arrangement(){
 const root=$("arrangement");root.replaceChildren();root.style.setProperty("--bars",doc.bars);
 const h=node("div",undefined,"arrangement-head");h.append(node("span","TRACK"));for(let bar=0;bar<doc.bars;bar++)h.append(node("span",String(bar+1)));root.append(h);
 for(const t of doc.tracks){const r=node("div",undefined,"arrangement-row");r.append(node("span",t.name,"label"));
  for(let index=0;index<doc.bars;index++){const p=t.patterns.find(p=>p.id===t.arrangement[index]);
   const b=button(p?p.name:"+",()=>mutate(()=>{const next=currentPattern(t).id;t.arrangement[index]=t.arrangement[index]===next?null:next;}),"clip"+(p?"":" empty")+(playbar===index?" playing":""));
   b.title="Bar "+(index+1)+" · click to assign selected pattern or clear";
   b.addEventListener("contextmenu",e=>{e.preventDefault();mutate(()=>t.arrangement[index]=null);});r.append(b);
  }root.append(r);
 }
}
const names=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const pitchName=p=>names[p%12]+(Math.floor(p/12)-1);
function piano(){
 const root=$("piano"),t=current(),p=currentPattern(t);root.replaceChildren();
 for(let pitch=83;pitch>=48;pitch--){const row=node("div",undefined,"piano-row"+([1,3,6,8,10].includes(pitch%12)?" sharp":""));row.append(node("span",pitchName(pitch),"note-name"));
  for(let step=0;step<16;step++){const n=p.notes.find(n=>n.pitch===pitch&&step>=n.start&&step<n.start+n.duration);
   const b=button("",()=>{
    mutate(()=>{const old=p.notes.find(n=>n.pitch===pitch&&step>=n.start&&step<n.start+n.duration);if(old)p.notes=p.notes.filter(x=>x.id!==old.id);else p.notes.push({id:id(),pitch,start:step,duration:Math.min(Number($("length").value),16-step),velocity:.8});});
    if(!n)void audition(t,pitch).catch(()=>{});
   },"note"+(step%4===0?" beat":"")+(n?(n.start===step?" filled":" tail"):""));
   b.title=pitchName(pitch)+" step "+(step+1)+(n?" remove":" add");b.setAttribute("aria-label",b.title);row.append(b);
  }root.append(row);
 }
}
function inspector(){
 const t=current();$("track-name").value=t.name;$("waveform").value=t.waveform;
 for(const [name,factor,suffix] of [["volume",100,"%"],["attack",1000," ms"],["release",1000," ms"]]){$(name).value=String(Math.round(t[name]*factor));$(name+"-value").textContent=Math.round(t[name]*factor)+suffix;}
 $("remove-track").disabled=doc.tracks.length<=1;
}
function render(){
 $("title").value=doc.title;$("bpm").value=String(doc.bpm);$("bars").value=String(doc.bars);
 tracks();const t=current(),select=$("pattern");select.replaceChildren();
 for(const p of t.patterns){const option=node("option",p.name);option.value=p.id;select.append(option);}
 select.value=currentPattern(t).id;chosen.set(t.id,select.value);
 $("add-pattern").disabled=t.patterns.length>=32;$("delete-pattern").disabled=t.patterns.length<=1;
 arrangement();piano();inspector();$("undo").disabled=undoStack.length===0;$("redo").disabled=redoStack.length===0;
}
$("new").addEventListener("click",()=>{if(confirm("Create a new composition? Export your .premidi first to keep your existing work."))swap(create());});
$("import").addEventListener("click",()=>$("file").click());
$("file").addEventListener("change",async e=>{
 const f=e.target.files?.[0];if(!f)return;
 try{if(f.size>1000000)throw Error("File exceeds 1 MB.");const next=parse(await f.text());if(confirm("Open "+next.title+" and replace the current browser draft?")){swap(next);status("Imported "+f.name+".");}}catch(error){status("Import failed: "+error.message,true);}finally{$("file").value="";}
});
$("export").addEventListener("click",()=>{const errors=validate(doc);if(errors.length)return status(errors[0],true);download(new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}),filename(doc,".premidi"));status("Downloaded editable .premidi composition.");});
$("wav").addEventListener("click",async()=>{const btn=$("wav");btn.disabled=true;status("Rendering audio offline...");try{download(await wav(doc),filename(doc,".wav"));status("Downloaded stereo WAV audio.");}catch(e){status("Audio export failed: "+e.message,true);}finally{btn.disabled=false;}});
$("play").addEventListener("click",async()=>{
 if(player){stop();return;}
 try{player=await play(clone(doc),{loop:$("loop").checked,onPosition:(bar,step)=>{$("position").textContent=(bar+1)+"."+(Math.floor(step/4)+1);if(playbar!==bar){playbar=bar;arrangement();}},onStop:()=>{player=null;playbar=-1;$("play").textContent="▶ Play";arrangement();}});$("play").textContent="Ⅱ Pause";}catch(error){status("Playback unavailable: "+error.message,true);}
});
$("stop").addEventListener("click",stop);
$("title").addEventListener("change",e=>mutate(()=>doc.title=e.target.value.trim()||"Untitled composition"));
$("bpm").addEventListener("change",e=>mutate(()=>doc.bpm=Math.round(Number(e.target.value))));
$("bars").addEventListener("change",e=>mutate(()=>{const n=Number(e.target.value);doc.bars=n;for(const t of doc.tracks){while(t.arrangement.length<n)t.arrangement.push(t.patterns[0].id);t.arrangement.length=n;}}));
$("add-track").addEventListener("click",()=>mutate(()=>{const t=track(doc.tracks.length+1,doc.bars);doc.tracks.push(t);selected=t.id;}));
$("remove-track").addEventListener("click",()=>{const t=current();if(confirm("Remove "+t.name+" and its patterns?"))mutate(()=>{doc.tracks=doc.tracks.filter(x=>x.id!==t.id);selected=doc.tracks[0].id;});});
$("pattern").addEventListener("change",e=>{chosen.set(current().id,e.target.value);piano();});
$("add-pattern").addEventListener("click",()=>mutate(()=>{const t=current(),p=pattern("Pattern "+(t.patterns.length+1));t.patterns.push(p);chosen.set(t.id,p.id);}));
$("copy-pattern").addEventListener("click",()=>mutate(()=>{const t=current(),p=clone(currentPattern(t));p.id=id();p.name=(p.name+" copy").slice(0,60);p.notes.forEach(n=>n.id=id());t.patterns.push(p);chosen.set(t.id,p.id);}));
$("delete-pattern").addEventListener("click",()=>{const t=current(),p=currentPattern(t);if(t.patterns.length>1&&confirm("Delete "+p.name+"?"))mutate(()=>{t.patterns=t.patterns.filter(x=>x.id!==p.id);t.arrangement=t.arrangement.map(x=>x===p.id?null:x);chosen.set(t.id,t.patterns[0].id);});});
$("track-name").addEventListener("change",e=>mutate(()=>current().name=e.target.value.trim()||"Track"));
$("waveform").addEventListener("change",e=>mutate(()=>current().waveform=e.target.value));
for(const [name,factor] of [["volume",100],["attack",1000],["release",1000]]){
 $(name).addEventListener("change",e=>mutate(()=>current()[name]=Number(e.target.value)/factor));
 $(name).addEventListener("input",e=>$(name+"-value").textContent=e.target.value+(name==="volume"?"%":" ms"));
}
$("undo").addEventListener("click",undo);$("redo").addEventListener("click",redo);
document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo();}else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo();}else if(e.code==="Space"&&!e.repeat&&!["INPUT","BUTTON","SELECT","TEXTAREA"].includes(document.activeElement?.tagName)){e.preventDefault();$("play").click();}});
render();if(cached)status("Restored local browser draft. Export a .premidi file for portability.");
