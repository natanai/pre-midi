// Focused shared-Inspector integration. DOM coverage is not visual acceptance.
const {Window}=await import(process.env.DOM_MODULE??'happy-dom');
import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,''),w=new Window({url:'http://localhost:8000',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,enableJavaScriptEvaluation:false}});w.document.write(await readFile(root+'/index.html','utf8'));
for(const key of ['window','document','navigator','localStorage','sessionStorage','HTMLElement','Element','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','SVGElement','CustomEvent','Event','KeyboardEvent','MouseEvent','Node','DOMParser','MutationObserver','ResizeObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','indexedDB'])if(key in w)Object.defineProperty(globalThis,key,{value:w[key],configurable:true,writable:true});
w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({canvas:{width:300,height:100},measureText:()=>({width:10})},{get:(o,k)=>o[k]??(()=>{})});
const errors=[];w.addEventListener('error',e=>errors.push(e.error||e.message));
try{
 await import(pathToFileURL(root+'/studio.js'));
 const panel=()=>document.querySelector('.processing-chain'),button=id=>panel().querySelector('[data-processing-control="'+id+'"]');
 const add=kind=>{button('instance-type').value='new:'+kind;button('add-instance').click();};
 const cutoff=i=>document.querySelector('[data-sound-path="chain.instances.'+i+'.parameters.cutoff"] [role="slider"]');
 panel().open=true;add('compressor');add('gate');add('limiter');
 const parameter=(i,key)=>document.querySelector('[data-sound-path="chain.instances.'+i+'.parameters.'+key+'"] [role="slider"]');
 assert.ok(parameter(0,'ratio'));assert.ok(parameter(1,'hold'));assert.ok(parameter(2,'threshold'));
 assert.equal(document.querySelectorAll('.post-processing-order > ol > li').length,3);
 parameter(0,'ratio').focus();parameter(0,'ratio').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));assert.equal(Number(parameter(0,'ratio').getAttribute('aria-valuenow')),4.1);
 const figure=parameter(0,'ratio').closest('.visual-sound-panel'),handle=figure.querySelector('.visual-graph-point');handle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(Number(parameter(0,'threshold').getAttribute('aria-valuenow')),-17.9);
 document.getElementById('undo').click();assert.equal(Number(parameter(0,'threshold').getAttribute('aria-valuenow')),-18);document.getElementById('redo').click();assert.equal(Number(parameter(0,'threshold').getAttribute('aria-valuenow')),-17.9);
 button('compressor-1-down').click();assert.equal(document.querySelector('.post-processing-order li input').dataset.processingControl,'gate-1-toggle');
 button('compressor-1-toggle').click();assert.equal(button('compressor-1-toggle').checked,false);assert.equal(Number(parameter(0,'ratio').getAttribute('aria-valuenow')),4.1);
 button('gate-1-remove').click();assert.equal(parameter(1,'hold'),null);document.getElementById('undo').click();assert.ok(parameter(1,'hold'));
 [...document.querySelectorAll('.sound-panel-view button')].find(button=>button.textContent==='combined').click();parameter(1,'hold').focus();assert.ok([...document.querySelectorAll('.sound-combined-figure:not([hidden])')].some(el=>el.dataset.visualId.includes('gate-1')));
 const deadline=Date.now()+3000;
 while(document.getElementById('status').dataset.saving==='true'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
 assert.notEqual(document.getElementById('status').dataset.saving,'true','queued edit saves settle before closing the host');
 assert.deepEqual(errors,[]);console.log('PASS shared dynamics editors, post-level order, direct illustrations, history, bypass/remove and combined view');
}finally{await w.happyDOM.close();}
