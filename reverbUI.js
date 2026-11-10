import {defaultReverb} from './src/dsp/reverb.js';
import {REVERB_PARAMETERS} from './src/dsp/parameters.js';
import {renderParameterModule} from './stereoProcessingUI.js';
import {helpForLabel} from './dial.js';
const ns='http://www.w3.org/2000/svg';
const path=(root,d,muted=false)=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',d);p.setAttribute('stroke',muted?'#666':'var(--track-accent,#08e4ec)');p.setAttribute('fill','none');root.append(p);};
const text=(root,x,y,value)=>{const p=document.createElementNS(ns,'text');p.setAttribute('x',x);p.setAttribute('y',y);p.setAttribute('fill','#888');p.setAttribute('font-size','8');p.textContent=value;root.append(p);};
export function renderReverb(patch,onChange,onPreview,id){
 const root=document.createElement('div'),base={...patch,reverb:patch.reverb??defaultReverb()};
 const fraction=(v,p)=>(v-p.min)/(p.max-p.min),value=(v,p)=>Math.max(p.min,Math.min(p.max,Math.round((p.min+Math.max(0,Math.min(1,v))*(p.max-p.min))/p.ui.step)*p.ui.step));
 for(const keys of [['preDelay','decay'],['damping','size'],['mix','width']]){
  const defs=keys.map(key=>REVERB_PARAMETERS[key]),names=keys.map(key=>key==='preDelay'?'pre-delay':key),kind='reverb-'+keys.join('-');
  root.append(renderParameterModule(base,onChange,onPreview,id,{
   kind,title:'reverb · '+names.join(' + '),
   fields:keys.map((key,i)=>({path:['reverb',key],get:p=>(p.reverb??defaultReverb())[key],config:{label:names[i],min:defs[i].min,max:defs[i].max,...defs[i].ui,help:helpForLabel('reverb '+key),inactiveReason:patch.chain?.bypass.includes('reverb')?'reverb is bypassed':base.reverb.mix===0&&key!=='mix'?'reverb mix is zero':undefined}})),
   hint:'drag horizontally for '+names[0]+' and vertically for '+names[1],
   position:values=>[20+320*fraction(values[0],defs[0]),130-110*fraction(values[1],defs[1])],
   values:(x,y)=>defs.map((p,i)=>value(i?(130-y)/110:(x-20)/320,p)),
   draw:(svg,patch)=>{
    const p=patch.reverb??defaultReverb();
    if(keys[0]==='mix'){
     path(svg,'M20 130 H340',true);
     for(let i=0;i<13;i++){const spread=(i-6)/6*p.width,x=180+spread*145,level=p.mix*(.4+.6*Math.cos(i*1.7)**2);path(svg,'M'+x+' 130 v'+(-90*level));}
     path(svg,'M180 130 v'+(-90*(1-p.mix)),true);text(svg,20,145,'left');text(svg,310,145,'right');text(svg,20,15,'dry + stereo room');
    }else{
     const length=6.2;
     for(const bright of [false,true]){
      const decay=p.decay/(bright?1+3*p.damping:1),start=p.preDelay;
      const d=Array.from({length:161},(_,i)=>{const t=i/160*length,db=t<start?-72:-60*(t-start)/decay;return (i?'L':'M')+(20+i*2)+' '+(130-105*Math.max(0,(db+72)/72));}).join(' ');path(svg,d,bright);
     }
     if(keys[0]==='damping')for(let t=p.preDelay+.032*(.5+p.size);t<length;t+=.17*(.5+p.size))path(svg,'M'+(20+t/length*320)+' 130 v'+(-60*Math.exp(-t/p.decay)),true);
     text(svg,20,145,'0 seconds');text(svg,290,145,'6.2 seconds');text(svg,20,15,keys[0]==='damping'?'dark + bright decay reference':'decay reference · 60 db');
    }
   }
  }));
 }
 return root;
}
