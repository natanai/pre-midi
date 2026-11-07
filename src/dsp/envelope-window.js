// Crop an authored envelope onto a new playback clock without retriggering it.
// Events use the sample-plan convention: 0=set, 1=linear ramp to this point.
export function envelopeValueAt(events,time){
 let previous=events[0];
 if(time<previous.time)return 0;
 for(const event of events.slice(1)){
  if(time<event.time)return event.kind===1&&event.time>previous.time?
   previous.value+(event.value-previous.value)*(time-previous.time)/(event.time-previous.time):previous.value;
  previous=event;
 }
 return previous.value;
}
export function windowEnvelope(events,elapsed,start){
 return [{kind:0,time:start,value:envelopeValueAt(events,elapsed)},
  ...events.filter(event=>event.time>elapsed).map(event=>({...event,time:start+event.time-elapsed}))];
}
