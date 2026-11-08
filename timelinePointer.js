// Song ruler and Clip drags share capture, hold and cancellation semantics.
// Preview callbacks never commit musical edits; release owns the transaction.
export const TIMELINE_HOLD_MS=180;
export const TIMELINE_DRAG_PX=6;

export function timelineStepAtX(x,{gutter,barPixels,bars,stepsPerBar=16}){
 const bar=Math.max(0,Math.min(bars-1,Math.floor((x-gutter)/barPixels)));
 return bar*stepsPerBar;
}

export function trackTimelinePointer(element,start,{onMove,onHold,onFinish,onEnd,
 holdMs=TIMELINE_HOLD_MS}={}){
 const doc=element.ownerDocument,view=doc.defaultView;
 let latest=start,moved=false,held=false,finished=false;
 const state=()=>({clientX:latest.clientX,clientY:latest.clientY,
  dx:latest.clientX-start.clientX,dy:latest.clientY-start.clientY,moved,held});
 const timer=onHold&&holdMs!==null?setTimeout(()=>{
  if(finished||moved)return;
  held=true;onHold(state());
 },holdMs):null;
 function move(event){
  if(finished||event.pointerId!==start.pointerId)return;
  latest=event;
  if(Math.hypot(event.clientX-start.clientX,event.clientY-start.clientY)>=TIMELINE_DRAG_PX){
   moved=true;clearTimeout(timer);
  }
  if(moved)event.preventDefault();
  onMove?.(state());
 }
 function finish(event,cancelled=false){
  if(finished||event&&event.pointerId!==start.pointerId)return;
  if(event&&!cancelled)move(event);
  finished=true;clearTimeout(timer);
  element.removeEventListener("pointermove",move);
  element.removeEventListener("pointerup",up);
  element.removeEventListener("pointercancel",cancelEvent);
  element.removeEventListener("lostpointercapture",cancelEvent);
  doc.removeEventListener("keydown",key,true);
  doc.removeEventListener("visibilitychange",visibility);
  view.removeEventListener("blur",cancel);
  view.removeEventListener("pagehide",cancel);
  if(element.hasPointerCapture(start.pointerId))element.releasePointerCapture(start.pointerId);
  if(cancelled){
   // Escape or lost capture must not turn the eventual release into a click
   // on the original Clip or the lane underneath it. A fresh press clears it.
   const clearClickGuard=()=>{
    doc.removeEventListener("click",blockClick,true);
    doc.removeEventListener("pointerdown",clearClickGuard,true);
   };
   const blockClick=event=>{
    if(event.detail===0)return;
    clearClickGuard();event.preventDefault();event.stopImmediatePropagation();
   };
   doc.addEventListener("click",blockClick,true);
   doc.addEventListener("pointerdown",clearClickGuard,true);
  }
  onEnd?.();
  onFinish?.({...state(),cancelled});
 }
 const cancel=()=>finish(null,true);
 const up=event=>finish(event);
 const cancelEvent=event=>finish(event,true);
 const visibility=()=>{if(doc.hidden)cancel();};
 const key=event=>{
  if(event.key!=="Escape")return;
  event.preventDefault();event.stopPropagation();cancel();
 };
 element.setPointerCapture(start.pointerId);
 element.addEventListener("pointermove",move);
 element.addEventListener("pointerup",up);
 element.addEventListener("pointercancel",cancelEvent);
 element.addEventListener("lostpointercapture",cancelEvent);
 doc.addEventListener("keydown",key,true);
 doc.addEventListener("visibilitychange",visibility);
 view.addEventListener("blur",cancel);
 view.addEventListener("pagehide",cancel);
 return cancel;
}

// Only time spent deliberately pulling into the owning child lane counts.
// Lateral motion, other Tracks and returning to the parent reset the gate.
export function attachedLanePull({durationMs=650,minDistance=14}={}){
 let began=null;
 return {update({inOwnLane,dy},time){
  if(!inOwnLane||dy<minDistance){began=null;return {progress:0,ready:false};}
  began??=time;const progress=Math.max(0,Math.min(1,(time-began)/durationMs));
  return {progress,ready:progress===1};
 },reset(){began=null;}};
}
