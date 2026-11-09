// Focused shared-Inspector integration. DOM coverage is not visual acceptance.
const {Window}=await import(process.env.DOM_MODULE??'happy-dom');
import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,''),w=new Window({url:'http://localhost:8000',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,enableJavaScriptEvaluation:false}});w.document.write(await readFile(root+'/index.html','utf8'));
for(const key of ['window','document','navigator','localStorage','sessionStorage','HTMLElement','Element','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','SVGElement','CustomEvent','Event','KeyboardEvent','MouseEvent','Node','DOMParser','MutationObserver','ResizeObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','indexedDB'])if(key in w)Object.defineProperty(globalThis,key,{value:w[key],configurable:true,writable:true});
w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({canvas:{width:300,height:100},measureText:()=>({width:10})},{get:(o,k)=>o[k]??(()=>{})});
const errors=[];w.addEventListener('error',e=>errors.push(e.error||e.message));
try{
 await import(pathToFileURL(root+'/studio.js'));
 const panel=()=>document.querySelector('.parameter-automation');
 const target=()=>panel().querySelector('[aria-label="automation target"]');
 const add=name=>{target().value=name;[...panel().querySelectorAll('button')].find(button=>button.textContent==='+ automation').click();};
 add('pan');add('amplitude');assert.equal(panel().querySelectorAll('.automation-lane').length,2);
 const pan=()=>panel().querySelector('[data-automation-id]'),input=()=>pan().querySelector('[aria-label="end value"]');
 input().value='.7';input().dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(Number(input().value),.7);assert.equal(document.activeElement,input());
 document.getElementById('undo').click();assert.equal(Number(input().value),0);document.getElementById('redo').click();assert.equal(Number(input().value),.7);
 const mode=pan().querySelector('select');mode.value='step';mode.dispatchEvent(new w.Event('change',{bubbles:true}));
 const graph=pan().querySelector('.visual-graph-point');assert.ok(graph);graph.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 assert.equal(Number(pan().querySelector('[aria-label="begin step"]').value),1);
 const enabled=pan().querySelector('input[type="checkbox"]');enabled.click();assert.equal(pan().querySelector('input[type="checkbox"]').checked,false);
 [...pan().querySelectorAll('button')].find(button=>button.textContent==='remove lane').click();assert.equal(panel().querySelectorAll('.automation-lane').length,1);document.getElementById('undo').click();assert.equal(panel().querySelectorAll('.automation-lane').length,2);
 const deadline=Date.now()+3000;
 while(document.getElementById('status').dataset.saving==='true'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
 assert.notEqual(document.getElementById('status').dataset.saving,'true','queued edit saves settle before closing the host');
 assert.deepEqual(errors,[]);console.log('PASS shared parameter lanes: independent edits, undo/redo, focus, interpolation, two-axis point editing and bypass/remove');
}finally{await w.happyDOM.close();}
