import { SAMPLE_ASSETS,sampleAsset,sampleFile,rawUrl } from "./samples.js";
// The only durable sample asset representation is the score's samples array.
// Browser library URLs are staging inputs; .premidi files contain the audio bytes.
export const MAX_SAMPLE_BYTES=1_000_000;
export const MAX_SCORE_BYTES=15_000_000;
const audioTypes={"audio/wav":"wav","audio/ogg":"ogg","audio/mpeg":"mp3"};
export function bytesToBase64(bytes){
 let result="";
 for(let i=0;i<bytes.length;i+=8192)
  result+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(result);
}
export function base64ToBytes(base64){
 const binary=atob(base64),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
}
export function validateSampleAsset(asset){
 if(!asset||typeof asset!=="object"||typeof asset.id!=="string"||!asset.id.trim()||asset.id.length>128)return "Sample needs an ID.";
 if(typeof asset.name!=="string"||!asset.name.trim()||asset.name.length>100)return "Sample needs a name.";
 if(!(asset.mime in audioTypes))return "Unsupported audio format.";
 if(typeof asset.data!=="string"||asset.data.length>Math.ceil(MAX_SAMPLE_BYTES*4/3)+8||
  asset.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data))return "Invalid sample bytes.";
 if(typeof asset.source!=="string"||asset.source.length>500)return "Invalid sample provenance.";
 return null;
}
function detectAudio(buffer,mime){
 const data=new Uint8Array(buffer),view=String.fromCharCode(...data.slice(0,12));
 if(data.length<16)throw Error("Audio sample is empty.");
 if(mime==="audio/wav"&&!(view.startsWith("RIFF")&&view.slice(8,12)==="WAVE"))throw Error("Not a WAV sample.");
 if(mime==="audio/ogg"&&!view.startsWith("OggS"))throw Error("Not an OGG sample.");
 if(mime==="audio/mpeg"&&!(view.startsWith("ID3")||(data[0]===0xff&&(data[1]&0xe0)===0xe0)))
  throw Error("Not an MP3 sample.");
}
export function makeSampleAsset(id,name,mime,bytes,source){
 const normalized=mime==="audio/x-wav"||mime==="audio/wave"?"audio/wav":mime;
 if(!(normalized in audioTypes))throw Error("Supported sample formats: WAV, OGG, MP3.");
 if(bytes.byteLength>MAX_SAMPLE_BYTES)throw Error("Sample exceeds the 1 MB per-file limit.");
 detectAudio(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),normalized);
 const asset={id,name,mime:normalized,data:bytesToBase64(bytes),source};
 const error=validateSampleAsset(asset);
 if(error)throw Error(error);
 return asset;
}
export async function loadLibrarySample(id) {
 const asset=sampleAsset(id);
 if(!asset)throw Error("Unknown sample: "+id);
 let response;
 try {response=await fetch(sampleFile(asset));}catch{}
 if(!response?.ok)response=await fetch(rawUrl(asset));
 if(!response.ok)throw Error("Couldn't download "+id+". Check your internet connection.");
 const declared=Number(response.headers.get("content-length")||0);
 if(declared>MAX_SAMPLE_BYTES)throw Error("Sample is too large.");
 const bytes=new Uint8Array(await response.arrayBuffer());
 return makeSampleAsset(asset.id,asset.id,asset.mime,bytes,asset.sourceUrl);
}
export function sampleZones(patch){
 return Array.isArray(patch?.zones)?patch.zones:[];
}
export function sampleForNote(patch,pitch){
 const zones=sampleZones(patch);
 const semitones=pitch+(patch.transpose||0);
 return zones.reduce((best,zone)=>!best||Math.abs(zone.root-semitones)<Math.abs(best.root-semitones)?zone:best,null);
}
export function validateSamplerPatch(patch){
 if(!patch||patch.type!=="sample")return ["Invalid sampler instrument."];
 const errors=[];
 if(typeof patch.presetId!=="string"||patch.presetId.length>100)errors.push("Invalid sample preset.");
 if(!Array.isArray(patch.zones)||patch.zones.length<1||patch.zones.length>16||
   patch.zones.some(zone=>typeof zone?.assetId!=="string"||!zone.assetId||
    !Number.isInteger(zone.root)||zone.root<0||zone.root>127))errors.push("Invalid sample key mapping.");
 if(typeof patch.followPitch!=="boolean")errors.push("Invalid pitch-follow mode.");
 for(const [field,lo,hi] of [["transpose",-24,24],["gain",0,2],["attack",0,2],["release",.01,3],["pan",-1,1]]){
  const value=patch[field];
  if(typeof value!=="number"||!Number.isFinite(value)||value<lo||value>hi)errors.push("Invalid sample "+field+".");
 }
 return errors;
}
export async function decodeSamples(context,score,cache){
 const missing=(score.samples||[]).filter(asset=>!cache.has(asset.id));
 await Promise.all(missing.map(async asset=>{
  const bytes=base64ToBytes(asset.data);
  const buffer=await context.decodeAudioData(bytes.buffer.slice(0));
  cache.set(asset.id,buffer);
 }));
}
export function scheduleSample(context,out,inst,event,start,duration,score,cache) {
 const patch=inst.patch,zone=sampleForNote(patch,event.pitch);
 const buffer=zone&&cache.get(zone.assetId);
 if(!buffer)return; // Can only happen while freshly imported samples decode during playback.
 const playbackRate=patch.followPitch?2**((event.pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12);
 const src=context.createBufferSource(),amp=context.createGain(),pan=context.createStereoPanner();
 const gain=Math.min(1,inst.volume*patch.gain*event.velocity*.7);
 src.buffer=buffer;src.playbackRate.value=playbackRate;
 pan.pan.value=patch.pan;
 const length=buffer.duration/playbackRate;
 const life=Math.min(length,Math.max(.015,duration+patch.release));
 const at=start+Math.min(patch.attack,life*.5);
 amp.gain.setValueAtTime(0,start);
 amp.gain.linearRampToValueAtTime(gain,at+0.001);
 // One-shot percussion sounds naturally tail off; keyed samples can be released early.
 const releaseStart=patch.followPitch?Math.min(start+duration,start+life-.01):start+life-.01;
 amp.gain.setValueAtTime(gain,Math.max(at+.001,releaseStart));
 amp.gain.linearRampToValueAtTime(0,start+life);
 src.connect(amp);amp.connect(pan);pan.connect(out);
 src.start(start);src.stop(start+life+.01);
 src.onended=()=>{src.disconnect();amp.disconnect();pan.disconnect();};
}
