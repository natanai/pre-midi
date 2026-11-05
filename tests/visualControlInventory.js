// Runtime inventory of the actual sound-shaping controls, not a hand-maintained
// list of knobs. Used by browser qualification across synth, sampler, vocal,
// per-note, freeform and all variable-length illustration pages.
const editableSelector="select,input,[role='slider']";
const editors=".dial-field,.synth-field,.sample-pitch-setting,.expression-level";
const directLinks=".visual-graph-point[data-sound-links],.visual-graph-action[data-sound-links]";
const linkedPaths=node=>(node.dataset.soundLinks||"").split("|").filter(Boolean);

export function auditSoundVisualCoverage(root,{context="sound"}={}){
 const editable=[...root.querySelectorAll(editors)].filter(node=>
  node.querySelector(editableSelector)&&
  !node.closest(".visual-graph-points"));
 const controls=editable.map(node=>({
  path:node.dataset.soundPath||"",
  label:node.querySelector("label,span")?.textContent?.trim()||
   node.getAttribute("aria-label")||"",
  kind:node.matches(".dial-field")?"knob":
   node.querySelector("select")?"selector":node.querySelector("input[type='checkbox']")?
    "switch":"level"
 }));
 const visualPaths=new Set(),panels=[...root.querySelectorAll(".visual-sound-panel")];
 const read=target=>target.querySelectorAll(directLinks).forEach(node=>{
  for(const path of linkedPaths(node))visualPaths.add(path);
 });
 for(const panel of panels){
  const pages=panel.querySelector(".visual-panel-pages");
  const next=pages?.querySelector("button:last-of-type");
  const previous=pages?.querySelector("button:first-of-type");
  // Inspect every actually rendered page, including dynamically generated
  // modulation routes and all imported sample zones. Restore original page.
  let advanced=0;
  for(let guard=0;guard<256;guard++){
   read(panel);
   if(!pages||pages.hidden||!next||next.disabled)break;
   next.click();advanced++;
  }
  for(let i=0;i<advanced;i++)previous.click();
 }
 // Note expression intentionally shares the graph/point primitives but has
 // no accordion wrapper. Its controls must pass the same exact-path audit.
 for(const expression of root.querySelectorAll(".expression-visual"))read(expression);
 const missing=controls.filter(control=>!control.path||!visualPaths.has(control.path));
 return {
  context,controls,visualPaths:[...visualPaths].sort(),
  summary:{controls:controls.length,knobs:controls.filter(c=>c.kind==="knob").length,
   linked:controls.length-missing.length,unlinked:missing.length,
   panels:panels.length},
  missing
 };
}
