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
 panel().open=true;add('filter');assert.ok(cutoff(0));cutoff(0).focus();cutoff(0).dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
 const edited=Number(cutoff(0).getAttribute('aria-valuenow'));assert.equal(edited,8001);assert.equal(document.activeElement,cutoff(0));
 add('filter');assert.equal(Number(cutoff(1).getAttribute('aria-valuenow')),8000);assert.equal(Number(cutoff(0).getAttribute('aria-valuenow')),edited);
 button('add-route').click();const routing=button('filter-1-route');routing.value='route-1';routing.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(button('filter-1-route').value,'route-1');assert.equal(Number(cutoff(0).getAttribute('aria-valuenow')),edited);
 const dry=()=>button('dry-blend');dry().focus();dry().dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(Number(dry().getAttribute('aria-valuenow')),.01);assert.equal(document.activeElement,dry());
 document.getElementById('undo').click();assert.equal(Number(dry().getAttribute('aria-valuenow')),0);document.getElementById('redo').click();assert.equal(Number(dry().getAttribute('aria-valuenow')),.01);
 const toggle=button('filter-1-toggle');toggle.click();assert.equal(button('filter-1-toggle').checked,false);assert.equal(Number(cutoff(0).getAttribute('aria-valuenow')),edited);
 [...document.querySelectorAll('.sound-panel-view button')].find(b=>b.textContent==='combined').click();cutoff(0).focus();
 assert.ok([...document.querySelectorAll('.sound-combined-figure:not([hidden])')].some(el=>el.dataset.visualId.includes('filter-1')));
 add('drive');assert.ok(document.querySelector('[data-sound-path="chain.instances.2.parameters.amount"] [role="slider"]'));
 document.getElementById('undo').click();assert.equal(document.querySelector('[data-sound-path="chain.instances.2.parameters.amount"]'),null);
 const deadline=Date.now()+3000;
 while(document.getElementById('status').dataset.saving==='true'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
 assert.notEqual(document.getElementById('status').dataset.saving,'true','queued edit saves settle before closing the host');
 assert.deepEqual(errors,[]);console.log('PASS shared processor creation, independent edits, route changes, blend undo/redo, bypass, focus and combined illustrations');
}finally{await w.happyDOM.close();}
