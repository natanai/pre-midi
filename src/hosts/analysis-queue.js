// Only one expensive analysis render may prepare at a time. Superseded UI
// snapshots are checked before entering native/Worker preparation, not merely
// discarded after occupying the audio control queue.
export function createAnalysisQueue(){
 let pending=Promise.resolve();
 return (isCurrent,work)=>{
  const result=pending.then(async()=>{if(!isCurrent())return null;const value=await work();return isCurrent()?value:null;});
  pending=result.catch(()=>{});return result;
 };
}
