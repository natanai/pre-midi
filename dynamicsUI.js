import {DYNAMICS_PARAMETERS} from './src/dsp/parameters.js';
import {compressionDb} from './src/dsp/dynamics.js';
import {DynamicsKernel,deesserBand} from './src/dsp/dynamics-kernel.js';
import {renderParameterModule} from './stereoProcessingUI.js';
import {helpForLabel} from './dial.js';
const ns='http://www.w3.org/2000/svg',clamp=v=>Math.max(0,Math.min(1,v));
const line=(root,d,muted=false)=>{const path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('stroke',muted?'#666':'var(--track-accent,#08e4ec)');path.setAttribute('fill','none');root.append(path);};
const label=(root,x,y,text)=>{const n=document.createElementNS(ns,'text');n.setAttribute('x',String(x));n.setAttribute('y',String(y));n.setAttribute('fill','#888');n.setAttribute('font-size','8');n.textContent=text;root.append(n);};
const fraction=(v,p)=>p.unit==='seconds'?Math.log((v+.001)/(p.min+.001))/Math.log((p.max+.001)/(p.min+.001)):p.ui.log?Math.log(v/p.min)/Math.log(p.max/p.min):(v-p.min)/(p.max-p.min);
const value=(t,p)=>{const v=p.unit==='seconds'?(p.min+.001)*((p.max+.001)/(p.min+.001))**clamp(t)-.001:p.ui.log?p.min*(p.max/p.min)**clamp(t):p.min+clamp(t)*(p.max-p.min);return Math.max(p.min,Math.min(p.max,Math.round(v/p.ui.step)*p.ui.step));};
export function renderDynamicsInstance(patch,instance,onChange,onPreview,soundId,title,inactiveReason){
 const root=document.createElement('div');root.className='dynamics-instance';const index=patch.chain.instances.findIndex(n=>n.id===instance.id),prefix=['chain','instances',index,'parameters'];
 const get=p=>p.chain.instances.find(n=>n.id===instance.id)?.parameters??instance.parameters;
 const groups=instance.kind==='compressor'?[['threshold','ratio'],['knee','makeup'],['attack','release']]:instance.kind==='gate'?[['threshold','range'],['attack','release'],['hold']]:instance.kind==='deesser'?[['frequency','bandwidth'],['threshold','amount'],['attack','release']]:[['release','threshold']];
 for(const [group,keys]of groups.entries()){
  const controls=keys.map(key=>DYNAMICS_PARAMETERS[key]),transfer=keys.includes('ratio')||keys.includes('range')||keys.includes('knee')||keys.includes('amount');
  const names=keys.map(key=>instance.kind==='limiter'&&key==='threshold'?'ceiling':key);
  root.append(renderParameterModule(patch,onChange,onPreview,soundId+'-'+instance.id,{
   kind:'dynamics-'+instance.kind+'-'+group,title:title+' · '+names.join(' + '),
   fields:keys.map((key,i)=>({path:[...prefix,key],get:p=>get(p)[key],config:{label:names[i],min:controls[i].min,max:controls[i].max,...controls[i].ui,help:helpForLabel(instance.kind+' '+key),inactiveReason:inactiveReason??(instance.kind==='compressor'&&get(patch).ratio===1&&!['ratio','makeup'].includes(key)?'compression ratio is one':instance.kind==='gate'&&get(patch).range===0&&key!=='range'?'gate range is zero':instance.kind==='deesser'&&get(patch).amount===0&&key!=='amount'?'de-essing amount is zero':undefined)}})),
   hint:'drag horizontally for '+names[0]+(names[1]?' and vertically for '+names[1]:''),
   position:values=>[20+320*fraction(values[0],controls[0]),keys.length===1?75:130-110*fraction(values[1],controls[1])],
   values:(x,y)=>keys.map((_,i)=>value(i?(130-y)/110:(x-20)/320,controls[i])),
   draw:(svg,p)=>{
    const params=get(p);
    if(keys.includes('frequency')){
     const [b0,b1,b2,a1,a2]=deesserBand(params,48000),gain=10**(-params.amount/20)-1;
     const curve=Array.from({length:193},(_,i)=>{
      const frequency=1000*14**(i/192),w=2*Math.PI*frequency/48000,
       nr=b0+b1*Math.cos(w)+b2*Math.cos(2*w),ni=-b1*Math.sin(w)-b2*Math.sin(2*w),
       dr=1+a1*Math.cos(w)+a2*Math.cos(2*w),di=-a1*Math.sin(w)-a2*Math.sin(2*w),den=dr*dr+di*di,
       re=(nr*dr+ni*di)/den,im=(ni*dr-nr*di)/den,
       db=20*Math.log10(Math.max(1e-12,Math.hypot(1+gain*re,gain*im)));
      return (i?'L':'M')+(20+i/192*320)+' '+(25-100*db/24);
     }).join(' ');
     line(svg,'M20 25 H340',true);line(svg,curve);label(svg,20,145,'1 khz');label(svg,310,145,'14 khz');label(svg,20,12,'maximum cut · 48 khz reference');
    }else if(transfer){
     line(svg,'M20 130 L340 42',true);
     const curve=Array.from({length:193},(_,i)=>{const input=-96+i*.5;let output=input;
      if(instance.kind==='compressor')output+=compressionDb(input,params)+params.makeup;
      else if(instance.kind==='deesser')output+=Math.max(-params.amount,Math.min(0,params.threshold-input));
      else if(input<params.threshold)output-=params.range;
      return (i?'L':'M')+(20+i/192*320)+' '+(130-110*clamp((output+96)/120));
     }).join(' ');line(svg,curve);label(svg,20,145,instance.kind==='deesser'?'band input db':'input db');label(svg,245,12,instance.kind==='deesser'?'band output db':'output db');
    }else{
     const defaults=Object.fromEntries(Object.entries(DYNAMICS_PARAMETERS).map(([key,p])=>[key,p.default])),recipe={...defaults,...params,kind:instance.kind,mix:1},kernel=new DynamicsKernel(recipe,1000);
     const processed=[],level=10**(params.threshold/20);
     for(let i=0;i<1000;i++){
      const input=i<100?level*.01:i<500?level*2:level*.5,gain=kernel.gain(input),normalized=gain/(instance.kind==='compressor'?10**(params.makeup/20):1);
      if(i%4===0)processed.push((processed.length?'L':'M')+(20+i/999*320)+' '+(130-95*clamp(normalized)));
     }
     line(svg,'M20 35 H340',true);line(svg,'M52 25 V135 M180 25 V135',true);line(svg,processed.join(' '));label(svg,20,145,'one second reference');label(svg,245,12,'gain response');label(svg,54,23,'loud');label(svg,182,23,'quiet');
    }
   }
  }));
 }
 return root;
}
