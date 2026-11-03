// Pre-midi phone PWA offline shell. Generated at Pages staging: no dev/build files cached.
// Explicit manifest is the complete current module closure, excluding sample audio.
const VERSION="__BUILD__";
const ASSETS=__ASSETS__;
const CACHE="pre-midi-phone-"+VERSION;
const base=new URL("./",self.registration.scope);
const urls=ASSETS.map(path=>new URL(path,base).href);
const allowed=new Set(urls);
const factoryUrls=__FACTORY_SAMPLES__.map(path=>new URL(path,base).href);
const factorySet=new Set(factoryUrls);
self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(urls);
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith("pre-midi-phone-")&&name!==CACHE)
   await caches.delete(name);
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const request=new URL(event.request.url);
 if(request.origin!==base.origin)return;
 // The entry may be requested as /phone/, and modules may carry ?build=… .
 const lookup=request.pathname.endsWith("/phone/")?
  new URL("phone/index.html",base).href:request.origin+request.pathname;
 if(!allowed.has(lookup)&&!factorySet.has(lookup))return; // Desktop and arbitrary URLs remain untouched.
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const hit=await cache.match(lookup);
  if(hit)return hit;
  return fetch(event.request);
 })());
});

// User-triggered download of factory recordings. A partial failure keeps already
// verified files, so retrying never discards the working offline editor shell.
self.addEventListener("message",event=>{
 if(event.data?.kind!=="PREMIDI_CACHE_FACTORY")return;
 const client=event.source;
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE),total=factoryUrls.length;
  let completed=0;
  for(const url of factoryUrls){
   try{
    if(!await cache.match(url)){
     const response=await fetch(url,{cache:"reload"});
     if(!response.ok)throw Error("HTTP "+response.status);
     await cache.put(url,response);
    }
    completed++;
    client?.postMessage({kind:"PREMIDI_FACTORY_PROGRESS",done:completed,total});
   }catch(error){
    client?.postMessage({kind:"PREMIDI_FACTORY_FAILED",done:completed,total,error:String(error.message||error)});
    return;
   }
  }
  client?.postMessage({kind:"PREMIDI_FACTORY_READY",done:completed,total});
 })());
});
