import {stereoSample} from './src/dsp/stereo.js';
import {createDial} from './dial.js';
import {captureSoundGraphView} from './soundControlView.js';
import {soundParameterPath,readSoundParameter,soundField} from './soundParameterAdapter.js';
const NS='http://www.w3.org/2000/svg',openStates=new Map(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function module(patch,onChange,onPreview,id,{kind,title,fields,position,values,draw,extra}){
 const root=document.createElement('div');root.className='visual-sound-panel';root.dataset.visualId=kind+'-'+id;root.dataset.visualKind=kind;
 const details=document.createElement('details');details.className='synth-group';details.open=openStates.get(kind+'-'+id)??false;details.addEventListener('toggle',()=>openStates.set(kind+'-'+id,details.open));const summary=document.createElement('summary');summary.textContent=title;details.append(summary);root.append(details);
 const area=document.createElement('div');area.className='visual-panel-area';const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 360 150');svg.style.width='100%';svg.style.touchAction='none';area.append(svg);details.append(area);
 const marks=document.createElementNS(NS,'g'),point=document.createElementNS(NS,'circle');point.setAttribute('r','5');point.setAttribute('fill','var(--track-accent,#08e4ec)');point.setAttribute('stroke','currentColor');point.setAttribute('tabindex','0');point.setAttribute('role','button');point.setAttribute('aria-label',title+' two-axis control');point.classList.add('visual-graph-point');point.dataset.handle='main';const hint=document.createElementNS(NS,'title');hint.textContent=kind==='stereo-image'?'drag horizontally for width and vertically for mid side balance':'drag horizontally for echo tone and vertically for feedback';point.append(hint);svg.append(marks,point);
 const knobs=[];let latest=patch,drag=null;
 const paths=fields.map(f=>f.path),read=p=>fields.map(f=>f.get(p));svg.dataset.soundLinks=paths.map(p=>p.join('.')).concat(kind==='stereo-delay'?['delayPingPong']:[]).join('|');
 const paint=p=>{latest=p;marks.replaceChildren();draw(marks,p);const xy=position(read(p));point.setAttribute('cx',xy[0]);point.setAttribute('cy',xy[1]);knobs.forEach((k,i)=>k.setDialDisplayValue(read(p)[i]));};
 const preview=next=>{const p=structuredClone(patch);fields.forEach((f,i)=>{let owner=p;for(const key of f.path.slice(0,-1))owner=owner[key]??={};owner[f.path.at(-1)]=next[i];});paint(p);onPreview(paths,next);};
 const commit=next=>{const restore=captureSoundGraphView(point);onChange(paths,next);restore();};
 const panel=document.createElement('div');panel.className='synth-fields';for(const [i,f]of fields.entries()){
  const dial=createDial(f.config,f.get(patch),value=>onChange(f.path,value),value=>{const next=read(latest);next[i]=value;preview(next);});dial.dataset.soundPath=f.path.join('.');knobs.push(dial);panel.append(dial);
 }details.append(panel);extra?.(details,patch,onChange);
 point.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();point.focus({preventScroll:true});point.setPointerCapture(e.pointerId);drag=e.pointerId;});
 point.addEventListener('pointermove',e=>{if(drag!==e.pointerId)return;const r=svg.getBoundingClientRect();preview(values((e.clientX-r.left)/r.width*360,(e.clientY-r.top)/r.height*150));});
 point.addEventListener('pointerup',e=>{if(drag!==e.pointerId)return;drag=null;commit(read(latest));});point.addEventListener('pointercancel',()=>{drag=null;paint(patch);onPreview(paths,read(patch));});
 point.addEventListener('keydown',e=>{const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];if(!keys.includes(e.key))return;e.preventDefault();const v=read(latest);if(e.key==='ArrowLeft'||e.key==='ArrowRight')v[0]=fields[0].config.log?v[0]*(e.key==='ArrowLeft'?1/1.1:1.1):v[0]+(e.key==='ArrowLeft'?-.02:.02);else v[1]+=e.key==='ArrowUp'?.02:-.02;commit(v.map((n,i)=>clamp(n,fields[i].config.min,fields[i].config.max)));});
 root.drawSoundIllustration=paint;paint(patch);return root;
}
const node=(root,tag,attrs,text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;root.append(n);return n;};
export function renderStereoImage(patch,onChange,onPreview,id){return module(patch,onChange,onPreview,id,{
 kind:'stereo-image',title:'stereo image',fields:[
 {path:['stereoWidth'],get:p=>p.stereoWidth??1,config:soundField('stereoWidth',patch.type,{label:'stereo width'})},
 {path:['msBalance'],get:p=>p.msBalance??0,config:soundField('msBalance',patch.type,{label:'mid side balance'})}],
 position:([w,b])=>[20+160*w,75-50*b],values:(x,y)=>[Math.round(clamp((x-20)/160,0,2)*100)/100,Math.round(clamp((75-y)/50,-1,1)*100)/100],
 draw:(root,p)=>{for(const ch of [0,1]){const d=Array.from({length:161},(_,i)=>{const t=i/160*Math.PI*6,mid=.3*Math.sin(t),side=.2*Math.cos(t*1.5),v=stereoSample(mid+side,mid-side,p.stereoWidth??1,p.msBalance??0)[ch];return (i?'L':'M')+(20+2*i)+' '+(45+ch*60-32*v);}).join(' ');node(root,'path',{d,stroke:'var(--track-accent,#08e4ec)',fill:'none','stroke-width':1.5});node(root,'text',{x:5,y:28+ch*60,fill:'#888','font-size':8},ch?'right':'left');}node(root,'text',{x:18,y:144,fill:'#888','font-size':8},'stereo reference');}
 });}
export function renderDelayStereo(patch,onChange,onPreview,id){const feedbackPath=soundParameterPath('effects.delayFeedback',patch.type),inactiveReason=readSoundParameter(patch,'effects.delayMix')===0?'turn up delay to hear the echoes':undefined;return module(patch,onChange,onPreview,id,{
 kind:'stereo-delay',title:'echo stereo + tone',fields:[
 {path:['delayTone'],get:p=>p.delayTone??20000,config:soundField('delayTone',patch.type,{label:'echo tone',log:true,inactiveReason})},
 {path:feedbackPath,get:p=>readSoundParameter(p,'effects.delayFeedback'),config:soundField('effects.delayFeedback',patch.type,{label:'feedback',inactiveReason})}],
 position:([tone,fb])=>[20+320*Math.log(tone/20)/Math.log(1000),130-80*fb/.8],values:(x,y)=>[Math.round(20*1000**clamp((x-20)/320,0,1)),Math.round(clamp((130-y)/80*.8,0,.8)*100)/100],
 draw:(root,p)=>{const tone=p.delayTone??20000,fb=readSoundParameter(p,'effects.delayFeedback'),alpha=1-Math.exp(-2*Math.PI*tone/48000),phase=2*Math.PI*2000/48000,loss=tone>=20000?1:alpha/Math.hypot(1-(1-alpha)*Math.cos(phase),(1-alpha)*Math.sin(phase));for(let i=0;i<6;i++){const x=32+i*56,level=(fb*loss)**i;for(const ch of p.delayPingPong?[i%2]:[0,1])node(root,'path',{d:'M'+x+' '+(42+ch*42)+' v'+(-25*level),stroke:'var(--track-accent,#08e4ec)','stroke-width':2});}node(root,'text',{x:15,y:145,fill:'#888','font-size':8},'2 khz reference');},
 extra:(details,p,change)=>{const label=document.createElement('label'),box=document.createElement('input');label.className='synth-field';label.dataset.soundPath='delayPingPong';box.type='checkbox';box.checked=!!p.delayPingPong;box.setAttribute('aria-label','ping pong delay');box.addEventListener('change',()=>change(['delayPingPong'],box.checked));label.append(box,document.createTextNode('ping-pong'));label.title='fold the send to mono and alternate echoes left and right';details.append(label);}
 });}
