// A committed dial edit can rebuild its entire owning inspector. Preserve the
// user's position and the equivalent control, including inside an expanded
// module. Do not scroll a graph into view or move focus to a different module.
export function captureSoundControlView(knob){
 const doc=knob.ownerDocument;
 const field=knob.closest("[data-sound-path]");
 if(!field)return ()=>{};
 const path=field.dataset.soundPath;
 const panel=field.closest(".visual-sound-panel");
 const visualId=panel?.dataset.visualId;
 const root=field.closest(".sound-section,.phone-patch-editor")??panel?.parentElement;
 if(!root)return ()=>{};
 const positions=[];
 for(let node=knob.parentElement;node;node=node.parentElement){
  if(node.scrollTop||node.scrollLeft||node.scrollHeight>node.clientHeight)
   positions.push({node,top:node.scrollTop,left:node.scrollLeft,
    visualId:node.classList.contains("visual-sound-panel")?node.dataset.visualId:null});
 }
 return ()=>{
  const panels=[...doc.querySelectorAll(".visual-sound-panel")];
  const replacement=panels.find(item=>item.dataset.visualId===visualId);
  const owner=root.isConnected?root:replacement?.parentElement;
  const candidates=[...(owner?.querySelectorAll("[data-sound-path]")??[])];
  const target=candidates.find(item=>item.dataset.soundPath===path&&
   !item.classList.contains("visual-graph-action")&&item.querySelector('[role="slider"]'));
  target?.querySelector('[role="slider"]')?.focus({preventScroll:true});
  // Force layout after replacement before restoring scroll extents. The old
  // zoomed panel may have been replaced while its surrounding scroller lives.
  owner?.getBoundingClientRect();
  for(const position of positions){
   const node=position.node.isConnected?position.node:
    panels.find(item=>item.dataset.visualId===position.visualId);
   if(node){node.scrollTop=position.top;node.scrollLeft=position.left;}
  }
 };
}
