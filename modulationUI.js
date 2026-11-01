import {MOD_TARGETS,MOD_SOURCES,defaultSource} from "./src/dsp/modulation.js";
import {createDial,explainLabel} from "./dial.js";
const openBySound=new Map();
export function renderModulationEditor(patch,onChange,soundId=null){
 const key=soundId??patch;
 if(!openBySound.has(key))openBySound.set(key,!!patch.modulation?.routes?.length);
 const details=document.createElement("details");details.className="synth-group modulation-editor";details.open=openBySound.get(key);
 const summary=document.createElement("summary");summary.textContent="movement routes";details.append(summary);
 details.addEventListener("toggle",()=>openBySound.set(key,details.open));
 const routes=patch.modulation?.routes??[];
 const change=next=>onChange(["modulation"],{version:1,routes:next});
 const update=(index,values)=>change(routes.map((route,i)=>i===index?{...route,...values}:route));
 for(const [index,route] of routes.entries()){
  const row=document.createElement("div");row.className="synth-fields modulation-route";
  const target=MOD_TARGETS.find(item=>item.id===route.target);
  const name=document.createElement("span");name.textContent=route.source.kind==="velocity"?"touch → "+target.name:route.source.kind==="keytrack"?"keys → "+target.name:target.name+" over time";
  row.append(name);
  const depth=createDial({label:"Movement amount",help:"how far this movement changes the sound",min:-target.limit,max:target.limit,step:target.unit==="cents"?1:.01,display:target.unit==="cents"?"cents":target.unit==="octaves"?"octaves":target.unit==="linear_gain"?"percent":"number"},route.depth,value=>update(index,{depth:value}));
  depth.querySelector('[role="slider"]').setAttribute("aria-label","Movement amount "+(index+1));row.append(depth);
  if(route.source.kind==="lfo")row.append(createDial({label:"Movement speed",min:.05,max:20,step:.05,display:"hz"},route.source.rate,value=>update(index,{source:{...route.source,rate:value}})));
  const settings=document.createElement("details"),heading=document.createElement("summary");heading.textContent="routing";settings.className="modulation-routing";settings.append(heading);
  const select=(label,values,current,apply)=>{
   const field=document.createElement("label"),title=document.createElement("span"),input=document.createElement("select");title.textContent=label;explainLabel(title,label);field.className="synth-field";input.setAttribute("aria-label",label+" "+(index+1));
   for(const [value,text] of values){const option=document.createElement("option");option.value=value;option.textContent=text;input.append(option);}
   input.value=current;input.addEventListener("change",()=>apply(input.value));field.append(title,input);settings.append(field);
  };
  select("movement source",MOD_SOURCES.map(kind=>[kind,kind==="keytrack"?"key tracking":kind]),route.source.kind,kind=>update(index,{source:defaultSource(kind)}));
  select("movement target",MOD_TARGETS.map(target=>[target.id,target.name]),route.target,id=>{const next=MOD_TARGETS.find(t=>t.id===id);update(index,{target:id,unit:next.unit,depth:Math.max(-next.limit,Math.min(next.limit,route.depth))});});
  select("movement range",[["unipolar","one way"],["bipolar","both ways"]],route.polarity,polarity=>update(index,{polarity}));
  if(route.source.kind==="envelope")for(const [field,max] of [["attack",3],["decay",3],["sustain",1],["release",4]])settings.append(createDial({label:"Move "+field,min:field==="release"?.01:0,max,step:.01,display:field==="sustain"?"percent":"seconds"},route.source.envelope[field],value=>update(index,{source:{...route.source,envelope:{...route.source.envelope,[field]:value}}})));
  const remove=document.createElement("button");remove.type="button";remove.textContent="remove movement";remove.addEventListener("click",()=>change(routes.filter((_,i)=>i!==index)));settings.append(remove);row.append(settings);details.append(row);
 }
 const add=document.createElement("button");add.type="button";add.textContent="add movement";add.disabled=routes.length>=16;
 add.addEventListener("click",()=>{openBySound.set(key,true);change([...routes,{id:globalThis.crypto.randomUUID(),source:defaultSource("lfo"),target:"filter.cutoff",unit:"octaves",depth:1,polarity:"unipolar",smoothing:.005}]);});details.append(add);
 return details;
}
