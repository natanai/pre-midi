// Keep Song time zero on a render-quantum boundary. A seek may choose another
// wall-clock origin, but every Clip retains its original control-quantum phase.
export function alignedTimelineStart(context,step,unit,lead=.07){
 const quantum=128/context.sampleRate,earliest=context.currentTime+lead;
 return Math.ceil((earliest-step*unit)/quantum)*quantum+step*unit;
}
