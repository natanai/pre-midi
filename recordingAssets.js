// Long-form audio Assets for Song Recordings; never part of Beat sample limits.
import {getAsset,putAsset,MAX_RECORDING_BYTES} from "./assetRegistry.js";
import {validateRecording} from "./songModel.js";
const extensions={"audio/webm":"webm","audio/mp4":"mp4","audio/ogg":"ogg"};
export function preferredRecordingMime(MediaRecorderClass=globalThis.MediaRecorder){
 if(!MediaRecorderClass)return null;
 return ["audio/webm;codecs=opus","audio/mp4;codecs=mp4a.40.2","audio/mp4","audio/webm","audio/ogg;codecs=opus","audio/ogg"]
  .find(mime=>MediaRecorderClass.isTypeSupported?.(mime))||null;
}
export function normalizeRecordingMime(raw){
 const mime=String(raw||"").split(";")[0].trim().toLowerCase();
 if(!(mime in extensions))throw Error("Unsupported microphone format: "+(raw||"unknown"));
 return mime;
}
export function inspectRecordingBytes(bytes,mime){
 if(!(bytes instanceof Uint8Array)||bytes.length<24||bytes.length>MAX_RECORDING_BYTES)
  throw Error("Vocal audio must be 24 bytes to 48 MB.");
 const head=String.fromCharCode(...bytes.subarray(0,16));
 if(mime==="audio/webm"&&!(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3))
  throw Error("Vocal asset is not WebM.");
 if(mime==="audio/ogg"&&!head.startsWith("OggS"))throw Error("Vocal asset is not OGG.");
 if(mime==="audio/mp4"&&head.slice(4,8)!=="ftyp")throw Error("Vocal asset is not MP4.");
}
export function makeRecordingAsset(id,name,mime,bytes,{durationSeconds,trimSeconds=0}={}){
 const normalized=normalizeRecordingMime(mime);
 const metadata={id,name,mime:normalized,path:"assets/"+id+"."+extensions[normalized],
  durationSeconds,trimSeconds};
 const error=validateRecording(metadata);
 if(error)throw Error(error);
 inspectRecordingBytes(bytes,normalized);
 putAsset(id,bytes,{longForm:true});
 return metadata;
}
export function recordingBytes(recording){
 const bytes=getAsset(recording.id);
 if(!bytes)throw Error("Missing vocal Asset "+recording.path);
 inspectRecordingBytes(bytes,recording.mime);
 return bytes;
}
