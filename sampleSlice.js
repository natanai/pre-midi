// Source-time regions let playable samples reference an existing recording.
// A Beat may carry this region in instructions without copying or rewriting WAV bytes.
export const MAX_SAMPLE_SLICE_SECONDS=4;
export function hasSampleSlice(zone){
 return zone?.startSeconds!==undefined||zone?.durationSeconds!==undefined;
}
export function validateSampleSlice(zone){
 if(!hasSampleSlice(zone))return null;
 if(!Number.isFinite(zone.startSeconds)||zone.startSeconds<0||zone.startSeconds>300||
  !Number.isFinite(zone.durationSeconds)||zone.durationSeconds<=.01||
  zone.durationSeconds>MAX_SAMPLE_SLICE_SECONDS||
  zone.startSeconds+zone.durationSeconds>300.5)
  return "Sample excerpt requires a source start and a duration of at most four seconds.";
 return null;
}
export function sampleSourceRegion(zone,sourceSeconds,playbackRate=1){
 if(!Number.isFinite(sourceSeconds)||sourceSeconds<=0||!Number.isFinite(playbackRate)||playbackRate<=0)
  throw Error("Invalid audio source timing");
 const error=validateSampleSlice(zone);
 if(error)throw Error(error);
 const offset=zone.startSeconds??0;
 const available=sourceSeconds-offset;
 if(available<=.0005)throw Error("Sample excerpt starts beyond its recording");
 const sourceLength=Math.min(available,zone.durationSeconds??available);
 if(sourceLength<=.0005)throw Error("Sample excerpt is empty");
 return {offset,sourceLength,length:sourceLength/playbackRate};
}
export function requiresSampleSliceFormat(document){
 return document?.instruments?.some(inst=>inst?.sounds?.some(sound=>
  sound?.patch?.type==="sample"&&sound.patch.zones?.some(hasSampleSlice)))||false;
}

export function isRecordingSampleAlias(recording,sample){
 return !!recording&&!!sample&&sample.sourceRecordingId===recording.id&&
  sample.id===recording.id&&sample.name===recording.name&&
  sample.mime==="audio/wav"&&recording.mime==="audio/wav"&&
  sample.path===recording.path;
}
