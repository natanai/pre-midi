// Native score JSON and binary audio have one browser save path.
import {getAsset,putAsset} from "./assetRegistry.js";
const DB="pre-midi-local",VERSION=2,STORE="drafts",ASSETS="assets",KEY="current";
let dbPromise;
function openDb(){
 if(!("indexedDB" in globalThis))return Promise.reject(Error("IndexedDB unavailable."));
 dbPromise ||= new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
   if(!db.objectStoreNames.contains(ASSETS))db.createObjectStore(ASSETS);
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 return dbPromise;
}
const done=request=>new Promise((resolve,reject)=>{
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error);
});
export async function loadDraft(){
 const db=await openDb();
 const draft=await done(db.transaction(STORE,"readonly").objectStore(STORE).get(KEY));
 const assets=await done(db.transaction(ASSETS,"readonly").objectStore(ASSETS).getAll());
 for(const row of assets)putAsset(row.id,new Uint8Array(row.bytes));
 return draft||null;
}
let queue=Promise.resolve();
export function saveDraft(score){
 const json=JSON.stringify(score);
 const assets=(score.samples||[]).map(item=>{
  const bytes=getAsset(item.id);
  if(!bytes)throw Error("Missing "+item.path+"; import the complete ZIP.");
  return {id:item.id,bytes};
 });
 queue=queue.catch(()=>{}).then(async()=>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction([STORE,ASSETS],"readwrite");
   tx.objectStore(STORE).put(json,KEY);
   const a=tx.objectStore(ASSETS);
   for(const entry of assets)a.put(entry,entry.id);
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
   tx.onabort=()=>reject(tx.error||Error("Draft save aborted."));
  });
 });
 return queue;
}
