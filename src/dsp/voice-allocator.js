// Host-neutral scheduling policy, evaluated on a control thread, not an audio callback.
// Half-open [start,end) reservations. Release tails consume voices; shared FX do not.
export const DEFAULT_POLYPHONY=64;
export const STEAL_FADE_SECONDS=.005;
export class VoiceAllocator{
 constructor(limit=DEFAULT_POLYPHONY){
  if(!Number.isInteger(limit)||limit<1||limit>256)throw Error("Invalid polyphony limit");
  this.limit=limit;this.records=[];this.sequence=0;this.stolen=0;
 }
 prune(time){this.records=this.records.filter(record=>record.end>time);}
 admit({start,release,end,priority=0},now=0){
  if(![start,release,end,now].every(Number.isFinite)||start<now||release<start||end<=start)
   throw Error("Invalid voice interval");
  this.prune(now);
  const record={id:++this.sequence,start,release,end,priority,order:this.sequence};
  const steals=[];
  // Also handle previously queued strums with later onsets. No allocation decision
  // is made from wall-clock order or from the order of AudioNode ended callbacks.
  const boundaries=[start,...this.records.filter(r=>r.start>start&&r.start<end).map(r=>r.start)].sort((a,b)=>a-b);
  for(const at of boundaries){
   let active=this.records.filter(r=>r.start<=at&&r.end>at);
   while(active.length>=this.limit){
    active.sort((a,b)=>a.priority-b.priority||Number(a.release>at)-Number(b.release>at)||a.start-b.start||a.order-b.order);
    const victim=active.shift();victim.end=at;this.stolen++;
    steals.push({id:victim.id,at});
   }
  }
  this.records.push(record);
  return {id:record.id,steals};
 }
 clear(){this.records=[];}
 activeAt(time){return this.records.filter(r=>r.start<=time&&r.end>time).length;}
}
