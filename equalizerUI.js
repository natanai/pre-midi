import {defaultEq,eqMagnitude,EQ_TYPES,addEqBand,removeEqBand} from './src/dsp/equalizer.js';
import {withProcessorAdded,processorBypassed} from './src/dsp/processing-chain.js';
import {createDial} from './dial.js';
import {captureSoundGraphView} from './soundControlView.js';
const NS='http://www.w3.org/2000/svg',openStates=new Map();
export function renderEqualizer(patch,onChange,onPreview=()=>{},soundId='sound',options={}){
 const root=document.createElement('div');root.className='visual-sound-panel';root.dataset.visualId='eq-'+soundId;root.dataset.visualKind='equalizer';
 const details=document.createElement('details');details.className='synth-group';details.open=openStates.get(soundId)??patch.eq?.bands.some(b=>b.enabled)??false;details.addEventListener('toggle',()=>openStates.set(soundId,details.open));
 const title=document.createElement('summary');title.textContent='equalizer';details.append(title);root.append(details);
 const area=document.createElement('div');area.className='visual-panel-area';const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 360 150');svg.style.width='100%';svg.style.touchAction='none';svg.setAttribute('aria-label','equalizer response, measured sound output and editable bands');svg.dataset.soundLinks='eq';area.append(svg);details.append(area);
 const make=(tag,attrs)=>{const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
 svg.append(make('path',{d:'M18 75H342',stroke:'#666','stroke-dasharray':'3 3',fill:'none'}));const curve=make('path',{stroke:'var(--track-accent,#08e4ec)',fill:'none','stroke-width':1.5});
 const measured=make('path',{stroke:'#aaa',fill:'none','stroke-width':1,'stroke-dasharray':'3 2'});svg.append(measured,curve);
 const spectrumCaption=make('text',{x:199,y:14,fill:'#aaa','font-size':8});spectrumCaption.textContent='dashed · output dbfs';
 const responseCaption=make('text',{x:24,y:14,fill:'var(--track-accent,#08e4ec)','font-size':8});responseCaption.textContent='eq response · db';svg.append(responseCaption,spectrumCaption);
 for(const [px,py,text]of [[18,147,'20 hz'],[194,147,'1 khz'],[310,147,'20 khz'],[2,24,'+24'],[2,73,'0 db'],[2,126,'−24']]){const label=make('text',{x:px,y:py,fill:'#888','font-size':8});label.textContent=text;svg.append(label);}
 let eqRate=48000;
 const circles=[],dials=[],read=()=>patch.eq??defaultEq(),x=f=>18+324*Math.log(f/20)/Math.log(1000),y=g=>75-g*2;
 const draw=eq=>{eq??=defaultEq();curve.setAttribute('d',Array.from({length:180},(_,i)=>{const frequency=20*1000**(i/179),db=20*Math.log10(Math.max(1e-12,eqMagnitude(eq,Math.min(frequency,eqRate*.499),eqRate)));return (i?'L':'M')+(18+324*i/179).toFixed(2)+' '+Math.max(5,Math.min(145,y(db))).toFixed(2);}).join(' '));eq.bands.forEach((band,i)=>{if(!circles[i])return;for(const key of ["frequency","gain","q"])dials[i]?.[key]?.setDialDisplayValue(band[key]);circles[i].setAttribute('cx',x(band.frequency));circles[i].setAttribute('cy',['highpass','lowpass'].includes(band.type)?123-96*Math.log(band.q/.1)/Math.log(180):y(band.gain));circles[i].setAttribute('fill',band.enabled&&!processorBypassed(patch,'eq')?'var(--track-accent,#08e4ec)':'#111');circles[i].setAttribute('aria-label','band '+(i+1)+' '+band.frequency+' hz '+band.gain+' db q '+band.q);});};
 const next=(i,changes)=>{const eq=structuredClone(read());eq.bands[i]={...eq.bands[i],...changes};return eq;};
 const commit=(eq,restore=()=>{})=>{openStates.set(soundId,true);onChange([['eq'],['chain']],[eq,withProcessorAdded(patch,'eq')]);restore();};
 let drag=null,previewEq=null;
 read().bands.forEach((band,i)=>{
  const point=make('circle',{r:5,stroke:'currentColor',tabindex:0,role:'button'});point.classList.add('visual-graph-point');point.dataset.handle=band.id;const help=make('title',{});help.textContent=['highpass','lowpass'].includes(band.type)?'drag frequency and q; arrow keys edit frequency and q':'drag frequency and gain; wheel changes q; arrow keys edit frequency and gain';point.append(help);svg.append(point);circles.push(point);dials.push({});
  point.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();drag={id:event.pointerId,index:i};previewEq=structuredClone(read());point.focus({preventScroll:true});point.setPointerCapture(event.pointerId);});
  point.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId)return;const rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*360,py=(event.clientY-rect.top)/rect.height*150;previewEq.bands[i]={...previewEq.bands[i],enabled:true,frequency:Math.round(20*1000**Math.max(0,Math.min(1,(px-18)/324))),...(['highpass','lowpass'].includes(band.type)?{q:Math.round(.1*180**Math.max(0,Math.min(1,(123-py)/96))*100)/100}:{gain:Math.round(Math.max(-24,Math.min(24,(75-py)/2))*10)/10})};draw(previewEq);onPreview([['eq'],['chain']],[previewEq,withProcessorAdded(patch,'eq')]);});
  point.addEventListener('pointerup',event=>{if(drag?.id!==event.pointerId)return;drag=null;commit(previewEq,captureSoundGraphView(point));});
  point.addEventListener('pointercancel',()=>{drag=null;draw(read());onPreview(['eq'],read());});
  point.addEventListener('wheel',event=>{if(['lowshelf','highshelf'].includes(band.type))return;event.preventDefault();commit(next(i,{enabled:true,q:Math.max(.1,Math.min(18,band.q+(event.deltaY<0?.1:-.1)))}),captureSoundGraphView(point));},{passive:false});
  point.addEventListener('keydown',event=>{const scale=event.shiftKey?1.01:1.1;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();commit(next(i,{enabled:true,...(event.key==='ArrowLeft'||event.key==='ArrowRight'?{frequency:Math.max(20,Math.min(20000,Math.round(band.frequency*(event.key==='ArrowLeft'?1/scale:scale))))}:(['highpass','lowpass'].includes(band.type)?{q:Math.max(.1,Math.min(18,band.q*(event.key==='ArrowUp'?1.1:1/1.1)))}:{gain:Math.max(-24,Math.min(24,band.gain+(event.key==='ArrowUp'?1:-1)))}))}),captureSoundGraphView(point));});
  const fields=document.createElement('div');fields.className='synth-fields';const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=band.enabled;box.setAttribute('aria-label','enable eq band '+(i+1));box.addEventListener('change',()=>commit(next(i,{enabled:box.checked})));label.append(box,document.createTextNode('band '+(i+1)));fields.append(label);
  const types=document.createElement('select');types.setAttribute('aria-label','eq band '+(i+1)+' type');for(const type of EQ_TYPES){const option=document.createElement('option');option.value=type;option.textContent=type;types.append(option);}types.value=band.type;types.addEventListener('change',()=>commit(next(i,{type:types.value,enabled:true})));fields.append(types);
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','remove eq band '+(i+1));remove.title='remove this equalizer band';remove.addEventListener('click',()=>commit(removeEqBand(read(),band.id)));fields.append(remove);
  for(const [key,label,min,max,step,display]of [['frequency','frequency',20,20000,1,'hz'],['gain','gain',-24,24,.1,'db'],['q','q',.1,18,.01,'number']]){
   const inactiveReason=options.inactiveReason??(processorBypassed(patch,'eq')?'equalizer is bypassed':undefined)??(key==='gain'&&['highpass','lowpass'].includes(band.type)?'pass filters use frequency and q':key==='q'&&['lowshelf','highshelf'].includes(band.type)?'shelves use a fixed monotonic slope':undefined);
   const dial=createDial({label,min,max,step,display,log:key==='frequency',inactiveReason,help:key==='frequency'?'where this band changes the sound':key==='gain'?'boost or cut this frequency range':'how narrow this band sounds'},band[key],value=>commit(next(i,{[key]:value,enabled:true})),value=>{const eq=next(i,{[key]:value,enabled:true});draw(eq);onPreview([['eq'],['chain']],[eq,withProcessorAdded(patch,'eq')]);});dial.dataset.soundPath='eq.bands.'+i+'.'+key;dials[i][key]=dial;fields.append(dial);
  }details.append(fields);
 });
 const add=document.createElement('button');add.type='button';add.textContent='+ eq band';add.disabled=read().bands.length>=8;add.addEventListener('click',()=>commit(addEqBand(read())));details.append(add);
 const scaleLabels=[[-96,132],[-48,79],[0,25]].map(([value,py])=>{
  const label=make('text',{x:357,y:py,fill:'#aaa','font-size':7,'text-anchor':'end'});label.textContent=value;label.style.display='none';svg.append(label);return label;
 });
 let displayedEq=read();
 root.setMeasuredSpectrum=spectrum=>{
  spectrumCaption.style.display=spectrum?'':'none';
  for(const label of scaleLabels)label.style.display=spectrum?'':'none';
  if(!spectrum){measured.removeAttribute('d');return;}
  const {rate,binHz,decibels}=spectrum;
  const end=Math.min(decibels.length-1,Math.floor(20000/binHz));
  const positions=Array.from({length:200},(_,i)=>{
   const frequency=20*1000**(i/199),upper=20*1000**((i+.5)/199);
   const first=Math.max(1,Math.round(frequency/binHz)),last=Math.min(end,Math.round(upper/binHz));
   if(first>end)return null;
   let level=-96;
   for(let bin=first;bin<=last;bin++)level=Math.max(level,decibels[bin]);
   return (i?'L':'M')+x(frequency).toFixed(2)+' '+(25-107*Math.min(0,level)/96).toFixed(2);
  });
  measured.setAttribute('d',positions.filter(Boolean).join(' '));
  if(eqRate!==rate){eqRate=rate;draw(displayedEq);}
 };
 spectrumCaption.style.display='none';draw(displayedEq);
 root.drawSoundIllustration=nextPatch=>{displayedEq=nextPatch.eq;draw(displayedEq);};return root;
}
