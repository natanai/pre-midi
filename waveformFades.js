import {parameterFor} from './src/dsp/parameters.js';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

// Display time is original source seconds, even when playback reverses or
// stretches the selected region. Fade values are always playback seconds.
export function waveformFadeRange(start,end,{sourcePerSecond,reverse=false,limit=Infinity,attack,release,type,oneShot=false}){
 const duration=Math.min(limit,(end-start)/sourcePerSecond),sign=reverse?-1:1;
 const from=reverse?end:start,to=from+sign*duration*sourcePerSecond;
 const attackTime=Math.min(attack,duration/2)+(oneShot?.001:0);
 const attackLimit=Math.min(parameterFor('envelope.attack',type).max,duration/2);
 const releaseLimit=Math.min(parameterFor('envelope.release',type).max,oneShot?Math.max(0,duration-attackTime):duration/2);
 return {
  attack:{base:from,sign,limit:attackLimit,value:Math.min(attack,attackLimit),lead:oneShot?.001:0},
  release:{base:to,sign:-sign,limit:releaseLimit,value:Math.min(release,releaseLimit),lead:0},
  sourcePerSecond
 };
}

export function mountWaveformFades(svg,create,options,{getWindow,getCrop,xAtTime,timeAtX}){
 const handles=new Map();
 let drag=null;
 const marker=(id,d,y)=>{
  const line=create('path',{stroke:'#9bc3b8','stroke-width':1.5,fill:'none','pointer-events':'none'});
  const hit=create('rect',{width:18,height:24,y:y-12,fill:'transparent',role:'slider',tabindex:0,'aria-label':d});
  hit.classList.add('audio-trim-handle');
  svg.append(line,hit);
  handles.set(id,{line,hit,y});
  return hit;
 };
 const geometry=()=>waveformFadeRange(...getCrop(),options);
 const time=(f,value,rate)=>f.base+f.sign*(value+f.lead)*rate;
 const draw=()=>{
  const range=geometry(),window=drag?.window??getWindow();
  for(const [id,{line,hit,y}] of handles){
   const f=range[id],value=drag?.id===id?drag.value:f.value;
   const sourceTime=time(f,value,range.sourcePerSecond);
   const inView=sourceTime>=window.start&&sourceTime<=window.end;
   const x=xAtTime(sourceTime,window),end=xAtTime(f.base,window);
   line.setAttribute('d','M'+end+' '+(y+12)+' L'+x+' '+y+' V'+(y+12));
   hit.style.display=inView?'':'none';
   hit.setAttribute('x',String(clamp(x-9,0,462)));
   hit.setAttribute('aria-valuemin','0');
   hit.setAttribute('aria-valuemax',String(f.limit));
   hit.setAttribute('aria-valuenow',String(value));
   hit.setAttribute('aria-valuetext',value.toFixed(3)+' seconds');
  }
 };
 const commit=(id,value)=>{
  const f=geometry()[id];
  if(Math.abs(value-f.value)<.0005)return;
  options[id]=value;draw();options.onChange(id,value);
 };
 const quantize=(value,limit)=>Math.min(Math.floor(limit*1000+1e-7)/1000,Math.max(0,Math.round(value*1000)/1000));
 for(const [id,label,y] of [['attack','fade in',69],['release','fade out',89]]){
  const hit=marker(id,label,y);
  hit.addEventListener('pointerdown',event=>{
   if(drag||event.button!==0)return;
   event.stopPropagation();event.preventDefault();
   const range=geometry(),f=range[id],window=getWindow(),bounds=svg.getBoundingClientRect();
   const pointer=(event.clientX-bounds.left)*480/bounds.width;
   drag={id,pointerId:event.pointerId,value:f.value,window,bounds,offset:pointer-xAtTime(time(f,f.value,range.sourcePerSecond),window)};
   hit.focus({preventScroll:true});hit.setPointerCapture(event.pointerId);
  });
  hit.addEventListener('pointermove',event=>{
   if(drag?.pointerId!==event.pointerId)return;
   const range=geometry(),f=range[id];
   const x=(event.clientX-drag.bounds.left)*480/drag.bounds.width-drag.offset;
   drag.value=quantize((timeAtX(x,drag.window)-f.base)*f.sign/range.sourcePerSecond-f.lead,f.limit);
   draw();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])hit.addEventListener(type,event=>{
   if(drag?.pointerId!==event.pointerId)return;
   const {value}=drag;drag=null;draw();
   if(type==='pointerup')commit(id,value);
  });
  hit.addEventListener('keydown',event=>{
   const f=geometry()[id],step=event.shiftKey?.01:.001;
   const delta={ArrowRight:f.sign*step,ArrowLeft:-f.sign*step,ArrowUp:step,ArrowDown:-step,PageUp:.05,PageDown:-.05}[event.key];
   if(delta===undefined&&event.key!=='Home'&&event.key!=='End')return;
   event.stopPropagation();event.preventDefault();
   const value=event.key==='Home'?0:event.key==='End'?f.limit:f.value+delta;
   commit(id,quantize(value,f.limit));
  });
 }
 return draw;
}
