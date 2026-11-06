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
