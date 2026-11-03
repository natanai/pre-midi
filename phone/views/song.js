// Dedicated phone Song arrangement over the canonical Beat Track/Clip graph.
// Touch drag/resize preview is DOM-only until pointerup: one undoable model edit.
import {songDurationSteps} from "../../songModel.js";
const stepWidth=3,barSize=16;
const el=(tag,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;return e;};
const button=(label,action,cls)=>{const b=el("button",cls);b.type="button";b.textContent=label;b.addEventListener("click",action);return b;};
const numeral=(label,value,{min=0,max=1_000_000}={},action)=>{
 const wrap=el("label","phone-song-number");wrap.textContent=label;
 const input=el("input");input.type="number";input.value=String(value);
 input.min=String(min);input.max=String(max);input.step="1";input.inputMode="numeric";
 input.setAttribute("aria-label",label);
 input.addEventListener("change",()=>{
  const next=Number(input.value);
  if(!Number.isSafeInteger(next)||next<min||next>max){input.value=String(value);return;}
  action(next);
 });
 wrap.append(input);return wrap;
};
function attachClipGesture(node,clip,commit){
 let edit=null;
 node.addEventListener("pointerdown",event=>{
  if(event.button!==0||event.target.closest("button,input,select"))return;
  const rect=node.getBoundingClientRect();
  const resize=event.clientX>rect.right-Math.min(23,rect.width*.3);
  edit={id:event.pointerId,x:event.clientX,start:clip.startStep,length:clip.lengthSteps,resize};
  try{node.setPointerCapture(event.pointerId);}catch{}
  event.preventDefault();
 });
 node.addEventListener("pointermove",event=>{
  if(!edit||edit.id!==event.pointerId)return;
  const delta=Math.round((event.clientX-edit.x)/stepWidth);
  const next=edit.resize?{startStep:edit.start,lengthSteps:Math.max(1,edit.length+delta)}:
   {startStep:Math.max(0,edit.start+delta),lengthSteps:edit.length};
  node.style.left=next.startStep*stepWidth+"px";
  node.style.width=next.lengthSteps*stepWidth+"px";
  edit.next=next;
 });
 const end=event=>{
  if(!edit||edit.id!==event.pointerId)return;
  const old=edit;edit=null;
  try{if(node.hasPointerCapture(event.pointerId))node.releasePointerCapture(event.pointerId);}catch{}
  if(event.type==="pointerup"&&old.next&&
   (old.next.startStep!==clip.startStep||old.next.lengthSteps!==clip.lengthSteps))commit(old.next);
  else{node.style.left=clip.startStep*stepWidth+"px";node.style.width=clip.lengthSteps*stepWidth+"px";}
 };
 node.addEventListener("pointerup",end);
 node.addEventListener("pointercancel",end);
 node.addEventListener("lostpointercapture",event=>{if(edit)end(event);});
}
export function renderPhoneSong(root,{session,onCreateSong,onAddBeat,onSelectBeat,onAddTrack,onAddClip,onEditClip,onRemoveClip,onRenameTrack,onRenameSong,onEditBeat,onRecordVocal,onError}){
 root.replaceChildren();
 const doc=session.getDocument();
 if(doc.kind!=="song"){
  const start=el("section","phone-song-start");
  const heading=el("h2");heading.textContent="song";
  const info=el("p");info.textContent="Arrange this Beat into Tracks and Clips. Your notes and sounds are kept.";
  start.append(heading,info,button("create song from this beat",onCreateSong));
  root.append(start);return;
 }
 const header=el("div","phone-song-header");
 const name=el("input");name.type="text";name.value=doc.title;name.maxLength=100;
 name.setAttribute("aria-label","Song title");
 name.addEventListener("change",()=>onRenameSong(name.value));
 header.append(name);
 const beatPicker=el("select");beatPicker.setAttribute("aria-label","Selected Beat in Song");
 for(const beat of doc.beats){
  const opt=el("option");opt.value=beat.id;opt.textContent=beat.title;
  beatPicker.append(opt);
 }
 beatPicker.value=session.getBeat().id;
 beatPicker.addEventListener("change",()=>onSelectBeat(beatPicker.value));
 header.append(beatPicker);
 root.append(header);
 const tools=el("div","phone-song-actions");
 tools.append(button("+ beat",onAddBeat),button("+ beat track",()=>onAddTrack("beat")),
  button("+ vocal track",()=>onAddTrack("vocal")),button("● voice",onRecordVocal),button("edit beat",onEditBeat));
 root.append(tools);
 const hint=el("p","phone-song-hint");hint.textContent="Drag a Clip to move it · drag its right edge to resize · or edit steps below";
 root.append(hint);
 const scroll=el("div","phone-song-scroll");
 const timelineSteps=Math.min(4096,Math.max(128,songDurationSteps(doc)+32));
 const width=timelineSteps*stepWidth;
 const ruler=el("div","phone-song-ruler");ruler.style.width=width+"px";
 for(let bar=0;bar<timelineSteps/16;bar++){
  const marker=el("span");marker.textContent=String(bar+1);marker.style.left=bar*16*stepWidth+"px";ruler.append(marker);
 }
 scroll.append(ruler);
 for(const track of doc.tracks){
  const section=el("section","phone-song-track");
  const trackHead=el("div","phone-song-track-heading");
  const title=el("input");title.type="text";title.value=track.name;title.maxLength=100;
  title.setAttribute("aria-label","Track name");
  title.addEventListener("change",()=>onRenameTrack(track.id,title.value));
  const kind=el("span");kind.textContent=track.kind;
  trackHead.append(title,kind);
  if(track.kind==="beat")trackHead.append(button("+ clip",()=>onAddClip(track.id,session.getBeat().id)));
  section.append(trackHead);
  const lane=el("div","phone-song-lane");
  lane.style.width=width+"px";
  for(const clip of track.clips){
   const block=el("div","phone-song-clip");
   block.dataset.clipId=clip.id;
   block.style.left=clip.startStep*stepWidth+"px";
   block.style.width=clip.lengthSteps*stepWidth+"px";
   const source=doc.beats.find(beat=>beat.id===clip.beatId);
   block.textContent=track.kind==="beat"?(source?.title||"Beat"):"voice";
   block.title="Touch and drag to move; drag the right edge to resize";
   if(track.kind==="beat")attachClipGesture(block,clip,next=>onEditClip(clip.id,next));
   lane.append(block);
  }
  section.append(lane);
  const clipDetails=el("div","phone-song-clip-list");
  for(const clip of track.clips){
   const row=el("div","phone-song-clip-settings");
   row.append(numeral("start step",clip.startStep,{},value=>onEditClip(clip.id,{startStep:value})),
    numeral("length steps",clip.lengthSteps,{min:1},value=>onEditClip(clip.id,{lengthSteps:value})),
    button("×",()=>onRemoveClip(clip.id),"phone-song-remove"));
   clipDetails.append(row);
  }
  if(track.kind==="vocal"&&!track.clips.length){
   const label=el("p","phone-song-hint");label.textContent="tap ● voice above to capture a take with Song playback";
   clipDetails.append(label);
  }
  section.append(clipDetails);scroll.append(section);
 }
 const cursor=el("div","phone-song-playhead");
 cursor.id="phone-song-playhead";cursor.hidden=true;cursor.style.left="0px";scroll.append(cursor);
 root.append(scroll);
}
