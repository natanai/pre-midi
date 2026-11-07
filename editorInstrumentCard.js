const INSTRUMENT_SIGNALS=["#08e4ec","#ff416d","#ba82eb","#ffc266"];
export const instrumentAccent=index=>INSTRUMENT_SIGNALS[Math.max(0,index)%INSTRUMENT_SIGNALS.length];

// One Instrument card for Beat and Song-time freeform editors.
// Hosts retain ownership of selection, Sound inspection, actions and undo.
export function createInstrumentCard(instrument,{selected=false,accent=null,onSelect}={}){
 const card=document.createElement("button");
 card.type="button";
 card.className="instrument-card"+(selected?" active":"");
 card.setAttribute("aria-pressed",String(selected));
 card.setAttribute("aria-label","Edit instrument "+instrument.name);
 if(accent)card.style.setProperty("--track-accent",accent);
 const name=document.createElement("strong");
 name.textContent=instrument.name;
 card.append(name);
 if(instrument.layout==="rack"){
  const count=document.createElement("small");
  count.textContent=instrument.sounds.length+" sounds";
  card.append(count);
 }
 if(onSelect)card.addEventListener("click",onSelect);
 return card;
}


// Beat and Song-time freeform use one Instrument context-menu DOM and
// interaction lifecycle. Hosts provide actions and own musical undo.
export function createInstrumentActionMenu({
 label,actions=[],menuClass="",listClass="",groupLabel="",title=""
}={}){
 if(!label)throw Error("Instrument menu needs an accessible label.");
 const menu=document.createElement("details");
 menu.className=["entity-actions","instrument-actions",menuClass].filter(Boolean).join(" ");
 const summary=document.createElement("summary");
 summary.textContent="⋯";
 summary.setAttribute("aria-label",label);
 summary.title=title||label;
 const list=document.createElement("div");
 list.className=["entity-action-list",listClass].filter(Boolean).join(" ");
 if(groupLabel){
  list.setAttribute("role","group");
  list.setAttribute("aria-label",groupLabel);
 }
 for(const action of actions){
  if(!action?.label||typeof action.run!=="function")
   throw Error("Instrument action requires a label and callback.");
  const button=document.createElement("button");
  button.type="button";
  button.textContent=action.label;
  button.className=[action.danger?"danger":"",action.className||""].filter(Boolean).join(" ");
  button.disabled=!!action.disabled;
  if(action.title)button.title=action.title;
  button.addEventListener("click",()=>{
   menu.open=false;
   action.run();
  });
  list.append(button);
 }
 menu.append(summary,list);
 return menu;
}
