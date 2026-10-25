// Large, self-contained music documents belong in IndexedDB rather than the
// ~5 MB localStorage quota. One score, one durable browser draft save path.
const DB="pre-midi-local",VERSION=1,STORE="drafts",KEY="current";
let dbPromise;
function openDb(){
 if(!("indexedDB" in globalThis))return Promise.reject(Error("IndexedDB unavailable"));
 dbPromise ||= new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,VERSION);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 return dbPromise;
}
export async function loadDraft(){
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readonly");
  const request=tx.objectStore(STORE).get(KEY);
  request.onsuccess=()=>resolve(request.result||null);
  request.onerror=()=>reject(request.error);
 });
}
let queue=Promise.resolve();
export function saveDraft(score){
 // Serialize immediately: edits may mutate the next frame.
 const json=JSON.stringify(score);
 queue=queue.catch(()=>{}).then(async()=>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite");
   tx.objectStore(STORE).put(json,KEY);
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
  });
 });
 return queue;
}
