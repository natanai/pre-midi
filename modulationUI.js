import {processorBypassed} from "./src/dsp/processing-chain.js";
import {modulationTargetsFor,modulationSourcesFor,MODULATION_CONTROLS,parameterField} from "./src/dsp/parameters.js";
import {MOD_TARGETS,MOD_SOURCES,defaultSource,LFO_SHAPES,LFO_DIVISIONS,randomLfoShape,DEFAULT_LFO_STEPS} from "./src/dsp/modulation.js";
import {createDial,explainLabel} from "./dial.js";
const openBySound=new Map();
export function renderModulationEditor(patch,onChange,soundId=null,onPreview=()=>{}){
 const targets=modulationTargetsFor(patch.type);
 const macros=patch.modulation?.macros??[];
 const sources=modulationSourcesFor(patch.type).filter(kind=>kind!=="macro"||macros.length);
 const key=soundId??patch;
 if(!openBySound.has(key))openBySound.set(key,!!patch.modulation?.routes?.length);
 const details=document.createElement("details");details.className="synth-group modulation-editor";details.open=openBySound.get(key);
 const summary=document.createElement("summary");summary.textContent="movement routes";details.append(summary);
 details.addEventListener("toggle",()=>openBySound.set(key,details.open));
 const routes=patch.modulation?.routes??[];
 const change=next=>onChange(["modulation"],{...patch.modulation,version:1,routes:next});
 const update=(index,values)=>change(routes.map((route,i)=>i===index?{...route,...values}:route));
 const preview=(index,values)=>onPreview(["modulation"],{...patch.modulation,version:1,
  routes:routes.map((route,i)=>i===index?{...route,...values}:route)});
 for(const [index,route] of routes.entries()){
  const row=document.createElement("div");row.className="synth-fields modulation-route";
   row.dataset.soundPath="modulation.routes."+index;
  const target=MOD_TARGETS.find(item=>item.id===route.target);
  const inactive=route.target.startsWith("filter.")&&(patch.filter==null||patch.audioFilterBypassed===true||processorBypassed(patch,"filter"))?"the filter is off":undefined;
  const name=document.createElement("span");name.textContent=route.source.kind==="macro"?(macros.find(m=>m.id===route.source.id)?.name??"macro")+" → "+target.name:route.source.kind==="velocity"?"touch → "+target.name:route.source.kind==="keytrack"?"keys → "+target.name:target.name+" over time";
  row.append(name);
  if(inactive){name.textContent+=" · filter off";name.title=inactive;}
  const depth=createDial({label:"Movement amount",help:"how far this movement changes the sound",min:-target.limit,max:target.limit,step:target.unit==="cents"?1:.01,display:target.unit==="cents"?"cents":target.unit==="octaves"?"octaves":target.unit==="linear_gain"?"percent":"number"},route.depth,value=>update(index,{depth:value}),value=>preview(index,{depth:value}));
  depth.querySelector('[role="slider"]').setAttribute("aria-label","Movement amount "+(index+1));
  depth.dataset.soundPath="modulation.routes."+index+".depth";row.append(depth);
  if(route.source.kind==="lfo"&&!route.source.sync){
   const speed=createDial({label:"Movement speed",...MODULATION_CONTROLS.rate},route.source.rate,value=>update(index,{source:{...route.source,rate:value}}),value=>preview(index,{source:{...route.source,rate:value}}));
   speed.dataset.soundPath="modulation.routes."+index+".source.rate";row.append(speed);
  }
  if(route.source.kind==="lfo"&&randomLfoShape(route.source.shape)){
   const seed=createDial({label:"Random seed",help:"choose a repeatable movement sequence",...MODULATION_CONTROLS.seed},route.source.seed??1,
    value=>update(index,{source:{...route.source,seed:value}}),value=>preview(index,{source:{...route.source,seed:value}}));
   seed.dataset.soundPath="modulation.routes."+index+".source.seed";row.append(seed);
  }
  if(route.source.kind==="lfo"&&route.source.shape==="steps"){
   for(let step=0;step<4;step++){
    const values=route.source.steps??DEFAULT_LFO_STEPS;
    const replace=value=>values.map((old,i)=>i===step?value:old);
    const dial=createDial({label:"Movement step "+(step+1),help:"the movement level during this part of the repeating pattern",...MODULATION_CONTROLS.step},values[step],
     value=>update(index,{source:{...route.source,steps:replace(value)}}),value=>preview(index,{source:{...route.source,steps:replace(value)}}));
    dial.dataset.soundPath="modulation.routes."+index+".source.steps."+step;row.append(dial);
   }
  }
  const smoothing=createDial({label:"Smoothing",...MODULATION_CONTROLS.smoothing},
   route.smoothing,value=>update(index,{smoothing:value}),value=>preview(index,{smoothing:value}));
  smoothing.dataset.soundPath="modulation.routes."+index+".smoothing";
  row.append(smoothing);
  const settings=document.createElement("details"),heading=document.createElement("summary");heading.textContent="routing";settings.className="modulation-routing";settings.append(heading);
  const select=(label,values,current,apply)=>{
   const field=document.createElement("label"),title=document.createElement("span"),input=document.createElement("select");title.textContent=label;explainLabel(title,label);field.className="synth-field";
    field.dataset.soundPath="modulation.routes."+index+"."+(label==="movement source"?"source.kind":label==="movement target"?"target":label==="movement shape"?"source.shape":label==="movement timing"?"source.sync":label==="macro"?"source.id":"polarity");
    input.setAttribute("aria-label",label+" "+(index+1));
   for(const [value,text] of values){const option=document.createElement("option");option.value=value;option.textContent=text;input.append(option);}
   input.value=current;input.addEventListener("change",()=>apply(input.value));field.append(title,input);settings.append(field);
  };
  select("movement source",sources.map(kind=>[kind,kind==="keytrack"?"key tracking":kind]),route.source.kind,kind=>update(index,{source:kind==="macro"?{kind,id:macros[0].id}:defaultSource(kind)}));
  if(route.source.kind==="macro")select("macro",macros.map(m=>[m.id,m.name]),route.source.id,id=>update(index,{source:{kind:"macro",id}}));
  if(route.source.kind==="lfo")select("movement shape",LFO_SHAPES.map(shape=>[shape,shape]),route.source.shape,shape=>update(index,{source:{...route.source,shape}}));
  if(route.source.kind==="lfo")select("movement timing",[["hz","hz"],...LFO_DIVISIONS.map(beats=>[String(beats),beats===.25?"1/16 note":beats===.5?"1/8 note":beats===1?"1/4 note":beats===2?"1/2 note":beats===4?"1 bar":(beats/4)+" bars"])],String(route.source.sync??"hz"),timing=>{
   const {sync,...source}=route.source;update(index,{source:timing==="hz"?source:{...source,sync:Number(timing)}});
  });
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

// One macro surface, mounted above both module/combined layouts by Inspector.
export function renderPerformanceMacros(patch,onChange,onPreview=()=>{}){
 const macros=patch.modulation?.macros??[],routes=patch.modulation?.routes??[];
 const details=document.createElement('details');details.className='synth-group performance-macros';details.open=macros.length>0;
 const summary=document.createElement('summary');summary.textContent='performance macros';details.append(summary);
 const setMacros=next=>onChange(["modulation"],{...patch.modulation,version:1,routes,macros:next});
 for(const macro of macros){
  const box=document.createElement('div');box.className='synth-fields';
  const name=document.createElement('input');name.value=macro.name;name.maxLength=32;name.setAttribute('aria-label','macro name');
  name.addEventListener('change',()=>setMacros(macros.map(m=>m.id===macro.id?{...m,name:name.value.trim()||m.name}:m)));box.append(name);
  const dial=createDial({label:macro.name,help:'one control moves every route assigned to this macro',min:0,max:1,step:.01,display:'percent'},macro.value,
   value=>setMacros(macros.map(m=>m.id===macro.id?{...m,value}:m)),value=>onPreview(['modulation'],{...patch.modulation,macros:macros.map(m=>m.id===macro.id?{...m,value}:m)}));box.append(dial);
  const graph=document.createElement('input');graph.type='range';graph.min='0';graph.max='1';graph.step='.01';graph.value=String(macro.value);graph.setAttribute('aria-label',macro.name+' position');
  graph.addEventListener('change',()=>setMacros(macros.map(m=>m.id===macro.id?{...m,value:Number(graph.value)}:m)));box.append(graph);
  for(const [label,run] of [['reset',()=>setMacros(macros.map(m=>m.id===macro.id?{...m,value:m.default}:m))],['save reset',()=>setMacros(macros.map(m=>m.id===macro.id?{...m,default:m.value}:m))],['remove',()=>onChange(['modulation'],{...patch.modulation,routes:routes.filter(r=>r.source.kind!=='macro'||r.source.id!==macro.id),macros:macros.filter(m=>m.id!==macro.id)})]]){
   const button=document.createElement('button');button.type='button';button.textContent=label;button.title=label==='remove'?'remove macro and its routes':label==='save reset'?'use this position when resetting the macro':'restore the saved macro position';button.addEventListener('click',run);box.append(button);
  }details.append(box);
 }
 const addMacro=document.createElement('button');addMacro.type='button';addMacro.textContent='add macro';addMacro.disabled=macros.length>=4;
 addMacro.addEventListener('click',()=>{const id=[1,2,3,4].map(n=>'macro-'+n).find(id=>!macros.some(m=>m.id===id));setMacros([...macros,{id,name:'macro '+id.at(-1),value:.5,default:.5}]);});details.append(addMacro);
 return details;
}
