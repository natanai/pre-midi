import {MOD_EFFECT_PARAMETERS} from './src/dsp/parameters.js';
import {modEffectRecipe,motionTable,MOTION_TABLE_SIZE} from './src/dsp/modulation-effects.js';
import {renderParameterModule} from './stereoProcessingUI.js';
import {explainLabel,helpForLabel} from './dial.js';
const ns='http://www.w3.org/2000/svg',clamp=v=>Math.max(0,Math.min(1,v));
const line=(root,d,muted=false)=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke',muted?'#666':'var(--track-accent,#08e4ec)');root.append(p);};
const text=(root,x,y,s)=>{const p=document.createElementNS(ns,'text');p.setAttribute('x',String(x));p.setAttribute('y',String(y));p.setAttribute('fill','#888');p.setAttribute('font-size','8');p.textContent=s;root.append(p);};
const fraction=(v,p)=>p.ui.log?Math.log(v/p.min)/Math.log(p.max/p.min):(v-p.min)/(p.max-p.min);
const value=(v,p)=>Math.max(p.min,Math.min(p.max,Math.round((p.ui.log?p.min*(p.max/p.min)**clamp(v):p.min+clamp(v)*(p.max-p.min))/p.ui.step)*p.ui.step));
export function renderModEffectInstance(patch,instance,onChange,onPreview,soundId,title,inactiveReason){
 const root=document.createElement('div');root.className='modulation-effect-instance';
 const index=patch.chain.instances.findIndex(n=>n.id===instance.id),prefix=['chain','instances',index,'parameters'],kind=instance.kind;
 const get=p=>p.chain.instances.find(n=>n.id===instance.id)?.parameters??instance.parameters;
 const groups=kind==='autopan'?[['rate','depth'],['phase']]:[['rate','depth'],[kind==='phaser'?'frequency':'delay','feedback'],['phase','stereo']];
 for(const [group,keys]of groups.entries()){
  const defs=keys.map(key=>MOD_EFFECT_PARAMETERS[kind][key]),names=keys.map(key=>key==='stereo'?'stereo phase':key);
  const module=renderParameterModule(patch,onChange,onPreview,soundId+'-'+instance.id,{
   kind:'mod-effect-'+kind+'-'+group,title:title+' · '+names.join(' + '),
   fields:keys.map((key,i)=>({path:[...prefix,key],get:p=>get(p)[key],config:{label:names[i],min:defs[i].min,max:defs[i].max,...defs[i].ui,help:helpForLabel(kind+' '+key),inactiveReason:inactiveReason??(key==='rate'&&get(patch).sync?'tempo sync sets the movement rate':get(patch).depth===0&&['rate','phase','stereo'].includes(key)?'movement depth is zero':undefined)}})),
   hint:'drag horizontally for '+names[0]+(names[1]?' and vertically for '+names[1]:''),
   position:values=>[20+320*fraction(values[0],defs[0]),defs.length===1?75:130-110*fraction(values[1],defs[1])],
   values:(x,y)=>defs.map((p,i)=>value(i?(130-y)/110:(x-20)/320,p)),
   draw:(svg,patch)=>{
    const p=get(patch),recipe=modEffectRecipe(kind,p,1),table=motionTable(recipe,48000),seconds=p.sync?p.sync:2;
    if(group===1&&kind!=='autopan'){
     line(svg,'M20 70 H340',true);
     if(kind==='phaser'){
      // Static six-section all-pass response at the middle frequency, blended
      // with dry sound. This is a 48 khz reference, not a live spectrum meter.
      const f=p.frequency,g=Math.tan(Math.PI*f/48000),a=(g-1)/(g+1);
      line(svg,Array.from({length:193},(_,i)=>{const w=2*Math.PI*20*1000**(i/192)/48000,c=Math.cos(w),s=Math.sin(w),den=1+2*a*c+a*a,re=(2*a+(1+a*a)*c)/den,im=-(1-a*a)*s/den,angle=6*Math.atan2(im,re),fb=p.feedback;
       const wr=Math.cos(angle),wi=Math.sin(angle),d=1-2*fb*Math.cos(angle-w)+fb*fb,hr=(1-Math.abs(fb))*(wr-fb*Math.cos(w))/d,hi=(1-Math.abs(fb))*(wi-fb*Math.sin(w))/d,db=20*Math.log10(Math.max(1e-6,Math.hypot(.5+.5*hr,.5*hi)));
       return (i?'L':'M')+(20+i/192*320)+' '+Math.max(8,Math.min(130,20-db*2.2));}).join(' '));
      text(svg,20,145,'20 hz');text(svg,300,145,'20 khz');text(svg,20,12,'notches · midpoint · 50% mix · 48 khz');
     }else{
      for(let n=0;n<10;n++){const x=20+320*p.delay*(n+1)/.12;if(x>340)break;const gain=(1-Math.abs(p.feedback))*p.feedback**n;line(svg,'M'+x+' 70 v'+(-55*gain));}
      text(svg,20,145,'0 ms');text(svg,300,145,'120 ms');text(svg,20,12,'wet echoes · midpoint');
     }
    }else{
     for(let ch=0;ch<2;ch++)line(svg,Array.from({length:193},(_,i)=>{
      const cycles=group===0&&!p.sync?i/192*2*p.rate:i/192,at=Math.floor((cycles%1)*MOTION_TABLE_SIZE)*4+ch*2;
      let y;
      if(kind==='autopan')y=125-table[at]/Math.SQRT2*100;
      else if(kind==='phaser')y=125-105*clamp(Math.log2(p.frequency/2**p.depth*2**(p.depth*(1+Math.sin(2*Math.PI*(cycles+p.phase+(ch?p.stereo:0)))))/20)/Math.log2(20000/20));
      else y=125-table[at]/48000/.06*100;
      return (i?'L':'M')+(20+i/192*320)+' '+y;
     }).join(' '),ch===1);
     text(svg,20,145,group===0?(p.sync?seconds+' beats':'two seconds'):'one cycle');text(svg,20,12,kind==='autopan'?'left + right gain':kind==='phaser'?'left + right frequency':'left + right wet delay');
    }
   },
   extra:group===0?details=>{
    const field=document.createElement('label'),word=document.createElement('span'),select=document.createElement('select');field.className='synth-field';field.dataset.soundPath=[...prefix,'sync'].join('.');word.textContent='timing';explainLabel(word,kind+' timing');select.setAttribute('aria-label',title+' timing');
    for(const n of MOD_EFFECT_PARAMETERS[kind].sync.values){const option=document.createElement('option');option.value=String(n);option.textContent=n===0?'free hz':n<1?'1/'+(1/n)+' beat':n+' beat'+(n===1?'':'s');select.append(option);}
    select.value=String(get(patch).sync);select.addEventListener('change',()=>onChange([...prefix,'sync'],Number(select.value)));field.append(word,select);details.append(field);
   }:undefined
  });
  if(group===0){const graph=module.querySelector('svg');graph.dataset.soundLinks+='|'+[...prefix,'sync'].join('.');}
  root.append(module);
 }
 return root;
}
