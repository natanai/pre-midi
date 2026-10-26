// Song arrangement UI. Beat editor remains the existing studio underneath.
import {songDurationSteps} from "./songModel.js";
import {id} from "./schema.js";
// All Song lanes and the bar ruler use the same scale; only the viewport
// determines how much empty timeline is visible. There is no fixed song end.
const BAR_STEPS=16,BAR_PX=54,LABEL_PX=105,PAGE_BARS=16;
const integer=(value,fallback)=>Number.isFinite(value)?Math.max(0,Math.round(value)):fallback;
export function installSongUI({root,getSong,getSelectedBeatId,onSelectBeat,onChange,onAddBeat,onImportBeat}){
 const $=id=>root.querySelector("#"+id);
 const viewport=$("song-scroll"),tracks=$("song-tracks"),ruler=$("song-ruler");
 let selectedClipId=null,dragging=false,ignoreClick=false,playPosition=-1;
 let timelinePages=1;
 const beatMenu=$("song-beat-choice"),beatMenuToggle=$("song-add-beat");
 function closeBeatMenu(){
  beatMenu.hidden=true;
  beatMenuToggle.setAttribute("aria-expanded","false");
 }
 function toggleBeatMenu(){
  const opening=beatMenu.hidden;
  beatMenu.hidden=!opening;
  beatMenuToggle.setAttribute("aria-expanded",String(opening));
  if(opening)$("song-new-beat").focus();
 }
 function apply(action){
  onChange(action);
  render();
 }
 const localBeat=id=>getSong()?.beats.find(beat=>beat.id===id);
 const selected=()=>getSong()?.tracks.flatMap(t=>t.clips.map(c=>({track:t,clip:c}))).find(x=>x.clip.id===selectedClipId);
 function select(clipId){
  selectedClipId=clipId;
  const found=selected();
  if(found?.clip.beatId)onSelectBeat(found.clip.beatId);
  render();
 }
 function clipButton(track,clip){
  const beat=localBeat(clip.beatId);
  const block=document.createElement("button");
  block.type="button";block.className="song-beat-clip"+(clip.id===selectedClipId?" selected":"");
  block.style.left=(clip.startStep/BAR_STEPS*BAR_PX)+"px";
  block.style.width=(clip.lengthSteps/BAR_STEPS*BAR_PX)+"px";
  block.title=(beat?.title||"Missing Beat")+" · bar "+(Math.floor(clip.startStep/BAR_STEPS)+1);
  block.setAttribute("aria-label",block.title+"; left/right move, up/down change Track, shift+left/right resize");
  block.setAttribute("aria-pressed",String(clip.id===selectedClipId));
  block.tabIndex=0;
  const label=document.createElement("span");label.className="song-clip-label";
  label.textContent=beat?.title||"Missing Beat";
  const grip=document.createElement("span");grip.className="song-clip-grip";
  grip.setAttribute("aria-hidden","true");
  block.append(label,grip);
  block.addEventListener("click",()=>{
   if(ignoreClick){ignoreClick=false;return;}
   select(clip.id);
  });
  block.addEventListener("keydown",event=>{
   if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key))return;
   event.preventDefault();
   if(event.key==="ArrowUp"||event.key==="ArrowDown"){
    const lanes=getSong().tracks.filter(item=>item.kind==="beat");
    const index=lanes.findIndex(item=>item.id===track.id),other=lanes[index+(event.key==="ArrowUp"?-1:1)];
    if(other)apply(()=>{track.clips=track.clips.filter(item=>item.id!==clip.id);other.clips.push(clip);});
   }else{
    const delta=event.key==="ArrowRight"?BAR_STEPS:-BAR_STEPS;
    const changes=event.shiftKey?{lengthSteps:Math.max(BAR_STEPS,clip.lengthSteps+delta)}:
     {startStep:Math.max(0,clip.startStep+delta)};
    apply(()=>Object.assign(clip,changes));
   }
   tracks.querySelector('[data-clip-id="'+clip.id+'"]')?.focus({preventScroll:true});
  });
  block.dataset.clipId=clip.id;
  block.addEventListener("pointerdown",event=>{
   if(event.button!==0&&event.pointerType==="mouse")return;
   const resizing=event.target===grip;
   const original=resizing?clip.lengthSteps:clip.startStep;
   const startX=event.clientX,startY=event.clientY;
   dragging=false;
   block.setPointerCapture(event.pointerId);
   let steps=original;
   const move=e=>{
    if(e.pointerId!==event.pointerId)return;
    if(Math.abs(e.clientX-startX)>5||(!resizing&&Math.abs(e.clientY-startY)>8))dragging=true;
    if(!dragging)return;
    const shift=Math.round((e.clientX-startX)/BAR_PX)*BAR_STEPS;
    steps=resizing?Math.max(BAR_STEPS,original+shift):Math.max(0,original+shift);
    if(resizing)block.style.width=(steps/BAR_STEPS*BAR_PX)+"px";
    else block.style.left=(steps/BAR_STEPS*BAR_PX)+"px";
   };
   const finish=e=>{
    if(e.pointerId!==event.pointerId)return;
    block.removeEventListener("pointermove",move);
    block.removeEventListener("pointerup",finish);
    block.removeEventListener("pointercancel",cancel);
    if(dragging){
     ignoreClick=true;setTimeout(()=>{ignoreClick=false;},0);
     const destination=resizing?null:document.elementFromPoint(e.clientX,e.clientY)?.closest(".song-track-row")?.dataset.trackId;
     const dest=getSong().tracks.find(item=>item.id===destination&&item.kind==="beat");
     const moved=dest&&dest.id!==track.id;
     const changes=resizing?{lengthSteps:steps}:{startStep:steps};
     if(steps!==original||moved)apply(()=>{
      Object.assign(clip,changes);
      if(moved){track.clips=track.clips.filter(item=>item.id!==clip.id);dest.clips.push(clip);}
     });
     else render();
    }
    dragging=false;
   };
   const cancel=e=>{
    if(e.pointerId!==event.pointerId)return;
    block.removeEventListener("pointermove",move);
    block.removeEventListener("pointerup",finish);
    block.removeEventListener("pointercancel",cancel);
    dragging=false;render();
   };
   block.addEventListener("pointermove",move);
   block.addEventListener("pointerup",finish);
   block.addEventListener("pointercancel",cancel);
  });
  return block;
 }
 function render(){
  const song=getSong();
  root.hidden=!song;
  if(!song)return;
  const view=$("song-title");if(document.activeElement!==view)view.value=song.title;
  const viewportBars=Math.ceil(Math.max(0,viewport.clientWidth-LABEL_PX)/BAR_PX);
  const songBars=Math.ceil(songDurationSteps(song)/BAR_STEPS);
  const bars=Math.max(PAGE_BARS*timelinePages,viewportBars,songBars+8);
  const width=bars*BAR_PX;
  const totalWidth=width+LABEL_PX;
  ruler.replaceChildren();
  ruler.style.width=totalWidth+"px";
  ruler.style.setProperty("--song-bar-px",BAR_PX+"px");
  const axis=document.createElement("span");
  axis.className="song-ruler-axis";
  axis.textContent="bar";
  ruler.append(axis);
  for(let n=0;n<bars;n+=1){
   if(n%4!==0)continue;
   const label=document.createElement("span");label.className="song-ruler-mark";
   label.style.left=(LABEL_PX+n*BAR_PX+3)+"px";label.textContent=String(n+1);
   ruler.append(label);
  }
  const cursor=document.createElement("span");cursor.id="song-cursor";
  cursor.hidden=playPosition<0;
  cursor.style.left=(LABEL_PX+playPosition*BAR_PX)+"px";
  ruler.append(cursor);
  tracks.replaceChildren();
  for(const track of song.tracks){
   const row=document.createElement("div");row.className="song-track-row";row.dataset.trackId=track.id;
   const head=document.createElement("div");head.className="song-track-label";
   if(track.kind==="beat"&&track.clips.length){
    const ids=new Set(track.clips.map(clip=>clip.beatId));
    const first=track.clips[0],firstBeat=localBeat(first.beatId);
    const heading=ids.size===1?firstBeat?.title||track.name:track.name;
    const edit=document.createElement("button");
    edit.type="button";edit.className="song-track-open";
    edit.textContent=heading;
    edit.title="Edit "+(firstBeat?.title||"Beat");
    edit.setAttribute("aria-label",edit.title);
    edit.setAttribute("aria-pressed",String(getSelectedBeatId()===first.beatId));
    edit.addEventListener("click",()=>select(first.id));
    head.append(edit);
   }else head.textContent=track.name;
   const lane=document.createElement("div");lane.className="song-track-lane";
   lane.style.width=width+"px";
   lane.style.setProperty("--song-bar-px",BAR_PX+"px");
   if(track.kind==="beat"){
    for(const clip of track.clips)lane.append(clipButton(track,clip));
    const add=document.createElement("button");add.type="button";add.className="song-add-clip";
    add.textContent="+";
    add.title="Add Beat Clip to "+track.name;
    add.setAttribute("aria-label",add.title);
    const end=Math.max(0,...track.clips.map(c=>c.startStep+c.lengthSteps));
    add.style.left=(end/BAR_STEPS*BAR_PX+4)+"px";
    add.addEventListener("click",()=>{
     const list=song.beats;
     const beat=list.length===1?list[0]:list.find(b=>b.id===getSelectedBeatId())||list[0];
     apply(()=>track.clips.push({
      id:id(),beatId:beat.id,startStep:end,lengthSteps:beat.bars*BAR_STEPS
     }));
    });
    lane.append(add);
   }
   row.append(head,lane);tracks.append(row);
  }
  tracks.style.width=totalWidth+"px";
  const selection=selected(),settings=$("song-clip-settings");
  settings.hidden=!selection;
  if(selection){
   const {clip}=selection;
   $("song-clip-start").value=String(Math.floor(clip.startStep/BAR_STEPS)+1);
   $("song-clip-length").value=String(Math.max(1,clip.lengthSteps/BAR_STEPS));
  }
 }
 beatMenuToggle.addEventListener("click",toggleBeatMenu);
 $("song-new-beat").addEventListener("click",()=>{
  closeBeatMenu();onAddBeat();
 });
 $("song-import-beat").addEventListener("click",()=>{
  closeBeatMenu();onImportBeat();
 });
 root.addEventListener("pointerdown",event=>{
  if(!event.target.closest(".song-beat-add"))closeBeatMenu();
 });
 root.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!beatMenu.hidden){
   closeBeatMenu();beatMenuToggle.focus();
  }
 });
 viewport.addEventListener("scroll",()=>{
  if(!getSong())return;
  const remaining=viewport.scrollWidth-viewport.clientWidth-viewport.scrollLeft;
  if(remaining<BAR_PX*3){
   timelinePages++;
   render();
  }
 });
 if(typeof ResizeObserver!=="undefined"){
  new ResizeObserver(()=>{if(getSong())render();}).observe(viewport);
 }
 $("song-add-track").addEventListener("click",()=>onChange("add-track"));
 $("song-clip-start").addEventListener("change",event=>{
  const item=selected();if(!item)return;
  const next=integer(Number(event.target.value)-1,0)*BAR_STEPS;
  apply(()=>{item.clip.startStep=next;});
 });
 $("song-clip-length").addEventListener("change",event=>{
  const item=selected();if(!item)return;
  const next=Math.max(1,integer(Number(event.target.value),1))*BAR_STEPS;
  apply(()=>{item.clip.lengthSteps=next;});
 });
 $("song-clip-remove").addEventListener("click",()=>{
  const item=selected();if(!item)return;
  apply(()=>{item.track.clips=item.track.clips.filter(c=>c.id!==item.clip.id);selectedClipId=null;});
 });
 $("song-title").addEventListener("change",event=>{
  const value=event.target.value.trim()||"Untitled song";
  apply(()=>{getSong().title=value;});
 });
 return {render,select,setPosition(bar){
  playPosition=bar;
  const cursor=$("song-cursor");
  if(cursor){cursor.hidden=bar<0;cursor.style.left=(LABEL_PX+bar*BAR_PX)+"px";}
 }};
}
