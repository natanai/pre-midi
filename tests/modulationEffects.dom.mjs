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
 const cutoff=i=>document.querySelector('[data-sound-path="chain.instances.'+i+'.parameters.cutoff"] [role="slider"]');
 panel().open=true;for(const kind of ['chorus','flanger','phaser','autopan'])add(kind);
 const parameter=(i,key)=>document.querySelector('[data-sound-path="chain.instances.'+i+'.parameters.'+key+'"] [role="slider"]');
 for(const [i,key]of [[0,'delay'],[1,'feedback'],[2,'frequency'],[3,'depth']])assert.ok(parameter(i,key));
 assert.equal(document.querySelectorAll('.post-processing-order > ol > li').length,4);
 parameter(0,'depth').focus();parameter(0,'depth').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));assert.ok(Number(parameter(0,'depth').getAttribute('aria-valuenow'))>.004);
 const figure=parameter(2,'frequency').closest('.visual-sound-panel'),handle=figure.querySelector('.visual-graph-point');handle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.ok(Number(parameter(2,'frequency').getAttribute('aria-valuenow'))>900);
 document.getElementById('undo').click();assert.equal(Number(parameter(2,'frequency').getAttribute('aria-valuenow')),900);document.getElementById('redo').click();assert.ok(Number(parameter(2,'frequency').getAttribute('aria-valuenow'))>900);
 const timing=()=>document.querySelector('[data-sound-path="chain.instances.0.parameters.sync"] select');timing().value='2';timing().dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(timing().value,'2');assert.equal(Number(parameter(0,'rate').getAttribute('aria-valuenow')),.5);
 button('chorus-1-down').click();assert.equal(document.querySelector('.post-processing-order li input').dataset.processingControl,'flanger-1-toggle');
 button('chorus-1-toggle').click();assert.equal(button('chorus-1-toggle').checked,false);assert.equal(timing().value,'2');button('chorus-1-toggle').click();
 button('phaser-1-remove').click();assert.equal(parameter(2,'frequency'),null);document.getElementById('undo').click();assert.ok(parameter(2,'frequency'));
 [...document.querySelectorAll('.sound-panel-view button')].find(button=>button.textContent==='combined').click();parameter(3,'phase').focus();assert.ok([...document.querySelectorAll('.sound-combined-figure:not([hidden])')].some(el=>el.dataset.visualId.includes('autopan-1')));
 const deadline=Date.now()+3000;
 while(document.getElementById('status').dataset.saving==='true'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
 assert.notEqual(document.getElementById('status').dataset.saving,'true','queued edit saves settle before closing the host');
 assert.deepEqual(errors,[]);console.log('PASS shared modulation effects editors, sync, post order, direct illustrations, history, bypass/remove and combined view');
}catch(error){console.error(error);throw error;}
finally{
 const deadline=Date.now()+3000;
 while(document.getElementById('status')?.dataset.saving==='true'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
 await w.happyDOM.close();
 Object.assign(globalThis,timers);
}
