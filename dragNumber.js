// Integer parameter scrubbing for compact number fields.
// Pointer drag changes the displayed value; release commits through the same
// native 'change' event as typing. Clicking still focuses the numeric field.
export const clampInteger=(n,min,max)=>Math.max(min,Math.min(max,Math.round(n)));
export function scrubValue(startValue,startY,currentY,min,max,fine=false){
 const pixelsPerStep=fine?24:10;
 return clampInteger(startValue+Math.trunc((startY-currentY)/pixelsPerStep),min,max);
}
export function attachNumberScrub(input){
 const min=Number(input.min),max=Number(input.max);
 let session=null;
 input.title="Drag up or down to adjust; click to type. Arrow keys also work.";
 input.addEventListener("pointerdown",event=>{
  if(event.button!==0||input.disabled)return;
  if(session)return;
  session={pointerId:event.pointerId,y:event.clientY,original:Number(input.value),moved:false};
  // Document listeners keep dragging responsive when the pointer leaves the
  // narrow field. No global state and no second persistence pathway.
  document.addEventListener("pointermove",move);
  document.addEventListener("pointerup",finish);
  document.addEventListener("pointercancel",finish);
 });
 function move(event){
  if(!session||event.pointerId!==session.pointerId)return;
  if(Math.abs(event.clientY-session.y)<5&&!session.moved)return;
  session.moved=true;
  input.classList.add("scrubbing");
  const next=scrubValue(session.original,session.y,event.clientY,min,max,event.shiftKey);
  input.value=String(next);
  event.preventDefault();
 }
 function finish(event){
  if(!session||event.pointerId!==session.pointerId)return;
  const {moved,original}=session;
  session=null;
  document.removeEventListener("pointermove",move);
  document.removeEventListener("pointerup",finish);
  document.removeEventListener("pointercancel",finish);
  input.classList.remove("scrubbing");
  if(event.type==="pointercancel"){
   input.value=String(original);
   return;
  }
  if(moved&&Number(input.value)!==original){
   event.preventDefault();
   input.dispatchEvent(new Event("change",{bubbles:true}));
  }
 }
}
