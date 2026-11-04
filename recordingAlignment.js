// One microphone alignment preference for browser MediaRecorder and native
// Windows callback capture. This is measured compensation, not auto-calibration.
// A positive delay discards extra microphone lead-in; source bytes remain intact
// for browser recordings and existing takes do not change when the setting does.
export const RECORDING_ALIGNMENT_KEY="premidi-recording-offset-ms";
export const MAX_RECORDING_ALIGNMENT_MS=500;
export function recordingAlignmentMs(raw){
 if(raw===null||raw===undefined||raw==="")return 0;
 const value=Number(raw);
 if(!Number.isFinite(value)||value<0||value>MAX_RECORDING_ALIGNMENT_MS)
  throw Error("Recording alignment must be between 0 and 500 ms.");
 return Math.round(value*10)/10;
}
export function readRecordingAlignment(storage=globalThis.localStorage){
 return recordingAlignmentMs(storage?.getItem(RECORDING_ALIGNMENT_KEY));
}
export function saveRecordingAlignment(value,storage=globalThis.localStorage){
 const ms=recordingAlignmentMs(value);
 storage?.setItem(RECORDING_ALIGNMENT_KEY,String(ms));
 return ms;
}
export function browserRecordingLeadIn(startTime,now,offsetMs){
 if(!Number.isFinite(startTime)||!Number.isFinite(now))
  throw Error("Invalid synchronized browser recording clock.");
 return Math.max(0,startTime-now)+recordingAlignmentMs(offsetMs)/1000;
}
