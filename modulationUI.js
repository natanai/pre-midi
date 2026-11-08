import {modulationTargetsFor,modulationSourcesFor,MODULATION_CONTROLS,parameterField} from "./src/dsp/parameters.js";
import {MOD_TARGETS,MOD_SOURCES,defaultSource,LFO_SHAPES} from "./src/dsp/modulation.js";
import {createDial,explainLabel} from "./dial.js";
const openBySound=new Map();
export function renderModulationEditor(patch,onChange,soundId=null,onPreview=()=>{}){
 const targets=modulationTargetsFor(patch.type);
 const sources=modulationSourcesFor(patch.type);
 const key=soundId??patch;
 if(!openBySound.has(key))openBySound.set(key,!!patch.modulation?.routes?.length);
 const details=document.createElement("details");details.className="synth-group modulation-editor";details.open=openBySound.get(key);
 const summary=document.createElement("summary");summary.textContent="movement routes";details.append(summary);
 details.addEventListener("toggle",()=>openBySound.set(key,details.open));
 const routes=patch.modulation?.routes??[];
 const change=next=>onChange(["modulation"],{version:1,routes:next});
 const update=(index,values)=>change(routes.map((route,i)=>i===index?{...route,...values}:route));
 const preview=(index,values)=>onPreview(["modulation"],{version:1,
  routes:routes.map((route,i)=>i===index?{...route,...values}:route)});
 for(const [index,route] of routes.entries()){
  const row=document.createElement("div");row.className="synth-fields modulation-route";
   row.dataset.soundPath="modulation.routes."+index;
  const target=MOD_TARGETS.find(item=>item.id===route.target);
  const inactive=route.target.startsWith("filter.")&&(patch.filter==null||patch.audioFilterBypassed===true)?"the filter is off":undefined;
  const name=document.createElement("span");name.textContent=route.source.kind==="velocity"?"touch → "+target.name:route.source.kind==="keytrack"?"keys → "+target.name:target.name+" over time";
  row.append(name);
  if(inactive){name.textContent+=" · filter off";name.title=inactive;}
  const depth=createDial({label:"Movement amount",help:"how far this movement changes the sound",min:-target.limit,max:target.limit,step:target.unit==="cents"?1:.01,display:target.unit==="cents"?"cents":target.unit==="octaves"?"octaves":target.unit==="linear_gain"?"percent":"number"},route.depth,value=>update(index,{depth:value}),value=>preview(index,{depth:value}));
  depth.querySelector('[role="slider"]').setAttribute("aria-label","Movement amount "+(index+1));
  depth.dataset.soundPath="modulation.routes."+index+".depth";row.append(depth);
  if(route.source.kind==="lfo"){
   const speed=createDial({label:"Movement speed",...MODULATION_CONTROLS.rate},route.source.rate,value=>update(index,{source:{...route.source,rate:value}}),value=>preview(index,{source:{...route.source,rate:value}}));
   speed.dataset.soundPath="modulation.routes."+index+".source.rate";row.append(speed);
  }
  const smoothing=createDial({label:"Smoothing",...MODULATION_CONTROLS.smoothing},
   route.smoothing,value=>update(index,{smoothing:value}),value=>preview(index,{smoothing:value}));
  smoothing.dataset.soundPath="modulation.routes."+index+".smoothing";
  row.append(smoothing);
  const settings=document.createElement("details"),heading=document.createElement("summary");heading.textContent="routing";settings.className="modulation-routing";settings.append(heading);
  const select=(label,values,current,apply)=>{
   const field=document.createElement("label"),title=document.createElement("span"),input=document.createElement("select");title.textContent=label;explainLabel(title,label);field.className="synth-field";
    field.dataset.soundPath="modulation.routes."+index+"."+(label==="movement source"?"source.kind":label==="movement target"?"target":label==="movement shape"?"source.shape":"polarity");
    input.setAttribute("aria-label",label+" "+(index+1));
   for(const [value,text] of values){const option=document.createElement("option");option.value=value;option.textContent=text;input.append(option);}
   input.value=current;input.addEventListener("change",()=>apply(input.value));field.append(title,input);settings.append(field);
  };
  select("movement source",sources.map(kind=>[kind,kind==="keytrack"?"key tracking":kind]),route.source.kind,kind=>update(index,{source:defaultSource(kind)}));
  if(route.source.kind==="lfo")select("movement shape",LFO_SHAPES.map(shape=>[shape,shape]),route.source.shape,shape=>update(index,{source:{...route.source,shape}}));
  select("movement target",targets.map(target=>[target.id,target.name]),route.target,id=>{const next=MOD_TARGETS.find(t=>t.id===id);update(index,{target:id,unit:next.unit,depth:Math.max(-next.limit,Math.min(next.limit,route.depth))});});
  select("movement range",[["unipolar","one way"],["bipolar","both ways"]],route.polarity,polarity=>update(index,{polarity}));
  if(route.source.kind==="envelope")for(const field of ["attack","decay","sustain","release"]){
   const dial=createDial({...parameterField("envelope."+field),label:"Move "+field},
    route.source.envelope[field],value=>update(index,{source:{...route.source,envelope:{...route.source.envelope,[field]:value}}}),
    value=>preview(index,{source:{...route.source,envelope:{...route.source.envelope,[field]:value}}}));
   dial.dataset.soundPath="modulation.routes."+index+".source.envelope."+field;
   settings.append(dial);
  }
  if(route.source.kind==="keytrack")for(const field of ["root","span"]){
   const dial=createDial({label:field==="root"?"Tracking center":"Tracking spread",...MODULATION_CONTROLS[field]},
    route.source[field],value=>update(index,{source:{...route.source,[field]:value}}),
    value=>preview(index,{source:{...route.source,[field]:value}}));
   dial.dataset.soundPath="modulation.routes."+index+".source."+field;
   settings.append(dial);
  }
  const remove=document.createElement("button");remove.type="button";remove.textContent="remove movement";remove.addEventListener("click",()=>change(routes.filter((_,i)=>i!==index)));settings.append(remove);row.append(settings);details.append(row);
 }
 const add=document.createElement("button");add.type="button";add.textContent="add movement";add.disabled=routes.length>=16;
 add.addEventListener("click",()=>{openBySound.set(key,true);change([...routes,{id:globalThis.crypto.randomUUID(),source:defaultSource("lfo"),target:"filter.cutoff",unit:"octaves",depth:1,polarity:"unipolar",smoothing:.005}]);});details.append(add);
 return details;
}
