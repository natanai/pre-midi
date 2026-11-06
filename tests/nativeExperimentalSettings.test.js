import test from 'node:test';
import assert from 'node:assert/strict';
import {installAudioSettings} from '../desktopAudioUI.js';

const element=(tag,text='')=>({
 tag,textContent:text,children:[],style:{},hidden:false,value:'',
 setAttribute(name,value){this[name]=value;},
 append(...children){this.children.push(...children);},
 prepend(...children){this.children.unshift(...children);},
 addEventListener(){},
});
const walk=node=>[node,...(node.children??[]).flatMap(walk)];

test('Windows streaming field-test switch is opt-in, described, and returns to normal native path',()=>{
 const originals={
  localStorage:globalThis.localStorage,window:globalThis.window,
  document:globalThis.document,setInterval:globalThis.setInterval
 };
 const store=new Map([['premidi-audio-backend','native']]),events=[];
 let savedToggle,menu;
 globalThis.localStorage={
  getItem:key=>store.get(key)??null,
  setItem:(key,value)=>store.set(key,String(value))
 };
 globalThis.window={addEventListener(){},dispatchEvent:e=>events.push(e.type)};
 globalThis.document={getElementById:()=>element('button')};
 globalThis.setInterval=()=>0;
 try{
  const list=element('section');menu=element('details');
  installAudioSettings(list,{element,prompt:async()=>{},menu});
  const controls=walk(list);
  savedToggle=controls.find(c=>c.tag==='input'&&c['aria-label']==='test long Song streaming (experimental)');
  assert.ok(savedToggle,'A native Song preview checkbox must be reachable from audio settings');
  assert.equal(savedToggle.checked,false,'Experimental audio must never enable itself');
  assert.match(controls.map(x=>x.textContent).join(' '),/seeking, recording and live edits will stop playback/);
  assert.equal(store.get('premidi-native-song-streaming'),undefined);
  savedToggle.checked=true;savedToggle.onchange();
  assert.equal(store.get('premidi-native-song-streaming'),'experimental');
  assert.deepEqual(events,['premidi-audio-mode'],'Native engine switches must cancel the active owner');
  savedToggle.checked=false;savedToggle.onchange();
  assert.equal(store.get('premidi-native-song-streaming'),'off');
  assert.deepEqual(events,['premidi-audio-mode','premidi-audio-mode']);
  assert.equal(store.get('premidi-audio-backend'),'native',"Checkbox must not switch the native engine to Web Audio");
 }finally{
  for(const [key,value] of Object.entries(originals)){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
 }
});
