// One pointer gesture lifecycle for Beat Chunk notes and Song-time freeform
// notes. Each host supplies its own note mutations, timing and undo boundary.
// Mouse, touch and pen share the same threshold, end-grab and cancel handling.
export const NOTE_DRAG_THRESHOLD=6;
export const NOTE_HOLD_MS=180;

export function noteDragDelta(dx,dy,stepWidth,rowHeight){
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||stepWidth<=0||rowHeight<=0)
  throw RangeError("invalid note drag geometry");
 return {
  steps:Math.round(dx/stepWidth),
  pitches:-Math.round(dy/rowHeight),
  distance:Math.hypot(dx,dy)
 };
}

export function noteEndGrabWidth(width,pointerType){
 if(!Number.isFinite(width)||width<=0)return 0;
 // Freeform one-step notes can be only eight pixels wide. Keep a usable body
 // for moving them instead of allowing the resize handle to eat the note.
 return Math.min(pointerType==="touch"?18:13,Math.max(3,Math.floor(width*.24)));
}

export function bindPianoNoteGesture(element,{begin,stepWidth,rowHeight}){
 element.addEventListener("pointerdown",event=>{
  if(event.button!==0||event.isPrimary===false)return;
  const operation=begin(event);
  if(!operation)return;
  const pointerId=event.pointerId,startX=event.clientX,startY=event.clientY;
  const unitX=typeof stepWidth==="function"?stepWidth():stepWidth;
  const unitY=typeof rowHeight==="function"?rowHeight():rowHeight;
  let finished=false,grabbed=operation.mode!=="move";
  if(grabbed)operation.grab?.();
  if(operation.mode!=="move")event.preventDefault();
  element.setPointerCapture(pointerId);
  const holdTimer=operation.mode==="move"?setTimeout(()=>{
   if(finished||grabbed)return;
   grabbed=true;
   operation.grab?.();
  },NOTE_HOLD_MS):null;
  function deltaAt(e){
   return noteDragDelta(e.clientX-startX,e.clientY-startY,unitX,unitY);
  }
  function move(e){
   if(finished||e.pointerId!==pointerId)return;
   const delta=deltaAt(e);
   if(!grabbed&&delta.distance>=NOTE_DRAG_THRESHOLD){
    grabbed=true;clearTimeout(holdTimer);operation.grab?.();
   }
   if(!grabbed)return;
   e.preventDefault();
   operation.preview?.(delta);
  }
  function finish(e){
   if(finished||e.pointerId!==pointerId)return;
   if(e.type==="pointerup")move(e);
   finished=true;clearTimeout(holdTimer);
   element.removeEventListener("pointermove",move);
   element.removeEventListener("pointerup",finish);
   element.removeEventListener("pointercancel",finish);
   element.removeEventListener("lostpointercapture",finish);
   if(element.hasPointerCapture(pointerId))element.releasePointerCapture(pointerId);
   operation.finish?.({
    ...deltaAt(e),grabbed,cancelled:e.type!=="pointerup"
   });
  }
  element.addEventListener("pointermove",move);
  element.addEventListener("pointerup",finish);
  element.addEventListener("pointercancel",finish);
  element.addEventListener("lostpointercapture",finish);
 });
}
