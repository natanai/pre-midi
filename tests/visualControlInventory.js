// Runtime inventory of the actual sound-shaping controls, not a hand-maintained
// list of knobs. Used by browser qualification across synth, sampler, vocal,
// per-note, freeform and all variable-length illustration pages.
const editableSelector="select,input,[role='slider']";
const editors=".dial-field,.synth-field,.sample-pitch-setting,.expression-level";
const directLinks=".visual-graph-point[data-sound-links],.visual-graph-action[data-sound-links]";
const linkedPaths=node=>(node.dataset.soundLinks||"").split("|").filter(Boolean);
const linkedKeys=node=>(node.dataset.soundKeys||linkedPaths(node)
 .map(path=>"patch:"+path).join("|")).split("|").filter(Boolean);

export function auditSoundVisualCoverage(root,{context="sound"}={}){
 // Large multisample selectors are intentionally lazy-rendered. Populate
 // them without changing the user's accordion state, or their actual knobs
 // would silently escape the inventory when there are more than eight zones.
 for(const mapping of root.querySelectorAll("details.sample-map-details"))
  mapping.populateMapping?.();
 const editable=[...root.querySelectorAll(editors)].filter(node=>
  node.querySelector(editableSelector)&&
  !node.closest(".visual-graph-points")&&!node.closest("[hidden]"));
 const controls=editable.map(node=>({
  // Primary Beat controls are wrapped in stable containers that own their
  // canonical path; child dials remain generic reusable widgets.
  path:node.dataset.soundPath||node.parentElement?.closest("[data-sound-path]")?.dataset.soundPath||"",
  domain:node.closest("[data-sound-domain]")?.dataset.soundDomain??"patch",
  ...(node.matches(".dial-field")?{range:{
   min:Number(node.querySelector('[role="slider"]').getAttribute("aria-valuemin")),
   max:Number(node.querySelector('[role="slider"]').getAttribute("aria-valuemax")),
   step:Number(node.querySelector('[role="slider"]').dataset.soundStep)
  }}:{}),
  label:node.querySelector("label,span")?.textContent?.trim()||
   node.getAttribute("aria-label")||"",
  kind:node.matches(".dial-field")?"knob":
   node.querySelector("select")?"selector":node.querySelector("input[type='checkbox']")?
    "switch":"level"
 }));
 const visualPaths=new Set(),visualKeys=new Set(),axes=new Map(),panels=[...root.querySelectorAll(".visual-sound-panel")];
 const read=target=>target.querySelectorAll(directLinks).forEach(node=>{
  for(const path of linkedPaths(node))visualPaths.add(path);
  const keys=linkedKeys(node);keys.forEach(key=>visualKeys.add(key));
  for(const axis of JSON.parse(node.dataset.soundAxes||"[]")){
   const key=keys.find(key=>key.endsWith(":"+axis.path.join(".")));
   if(key){if(!axes.has(key))axes.set(key,[]);axes.get(key).push(axis);}
  }
 });
 for(const panel of panels){
  const pages=panel.querySelector(".visual-panel-pages");
  const next=pages?.querySelector("button:last-of-type");
  const previous=pages?.querySelector("button:first-of-type");
  // Inspect every actually rendered page, including dynamically generated
  // modulation routes and all imported sample zones. Restore original page.
  let rewound=0,advanced=0;
  if(pages&&!pages.hidden&&previous){
   for(let guard=0;guard<256&&!previous.disabled;guard++){
    previous.click();rewound++;
   }
  }
  for(let guard=0;guard<256;guard++){
   read(panel);
   if(!pages||pages.hidden||!next||next.disabled)break;
   next.click();advanced++;
  }
  // Return to the exact originally selected page, not always page one.
  for(let i=0;i<advanced-rewound;i++)previous.click();
 }
 // Note expression intentionally shares the graph/point primitives but has
 // no accordion wrapper. Its controls must pass the same exact-path audit.
 for(const expression of root.querySelectorAll(".expression-visual"))read(expression);
 const missing=controls.filter(control=>!control.path||!visualKeys.has(control.domain+":"+control.path));
 const inexact=controls.filter(control=>control.kind==="knob"&&!missing.includes(control)&&
  !(axes.get(control.domain+":"+control.path)||[]).some(axis=>
   ["min","max","step"].every(key=>Math.abs(axis[key]-control.range[key])<1e-9)));
 return {
  context,controls,visualPaths:[...visualPaths].sort(),visualKeys:[...visualKeys].sort(),
  summary:{controls:controls.length,knobs:controls.filter(c=>c.kind==="knob").length,
   linked:controls.length-missing.length,unlinked:missing.length,
   panels:panels.length,inexact:inexact.length},
  missing,inexact
 };
}
