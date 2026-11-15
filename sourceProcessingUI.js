import {nearestScaleNote,pitchClassMask} from './src/dsp/pitch-correction.js';
import {SCALE_MODES,SCALE_ROOTS} from './scaleGuide.js';
import {sourceSettings} from './src/dsp/source-processing.js';
import {SOURCE_PROCESSING_PARAMETERS,parameterFor} from './src/dsp/parameters.js';
import {renderParameterModule} from './stereoProcessingUI.js';
import {helpForLabel,explainLabel} from './dial.js';
const ns='http://www.w3.org/2000/svg',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function renderSourceProcessing(patch,onChange,onPreview,id){
 const root=document.createElement('div'),base={...patch,sourceProcessing:sourceSettings(patch)},transpose=parameterFor('transpose','sample'),time=SOURCE_PROCESSING_PARAMETERS.time,formant=SOURCE_PROCESSING_PARAMETERS.formant;
 const path=(svg,d,muted=false)=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke',muted?'#666':'var(--track-accent,#08e4ec)');svg.append(p);};
 const action=(svg,x,text,key,p)=>{const button=document.createElementNS(ns,'text');button.setAttribute('x',String(x));button.setAttribute('y','27');button.setAttribute('tabindex','0');button.setAttribute('role','button');button.setAttribute('aria-pressed',String(sourceSettings(p)[key]));button.setAttribute('fill','currentColor');button.setAttribute('font-size','9');button.setAttribute('aria-label',text);button.textContent='['+text+']';const commit=()=>onChange(['sourceProcessing',key],!sourceSettings(p)[key]);button.addEventListener('click',commit);button.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();commit();}});svg.append(button);};
 const label=(svg,x,y,s)=>{const p=document.createElementNS(ns,'text');p.setAttribute('x',x);p.setAttribute('y',y);p.setAttribute('fill','#888');p.setAttribute('font-size','8');p.textContent=s;svg.append(p);};
 const pitchModule=renderParameterModule(base,onChange,onPreview,id,{
  kind:'source-pitch-time',title:'source pitch + time',
  fields:[{path:['transpose'],get:p=>p.transpose,config:{label:'transpose',min:transpose.min,max:transpose.max,...transpose.ui,help:helpForLabel('source transpose')}},{path:['sourceProcessing','time'],get:p=>sourceSettings(p).time,config:{label:'stretch',min:time.min,max:time.max,...time.ui,help:helpForLabel('source stretch')}}],
  hint:'drag horizontally for pitch and vertically for duration',position:([pitch,t])=>[20+320*(pitch+24)/48,130-110*(t-.5)/1.5],values:(x,y)=>[Math.round(clamp((x-20)/320*48-24,-24,24)),Math.round(clamp(.5+(130-y)/110*1.5,.5,2)*100)/100],
  draw:(svg,p)=>{const s=sourceSettings(p),length=s.time/(s.mode==='rate'?2**(p.transpose/12):1),cycles=s.mode==='rate'?3:3*2**(p.transpose/12);path(svg,'M20 80 H340',true);path(svg,Array.from({length:321},(_,i)=>{const t=i/320*4,v=t<=length?Math.sin(2*Math.PI*cycles*(s.reverse?length-t:t)/(s.mode==='rate'?s.time:1))*.7*Math.exp(-2*(s.reverse?length-t:t)/Math.max(.01,length)):0;return(i?'L':'M')+(20+i)+' '+(80-35*v);}).join(' '));label(svg,20,145,'four-second timing reference');action(svg,230,'reverse','reverse',p);},
  extra:details=>{const field=document.createElement('label'),word=document.createElement('span'),select=document.createElement('select');field.className='synth-field';field.dataset.soundPath='sourceProcessing.mode';word.textContent='pitch mode';explainLabel(word,'source pitch mode');select.setAttribute('aria-label','source pitch mode');for(const [value,text]of [['rate','pitch + speed'],['independent','independent pitch']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=sourceSettings(patch).mode;select.addEventListener('change',()=>onChange(['sourceProcessing','mode'],select.value));field.append(word,select);details.append(field);}
 });pitchModule.querySelector('svg').dataset.soundLinks+='|sourceProcessing.mode';root.append(pitchModule);
 const formantModule=renderParameterModule(base,onChange,onPreview,id,{
  kind:'source-formant',title:'source formants',fields:[{path:['sourceProcessing','formant'],get:p=>sourceSettings(p).formant,config:{label:'formant shift',min:formant.min,max:formant.max,...formant.ui,help:helpForLabel('source formant')}}],hint:'drag horizontally for formant shift',position:([f])=>[20+320*(f+12)/24,75],values:x=>[Math.round(clamp((x-20)/320*24-12,-12,12)*10)/10],
  draw:(svg,p)=>{const settings=sourceSettings(p),shift=2**((settings.formant+(settings.mode==='independent'&&!settings.preserveFormants?p.transpose:0))/12);for(const muted of [true,false])path(svg,Array.from({length:161},(_,i)=>{const f=100*60**(i/160),gain=[500,1500,2500].reduce((sum,center)=>sum+Math.exp(-(((Math.log2(f/(center*(muted?1:shift))))/.22)**2)),0);return(i?'L':'M')+(20+i*2)+' '+(130-80*gain);}).join(' '),muted);label(svg,20,145,'100 hz');label(svg,300,145,'6 khz');label(svg,20,12,'synthetic vowel envelope');action(svg,190,'preserve formants','preserveFormants',p);},
  extra:details=>{for(const [key,text]of [['preserveFormants','preserve formants'],['reverse','reverse source']]){const field=document.createElement('label'),box=document.createElement('input'),word=document.createElement('span');field.className='synth-field';field.dataset.soundPath='sourceProcessing.'+key;box.type='checkbox';box.checked=sourceSettings(patch)[key];box.setAttribute('aria-label',text);word.textContent=text;explainLabel(word,'source '+key);box.addEventListener('change',()=>onChange(['sourceProcessing',key],box.checked));field.append(word,box);details.append(field);}}
 });formantModule.querySelector('svg').dataset.soundLinks+='|sourceProcessing.preserveFormants';root.append(formantModule);
 const amount=SOURCE_PROCESSING_PARAMETERS.tuneAmount,response=SOURCE_PROCESSING_PARAMETERS.tuneResponse;
 const tuning=renderParameterModule(base,onChange,onPreview,id,{
  kind:'source-tuning',title:'pitch correction',
  fields:[
   {path:['sourceProcessing','tuneResponse'],get:p=>sourceSettings(p).tuneResponse,config:{min:response.min,max:response.max,...response.ui,label:'response',help:helpForLabel('tuning response'),inactiveReason:base.sourceProcessing.tuneAmount===0?'correction amount is zero':undefined}},
   {path:['sourceProcessing','tuneAmount'],get:p=>sourceSettings(p).tuneAmount,config:{min:amount.min,max:amount.max,...amount.ui,label:'correction',help:helpForLabel('tuning correction')}}
  ],
  hint:'drag horizontally for response and vertically for correction amount',
  position:([speed,amount])=>[20+320*(speed-.02)/.28,116-90*amount],
  values:(x,y)=>[Math.round(clamp(.02+(x-20)*.28/320,.02,.3)*1000)/1000,Math.round(clamp((116-y)/90,0,1)*100)/100],
  draw:(svg,p)=>{
   const settings=sourceSettings(p),scale=SCALE_MODES.find(mode=>mode.id===settings.tuneScale);
   const mask=pitchClassMask(settings.tuneRoot,[...scale.steps,...(scale.descendingSteps??[])]);
   const input=69.35,target=nearestScaleNote(input,mask),shift=clamp((target-input)*settings.tuneAmount,-3,3);
   const y=value=>68-value*17;
   path(svg,'M20 '+y(target-input)+' H340',true);
   path(svg,Array.from({length:161},(_,i)=>(i?'L':'M')+(20+i*2)+' '+y(shift*(1-Math.exp(-i/160*.45/settings.tuneResponse)))).join(' '));
   label(svg,20,143,'single-note reference');
   label(svg,200,143,'target '+SCALE_ROOTS[(target+120)%12].split(' / ')[0]);
  },
  extra:details=>{
   for(const [key,title,choices] of [['tuneScale','scale',SCALE_MODES.map(scale=>[scale.id,scale.name])],['tuneRoot','key',SCALE_ROOTS.map((root,index)=>[index,root])]]){
    const field=document.createElement('label'),word=document.createElement('span'),select=document.createElement('select');
    field.className='synth-field';field.dataset.soundPath='sourceProcessing.'+key;word.textContent=title;
    explainLabel(word,'tuning '+title);select.setAttribute('aria-label','pitch correction '+title);
    for(const [value,name] of choices){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}
    select.value=base.sourceProcessing[key];
    if(key==='tuneRoot'&&base.sourceProcessing.tuneScale==='chromatic'){select.disabled=true;select.setAttribute('aria-description','chromatic correction uses all twelve notes');}
    select.addEventListener('change',()=>onChange(['sourceProcessing',key],key==='tuneRoot'?Number(select.value):select.value));
    field.append(word,select);details.append(field);
   }
  }
 });
 tuning.querySelector('summary').setAttribute('aria-description','for a single voice or pitched instrument. chords and mixed tracks are unsupported');
 tuning.querySelector('svg').dataset.soundLinks+='|sourceProcessing.tuneRoot|sourceProcessing.tuneScale';
 root.append(tuning);return root;
}
