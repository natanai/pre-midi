// Native score JSON and binary audio have one browser save path.
import {getAsset,putAsset} from "./assetRegistry.js";
const DB="pre-midi-local",VERSION=2,STORE="drafts",ASSETS="assets",KEY="current";
let dbPromise;
const persistedAssets=new Set();
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
 for(const row of assets){putAsset(row.id,new Uint8Array(row.bytes));persistedAssets.add(row.id);}
 return draft||null;
}
let pendingDraft=null,saving=false,waiters=[];
// Coalesce rapid knob/row edits; immutable recordings are written once per ID.
// A later save always follows the transaction in flight, so a reset cannot be
// overwritten by an older queued score.
export function saveDraft(score){
 pendingDraft={json:JSON.stringify(score),samples:[...score.samples]};
 const result=new Promise((resolve,reject)=>waiters.push({resolve,reject}));
 if(!saving){saving=true;void flushDrafts();}
 return result;
}
async function flushDrafts(){
 while(pendingDraft){
  const next=pendingDraft,batch=waiters;pendingDraft=null;waiters=[];
  try{
   const db=await openDb();
   const assets=next.samples.filter(asset=>!persistedAssets.has(asset.id)).map(asset=>{
    const bytes=getAsset(asset.id);
    if(!bytes)throw Error("Missing "+asset.path+"; import the complete ZIP.");
    return {id:asset.id,bytes};
   });
   await new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,ASSETS],"readwrite");
    tx.objectStore(STORE).put(next.json,KEY);
    for(const entry of assets)tx.objectStore(ASSETS).put(entry,entry.id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Draft save aborted."));
   });
   for(const asset of assets)persistedAssets.add(asset.id);
   for(const waiter of batch)waiter.resolve();
  }catch(error){for(const waiter of batch)waiter.reject(error);}
 }
 saving=false;
}
// Presets share immutable audio bytes with drafts but never replace the draft.
export async function savePresetAssets(samples){
 const entries=samples.filter(asset=>!persistedAssets.has(asset.id)).map(asset=>{
  const bytes=getAsset(asset.id);
  if(!bytes)throw Error("Missing "+asset.path);
  return {id:asset.id,bytes};
 });
 if(!entries.length)return;
 const db=await openDb();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(ASSETS,"readwrite");
  for(const entry of entries)tx.objectStore(ASSETS).put(entry,entry.id);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 for(const entry of entries)persistedAssets.add(entry.id);
}
