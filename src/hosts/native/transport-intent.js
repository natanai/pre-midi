// Transport clicks have their own short queue. They never wait for asset
// decoding, seek reconstruction, live edits, page refills or offline exports.
// Keep IPC submission ordered even when a caller clicks pause/resume quickly.
export function createNativePauseControl({request,owner,isStopped,looping=()=>false,onChange}){
 let pending=Promise.resolve(),paused=false,generation=0;
 const set=value=>{
  if(isStopped())return Promise.resolve();
  const before=paused,change=++generation;
  paused=value;onChange(value);
  const result=pending.then(()=>{
   if(isStopped())return;
   return request({action:'control',command:value?2:3,looping:!!looping(),owner});
  });
  pending=result.catch(()=>{});
  return result.catch(error=>{
   if(!isStopped()&&generation===change){paused=before;onChange(before);}
   throw error;
  });
 };
 return {pause:()=>set(true),resume:()=>set(false)};
}
