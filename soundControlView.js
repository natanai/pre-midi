// A committed dial edit can rebuild its entire owning inspector. Preserve the
// user's position and the equivalent control, including inside an expanded
// module. Do not scroll a graph into view or move focus to a different module.
export function captureSoundControlView(knob){
 const doc=knob.ownerDocument;
 const field=knob.closest("[data-sound-path]");
 if(!field)return ()=>{};
 const path=field.dataset.soundPath;
 const domain=field.closest("[data-sound-domain]")?.dataset.soundDomain??"patch";
 const panel=field.closest("[data-visual-id]");
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
  const matches=candidates.filter(item=>item.dataset.soundPath===path&&
   (item.closest("[data-sound-domain]")?.dataset.soundDomain??"patch")===domain&&
   !item.closest("[hidden]")&&!item.classList.contains("visual-graph-action")&&item.querySelector('select,input,[role="slider"]'));
  const target=matches.find(item=>item.closest("[data-visual-id]")?.dataset.visualId===visualId)??matches[0];
  target?.querySelector('select,input,[role="slider"]')?.focus({preventScroll:true});
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

// Graphs may live in a shared illustration area in combined view. Retain the
// exact node and viewport through canonical edits in every Sound host.
export function captureSoundGraphView(node){
 if(!node?.classList?.contains("visual-graph-point"))return ()=>{};
 const id=node.closest("[data-visual-id]")?.dataset.visualId,handle=node.dataset.handle,doc=node.ownerDocument;
 if(!id)return ()=>{};
 const positions=[];
 for(let parent=node.parentElement;parent;parent=parent.parentElement)
  if(parent.scrollHeight>parent.clientHeight||parent.scrollTop||parent.scrollLeft)
   positions.push({node:parent,top:parent.scrollTop,left:parent.scrollLeft,
    combined:parent.classList.contains("sound-combined-illustrations")});
 return ()=>{
  const owner=[...doc.querySelectorAll("[data-visual-id]")].find(el=>el.dataset.visualId===id&&el.querySelector(".visual-graph-point"));
  const target=owner?.querySelector('.visual-graph-point[data-handle="'+handle+'"]');
  target?.focus({preventScroll:true});
  for(const position of positions){
   const parent=position.node.isConnected?position.node:position.combined?owner?.closest(".sound-combined-illustrations"):null;
   if(parent){parent.scrollTop=position.top;parent.scrollLeft=position.left;}
  }
 };
}
