// A Song WAV may be referenced by a playable Beat sample without producing
// a second WAV file. Source-time boundaries preserve the Clip's leading trim.
// Browser WebM/MP4 or files beyond the 1 MB Beat contract still need conversion.
import {getAsset,MAX_ASSET_BYTES} from "./assetRegistry.js";
import {inspectAudioBytes,validateSampleAsset} from "./sampler.js";
import {validateSampleSlice,MAX_SAMPLE_SLICE_SECONDS} from "./sampleSlice.js";

export function linkedVocalSample(recording,clip,bytes=getAsset(recording?.id)){
 if(!recording||!clip||clip.recordingId!==recording.id)throw Error("Vocal clip and recording do not match");
 if(recording.mime!=="audio/wav"||!(bytes instanceof Uint8Array)||
  bytes.byteLength>MAX_ASSET_BYTES)return null;
 if(!Number.isFinite(clip.trimStartSeconds??0)||(clip.trimStartSeconds??0)<0)
  throw Error("Invalid vocal trim start");
 const start=recording.trimSeconds+(clip.trimStartSeconds??0);
 const length=recording.durationSeconds-start;
 if(!(length>.01)||length>MAX_SAMPLE_SLICE_SECONDS)return null;
 const zone={assetId:recording.id,root:60,startSeconds:start,durationSeconds:length};
 const issue=validateSampleSlice(zone);if(issue)throw Error(issue);
 inspectAudioBytes(bytes,"audio/wav");
 const asset={
  id:recording.id,name:recording.name,mime:recording.mime,path:recording.path,
  source:"Song vocal recording "+recording.id,sourceRecordingId:recording.id
 };
 const error=validateSampleAsset(asset);if(error)throw Error(error);
 return {asset,zone};
}
