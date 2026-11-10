import assert from 'node:assert/strict';const {Window}=await import(process.env.DOM_MODULE??'happy-dom'),w=new Window();
for(const key of ['window','document','HTMLElement','Element','SVGElement','Event','KeyboardEvent','CustomEvent','Node','getComputedStyle'])if(key in w)Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?w[key].bind(w):w[key],configurable:true});
const {renderSampleMapping}=await import('../sampleMappingUI.js');
try{
 let zone={assetId:'r',root:60,keyLow:48,keyHigh:72,velocityLow:.1,velocityHigh:.9,loop:{start:.2,end:.5,crossfade:.02}},edits=0;
 const host=document.createElement('section');host.id='mapping-test';host.className='sound-section';document.body.append(host);
 const draw=()=>host.replaceChildren(renderSampleMapping(zone,next=>{zone=next;edits++;draw();},{id:'mapping-test'}));draw();
 const lower=()=>host.querySelector('[aria-label="lower key / velocity boundary"]');lower().focus();lower().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(zone.keyLow,49);assert.equal(document.activeElement,lower());assert.deepEqual(zone.loop,{start:.2,end:.5,crossfade:.02});
 lower().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));assert.equal(zone.velocityLow,.11);
 const max=host.querySelector('[aria-label="highest key"]');max.value='40';max.dispatchEvent(new Event('change'));assert.equal(zone.keyHigh,72);assert.match(host.querySelector('output').textContent,/minimum/);assert.equal(edits,2);
 [...host.querySelectorAll('button')].find(b=>b.textContent==='[reset range]').click();assert.equal(zone.keyLow,undefined);assert.equal(zone.velocityLow,undefined);assert.equal(zone.root,60);assert.equal(zone.assetId,'r');
 console.log('PASS key/velocity region graph edits, focus across reconstruction, rejected inversion and reset with source identity intact');
}finally{await w.happyDOM.close();}
