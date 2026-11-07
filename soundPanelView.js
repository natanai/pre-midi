// Layout is a local preference. Both views reuse the same controls, diagrams
// and canonical writers; changing the view never edits the sound or history.
let preferredView="modules",selectedControl=null;
try{preferredView=localStorage.getItem("sound-panel-view")==="combined"?"combined":"modules";}catch{}
const fieldSelector=".dial-field[data-sound-path],.synth-field[data-sound-path],.sample-pitch-setting[data-sound-path]";
const domain=field=>field.closest("[data-sound-domain]")?.dataset.soundDomain??"patch";
const related=(a,b)=>a===b||a.startsWith(b+".")||b.startsWith(a+".");

export function mountSoundPanelView(root){
 root.soundPanelView?.dispose();
 const toolbar=document.createElement("div");toolbar.className="sound-panel-view";
 const label=document.createElement("span");label.textContent="view";
 const buttons=new Map();
 for(const [value,title] of [["modules","modules"],["combined","combined"]]){
  const button=document.createElement("button");button.type="button";button.textContent=title;
  button.addEventListener("click",()=>setView(value));buttons.set(value,button);toolbar.append(button);
 }
 toolbar.prepend(label);root.prepend(toolbar);
 const combined=document.createElement("section");combined.className="sound-combined-panel";
 const illustrations=document.createElement("div");illustrations.className="sound-combined-illustrations";
 illustrations.setAttribute("aria-label","illustrations for the selected sound control");
 const controls=document.createElement("div");controls.className="sound-combined-controls";
 combined.append(illustrations,controls);
 let records=[],hiddenFields=[],view="modules",shownKey=null;
 function restore(){
  for(const [field,hidden] of hiddenFields)field.hidden=hidden;
  hiddenFields=[];
  // Restore outer groups before nested harmonic groups.
  for(const record of [...records].reverse()){
   for(const [placeholder,node] of record.moved)placeholder.replaceWith(node);
   record.panel.hidden=false;
  }
  records=[];combined.remove();illustrations.replaceChildren();controls.replaceChildren();
 }
 function showRelated(selection){
  if(view!=="combined")return;
  let matches=records.filter(record=>selection&&record.links.some(key=>
   related(key,selection.path)&&record.domain===selection.domain));
  if(!matches.length)matches=records.slice(0,1);
  for(const record of records)record.figure.hidden=!matches.includes(record);
  const key=selection?selection.domain+":"+selection.path:null;
  if(key!==shownKey)illustrations.scrollTop=0;
  shownKey=key;
 }
 function combine(){
  // Snapshot first: moving a parent's controls also moves nested harmonic
  // wrappers. Inner-first processing preserves their original locations.
  const panels=[...root.querySelectorAll(".visual-sound-panel")].reverse();
  for(const panel of panels){
   const details=panel.querySelector(":scope > details"),area=details?.querySelector(":scope > .visual-panel-area");
   if(!details||!area)continue;
   const title=details.querySelector(":scope > summary")?.textContent??"sound";
   const figure=document.createElement("section");figure.className="sound-combined-figure";
   figure.dataset.visualId=panel.dataset.visualId;
   const heading=document.createElement("h3");heading.textContent=title;
   const group=document.createElement("section");group.className="sound-combined-group";
   group.dataset.visualId=panel.dataset.visualId;
   const groupHeading=heading.cloneNode(true);group.append(groupHeading);
   const record={panel,figure,group,moved:[],links:[...new Set([...area.querySelectorAll("[data-sound-links]")].flatMap(node=>node.dataset.soundLinks.split("|")))],domain:panel.dataset.visualKind==="stage"?"stage":"patch"};
   const move=(node,target)=>{
    const placeholder=document.createComment("sound view position");node.before(placeholder);
    record.moved.push([placeholder,node]);target.append(node);
   };
   figure.append(heading);move(area,figure);
   for(const child of [...details.children])if(child.tagName!=="SUMMARY")move(child,group);
   panel.hidden=true;records.push(record);
  }
  records.reverse();
  const seen=new Set();
  for(const record of records){
   for(const field of record.group.querySelectorAll(fieldSelector)){
    const key=domain(field)+":"+field.dataset.soundPath;
    hiddenFields.push([field,field.hidden]);
    if(seen.has(key))field.hidden=true;else seen.add(key);
   }
   const hasControls=[...record.group.querySelectorAll("select,input,button,[role='slider']")].some(node=>!node.closest("[hidden]"));
   record.group.hidden=!hasControls;
   illustrations.append(record.figure);controls.append(record.group);
  }
  toolbar.after(combined);showRelated(selectedControl);
 }
 function setView(next){
  restore();view=next;preferredView=next;root.dataset.soundPanelView=next;
  for(const [value,button] of buttons)button.setAttribute("aria-pressed",String(value===next));
  if(next==="combined")combine();
  try{localStorage.setItem("sound-panel-view",next);}catch{}
 }
 function follow(event){
  if(view!=="combined"||event.target.closest?.(".visual-panel-area"))return;
  const field=event.target.closest?.("[data-sound-path]");if(!field)return;
  selectedControl={path:field.dataset.soundPath,domain:domain(field)};
  showRelated(selectedControl);
 }
 const events=["focusin","pointerdown","sound-control-input","change"];
 // Quick controls live above modules in the shared Inspector.
 const owner=root.closest(".sound-section,.freeform-sound-content,.vocal-editor,.phone-patch-editor")??root;
 for(const event of events)owner.addEventListener(event,follow);
 root.soundPanelView={refresh:()=>setView(view),dispose:()=>{
  restore();toolbar.remove();for(const event of events){owner.removeEventListener(event,follow);}
 }};
 setView(preferredView);
 return root.soundPanelView;
}
