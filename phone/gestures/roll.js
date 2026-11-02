// Phone-only geometry. Native Safari Pointer Events and the Chrome fixture use
// the same math; no music document mutation belongs in the gesture host.
export const MIN_ZOOM=30;
export const MAX_ZOOM=70;
export const KEY_WIDTH=62;

export function clampZoom(value){
 return Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,Math.round(value)));
}
export function centerOf(contacts){
 const points=[...contacts.values()];
 if(!points.length)return null;
 return {x:points.reduce((sum,p)=>sum+p.x,0)/points.length,
  y:points.reduce((sum,p)=>sum+p.y,0)/points.length};
}
export function spreadOf(contacts){
 const points=[...contacts.values()];
 return points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
}
// Snapshot each time the finger count changes. Scroll coordinates are in CSS
// pixels. The sticky piano keyboard never changes width when zooming.
export function navigationAnchor(contacts,{left,top,scrollLeft,scrollTop,zoom,keyWidth=KEY_WIDTH}){
 const center=centerOf(contacts);
 if(!center)throw Error("Cannot navigate without a pointer.");
 const localX=center.x-left,localY=center.y-top;
 return {
  center,localX,localY,scrollLeft,scrollTop,zoom,
  spread:spreadOf(contacts),keyWidth,
  // Store in grid-step units so the pinch holds the same musical step in place.
  stepAtCenter:(scrollLeft+localX-keyWidth)/zoom
 };
}
export function nextNavigation(anchor,contacts,{left,top}){
 const center=centerOf(contacts);
 if(!center)return null;
 const distance=spreadOf(contacts);
 const zoom=clampZoom(anchor.spread>0&&distance>0?
  anchor.zoom*distance/anchor.spread:anchor.zoom);
 const localX=center.x-left,localY=center.y-top;
 return {zoom,
  scrollLeft:Math.max(0,anchor.keyWidth+anchor.stepAtCenter*zoom-localX),
  scrollTop:Math.max(0,anchor.scrollTop+anchor.localY-localY)};
}
export function noteDragSteps(delta,cellSize){
 return Number.isFinite(delta)&&Number.isFinite(cellSize)&&cellSize>0?
  Math.round(delta/cellSize):0;
}
