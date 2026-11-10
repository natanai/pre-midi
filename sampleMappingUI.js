import {captureSoundControlView,captureSoundGraphView} from './soundControlView.js';
import {SAMPLE_RANGE_FIELDS,sampleZoneRange,sampleZoneWithRange} from './src/dsp/sample-mapping.js';
import {parameterFor} from './src/dsp/parameters.js';
import {explainLabel} from './dial.js';
const NS='http://www.w3.org/2000/svg',clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function renderSampleMapping(zone,onChange,{id="sample",index=0}={}){
 const root=document.createElement('div'),area=document.createElement('div');root.dataset.visualId='sample-range-'+id+'-'+index;area.className='visual-panel-area';area.style.cssText='position:relative;height:180px';
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 360 150');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label','sample key and velocity region');svg.style.cssText='width:100%;height:100%';
 const rect=document.createElementNS(NS,'rect');rect.setAttribute('fill','#777');rect.setAttribute('fill-opacity','.3');rect.setAttribute('stroke','currentColor');svg.append(rect);
 const text=(x,y,s)=>{const n=document.createElementNS(NS,'text');n.setAttribute('x',x);n.setAttribute('y',y);n.setAttribute('fill','currentColor');n.setAttribute('font-size','10');n.textContent=s;svg.append(n);};text(18,145,'key →');text(18,12,'velocity ↑');
 area.append(svg);root.append(area);const message=document.createElement('output');message.setAttribute('role','status');
 let values=sampleZoneRange(zone);const points=[];
 const paint=()=>{const x=20+320*values.keyLow/127,y=130-110*values.velocityHigh;rect.setAttribute('x',x);rect.setAttribute('y',y);rect.setAttribute('width',320*(values.keyHigh-values.keyLow)/127);rect.setAttribute('height',110*(values.velocityHigh-values.velocityLow));for(const p of points){p.button.style.left=(20+320*values[p.key]/127)/360*100+'%';p.button.style.top=(130-110*values[p.velocity])/150*100+'%';p.button.setAttribute('aria-description','key '+values[p.key]+', velocity '+values[p.velocity]);}};
 const commit=(fields,control)=>{const restore=control?.classList.contains('visual-graph-point')?captureSoundGraphView(control):control?captureSoundControlView(control):()=>{};try{const next=sampleZoneWithRange(zone,fields);message.textContent='';onChange(next);restore();}catch(error){message.textContent=error.message;if(control)control.value=String(sampleZoneRange(zone)[control.dataset.field]);}values=sampleZoneRange(zone);paint();};
 for(const [key,velocity,label]of [['keyLow','velocityLow','lower key / velocity boundary'],['keyHigh','velocityHigh','upper key / velocity boundary']]){
  const button=document.createElement('button');button.type='button';button.className='visual-graph-point';button.dataset.handle=key;button.setAttribute('aria-label',label);button.title='drag horizontally for key and vertically for velocity';area.append(button);points.push({button,key,velocity});let drag=null;
  button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();button.focus();button.setPointerCapture(e.pointerId);drag=e.pointerId;});
  button.addEventListener('pointermove',e=>{if(e.pointerId!==drag)return;const r=area.getBoundingClientRect(),low=key==='keyLow';values[key]=Math.round(clamp(((e.clientX-r.left)/r.width*360-20)/320*127,low?0:values.keyLow,low?values.keyHigh:127));values[velocity]=Math.round(clamp((130-(e.clientY-r.top)/r.height*150)/110,low?0:values.velocityLow,low?values.velocityHigh:1)*100)/100;paint();});
  button.addEventListener('pointerup',e=>{if(e.pointerId!==drag)return;drag=null;commit({[key]:values[key],[velocity]:values[velocity]},button);});button.addEventListener('pointercancel',()=>{drag=null;values=sampleZoneRange(zone);paint();});
  button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const field=e.key==='ArrowLeft'||e.key==='ArrowRight'?key:velocity,p=parameterFor('zones.'+field,'sample'),value=values[field]+(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1)*p.ui.step;commit({[field]:clamp(Number(value.toFixed(2)),p.min,p.max)},button);});
 }
 const controls=document.createElement('div');controls.className='vocal-timing';root.append(controls);
 for(const [key,label]of [['keyLow','lowest key'],['keyHigh','highest key'],['velocityLow','softest velocity'],['velocityHigh','hardest velocity']]){
  const p=parameterFor('zones.'+key,'sample'),field=document.createElement('label'),word=document.createElement('span'),input=document.createElement('input');field.className='vocal-number';field.dataset.soundPath='zones.'+index+'.'+key;word.textContent=label;explainLabel(word,key.startsWith('key')?'sample key range':'sample velocity range');input.type='number';input.min=p.min;input.max=p.max;input.step=p.ui.step;input.value=values[key];input.setAttribute('aria-label',label);input.dataset.field=key;
  input.addEventListener('change',()=>{if(input.reportValidity())commit({[key]:Number(input.value)},input);});field.append(word,input);controls.append(field);
 }
 const reset=document.createElement('button');reset.type='button';reset.textContent='[reset range]';reset.addEventListener('click',()=>{const next={...zone};for(const key of SAMPLE_RANGE_FIELDS)delete next[key];onChange(next);});root.append(reset,message);paint();return root;
}
