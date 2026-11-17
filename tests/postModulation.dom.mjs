// Focused shared-Inspector integration. DOM coverage is not visual acceptance.
const {Window}=await import(process.env.DOM_MODULE??'happy-dom');
import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,''),w=new Window({url:'http://localhost:8000',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,enableJavaScriptEvaluation:false}});w.document.write(await readFile(root+'/index.html','utf8'));
for(const key of ['window','document','navigator','localStorage','sessionStorage','HTMLElement','Element','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','SVGElement','CustomEvent','Event','KeyboardEvent','MouseEvent','Node','DOMParser','MutationObserver','ResizeObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','indexedDB'])if(key in w)Object.defineProperty(globalThis,key,{value:w[key],configurable:true,writable:true});
w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({canvas:{width:300,height:100},measureText:()=>({width:10})},{get:(o,k)=>o[k]??(()=>{})});
// Let the browser harness own and cancel its preview/debounce timers on close.
const timers=Object.fromEntries(['setTimeout','clearTimeout','setInterval','clearInterval'].map(key=>[key,globalThis[key]]));
for(const key of Object.keys(timers))globalThis[key]=w[key].bind(w);
const errors=[];w.addEventListener('error',e=>errors.push(e.error||e.message));
try{
 await import(pathToFileURL(root+'/studio.js'));
 const panel=()=>document.querySelector('.processing-chain'),button=id=>panel().querySelector('[data-processing-control="'+id+'"]');
 const add=kind=>{button('instance-type').value='new:'+kind;button('add-instance').click();};
 panel().open=true;add('compressor');
 const movement=()=>document.querySelector('.modulation-editor');
 movement().open=true;[...movement().querySelectorAll('button')].find(button=>button.textContent==='add movement').click();
 const target=()=>movement().querySelector('[aria-label="movement target 1"]');
 assert.ok([...target().options].some(option=>option.value==='processor.compressor-1.threshold'));
 target().value='processor.compressor-1.threshold';target().dispatchEvent(new w.Event('change',{bubbles:true}));
 const depth=()=>movement().querySelector('[data-sound-path="modulation.routes.0.depth"] [role="slider"]');
 assert.equal(Number(depth().getAttribute('aria-valuemax')),96);
 depth().focus();depth().dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
 assert.equal(Number(depth().getAttribute('aria-valuenow')),1.1);
 document.getElementById('undo').click();assert.equal(Number(depth().getAttribute('aria-valuenow')),1);
 document.getElementById('undo').click();assert.equal(target().value,'filter.cutoff');
 document.getElementById('redo').click();assert.equal(target().value,'processor.compressor-1.threshold');
 add('chorus');target().value='processor.chorus-1.delay';target().dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(Number(depth().getAttribute('aria-valuemax')),.035);
 depth().dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
 assert.ok(Number(depth().getAttribute('aria-valuenow'))<=.035);
 button('chorus-1-toggle').click();assert.equal(target().value,'processor.chorus-1.delay');
 button('chorus-1-toggle').click();assert.equal(target().value,'processor.chorus-1.delay');
 assert.deepEqual(errors,[]);
 console.log('PASS shared movement target editing, units, undo and processor bypass retention');
}finally{
 w.happyDOM.abort();w.close();Object.assign(globalThis,timers);
}
