import {validParameterValue} from './parameters.js';
// Loop endpoints are absolute source seconds; crossfade overlaps the loop's
// tail with its head. Playback resumes after the overlapped head, so the
// repeated period is end - start - crossfade, with no added transport latency.
export function validateSampleLoop(zone){
 const loop=zone?.loop;if(loop===undefined)return null;
 if(!loop||typeof loop!=='object'||Array.isArray(loop)||Object.keys(loop).some(k=>!['start','end','crossfade'].includes(k))||
  !['start','end','crossfade'].every(key=>validParameterValue('zones.loop.'+key,loop[key],'sample'))||loop.end-loop.start<.011-1e-9||loop.crossfade>(loop.end-loop.start)/2+1e-9||
  loop.start<(zone.startSeconds??0)||zone.durationSeconds!==undefined&&loop.end>(zone.startSeconds??0)+zone.durationSeconds+1e-9)return 'Loop points must stay inside the source region; crossfade supports up to half the loop or 500 ms';
 return null;
}
export function sampleLoopRegion(zone,request,oneShot=false,sourceLimit=Infinity){
 const error=validateSampleLoop(zone);if(error)throw Error(error);
 if(!zone.loop||oneShot)return null;
 const p=request.recipe,r=request.region,l=zone.loop;
 if(l.end>r.offset+r.sourceLength+1e-9)throw Error('Sample loop ends beyond its recording');
 if(p.time===1&&p.semitones===0&&p.formant===0&&!p.reverse)return {...l};
 const a=l.start-r.offset,b=l.end-r.offset;
 const start=Math.max(0,(p.reverse?r.sourceLength-b:a)*p.time),end=Math.min(sourceLimit,(p.reverse?r.sourceLength-a:b)*p.time);
 return {start,end,crossfade:Math.min(l.crossfade*p.time,(end-start)/2)};
}
export function sampleLoopFrames(loop,rate){
 const start=Math.round(loop.start*rate),end=Math.round(loop.end*rate),fade=Math.min(Math.round(loop.crossfade*rate),Math.floor((end-start)/2));
 if(end-start<2||fade*2>end-start)throw Error('Sample loop is too short at the output rate');
 return {start,end,fade,resume:start+fade};
}
export const sampleLife=(patch,regionLength,noteDuration,loop=null)=>patch.oneShot?regionLength:loop?Math.max(.015,noteDuration+patch.release):Math.min(regionLength,Math.max(.015,noteDuration+patch.release));
