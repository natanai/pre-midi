import {renderDynamicsInstance} from './dynamicsUI.js';
import {DYNAMICS_KINDS} from './src/dsp/dynamics.js';
import {processorField,processorInactiveReason} from './src/dsp/processing-graph.js';
import {renderParameterModule} from './stereoProcessingUI.js';
import {renderEqualizer} from './equalizerUI.js';
import {modeledFilterResponse} from './filterIllustrationResponse.js';
import {driveCurve} from './audioEffects.js';
import {explainLabel} from './dial.js';
const NS='http://www.w3.org/2000/svg',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const path=(root,points)=>{const p=document.createElementNS(NS,'path');p.setAttribute('d',points);p.setAttribute('stroke','var(--track-accent,#08e4ec)');p.setAttribute('fill','none');p.setAttribute('stroke-width','1.5');root.append(p);};
export function renderProcessorInstance(patch,instance,onChange,onPreview,soundId,title){
 const inactiveReason=processorInactiveReason(patch,instance.id);
 if(DYNAMICS_KINDS.includes(instance.kind))return renderDynamicsInstance(patch,instance,onChange,onPreview,soundId,title,inactiveReason);
 const index=patch.chain.instances.findIndex(p=>p.id===instance.id),prefix=['chain','instances',index,'parameters'];
 const get=p=>p.chain.instances.find(n=>n.id===instance.id)?.parameters??instance.parameters;
 if(instance.kind==='eq'){
  const facade={eq:instance.parameters,chain:{version:1,order:['eq'],bypass:patch.chain.bypass.includes(instance.id)?['eq']:[]}};
  const adapter=apply=>(keys,value)=>{
   const changes=Array.isArray(keys[0])?keys.map((k,i)=>[k,value[i]]):[[keys,value]];
   const eq=changes.find(([k])=>k[0]==='eq');if(eq)apply(prefix,eq[1]);
  };
  const root=renderEqualizer(facade,adapter(onChange),adapter(onPreview),soundId+'-'+instance.id,{inactiveReason});
  root.querySelector('summary').textContent=title;
  for(const element of root.querySelectorAll('[data-sound-path],[data-sound-links]')){
   for(const key of ['soundPath','soundLinks'])if(element.dataset[key])element.dataset[key]=element.dataset[key].split('|').map(p=>p==='eq'?prefix.join('.'):p.startsWith('eq.')?prefix.join('.')+p.slice(2):p).join('|');
  }
  const draw=root.drawSoundIllustration;root.drawSoundIllustration=next=>draw({eq:get(next)});return root;
 }
 const fields=instance.kind==='drive'?[{path:[...prefix,'amount'],get:p=>get(p).amount,config:processorField('drive','amount','distortion')}]:[
  {path:[...prefix,'cutoff'],get:p=>get(p).cutoff,config:processorField('filter','cutoff','brightness')},
  {path:[...prefix,'resonance'],get:p=>get(p).resonance,config:processorField('filter','resonance','resonance')}
 ];
 for(const field of fields)field.config={...field.config,inactiveReason};
 return renderParameterModule(patch,onChange,onPreview,soundId+'-'+instance.id,{
  kind:'processor-'+instance.kind,title,fields,
  hint:instance.kind==='filter'?'drag horizontally for brightness and vertically for resonance':'drag horizontally for distortion',
  position:values=>instance.kind==='drive'?[20+320*values[0],135]:[20+320*Math.log(values[0]/50)/Math.log(280),130-100*Math.log(values[1]/.1)/Math.log(160)],
  values:(x,y)=>instance.kind==='drive'?[Math.round(clamp((x-20)/320,0,1)*100)/100]:[Math.round(50*280**clamp((x-20)/320,0,1)),Math.round(.1*160**clamp((130-y)/100,0,1)*10)/10],
  draw:(root,p)=>{
   const params=get(p);
   if(instance.kind==='drive'){
    const curve=driveCurve(params.amount),compensation=1/(1+params.amount*1.1);
    path(root,Array.from({length:129},(_,i)=>{const at=Math.round(i/128*1023),input=2*i/128-1,value=params.amount?curve[at]*compensation:input;return (i?'L':'M')+(20+320*i/128)+' '+(70-value*55);}).join(' '));
   }else path(root,Array.from({length:161},(_,i)=>{
    const frequency=20*1000**(i/160),first=modeledFilterResponse(params,frequency).magnitude,
     rest=modeledFilterResponse({...params,quality:Math.SQRT1_2},frequency).magnitude;
    const db=20*Math.log10(Math.max(1e-9,first*rest**((params.stages??1)-1)));
    return (i?'L':'M')+(20+320*i/160)+' '+clamp(65-db*2,5,135);
   }).join(' '));
  },
  extra:instance.kind==='filter'?(details)=>{
   const fields=document.createElement('div');fields.className='synth-fields';
   for(const [key,label,options]of [['type','filter type',['lowpass','highpass','bandpass','notch']],['stages','filter slope',[1,2,4]]]){
    const field=document.createElement('label'),word=document.createElement('span'),select=document.createElement('select');field.className='synth-field';word.textContent=label;explainLabel(word,label);select.setAttribute('aria-label',title+' '+label);
    field.dataset.soundPath=[...prefix,key].join('.');
    for(const value of options){const option=document.createElement('option');option.value=String(value);option.textContent=key==='stages'?value*12+' db/oct':value;select.append(option);}
    select.value=String(get(patch)[key]??1);select.addEventListener('change',()=>onChange([...prefix,key],key==='stages'?Number(select.value):select.value));field.append(word,select);fields.append(field);
   }details.append(fields);
  }:undefined
 });
}
