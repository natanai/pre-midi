import {resolveEvent} from "./soundModel.js";
import { SAMPLE_ASSETS,sampleAsset,sampleFile,rawUrl } from "./samples.js";
import {putAsset,getAsset,MAX_ASSET_BYTES} from "./assetRegistry.js";
import { validateMovement, validateBend, movement, schedulePitch, scheduleMovementLfo } from "./expression.js";
import {driveCurve,validateSampleTone} from "./audioEffects.js";
// The only durable sample asset representation is the beat's samples array.
// Browser library URLs are staging inputs; .premidi files hold relative audio paths.
export const MAX_SAMPLE_BYTES=MAX_ASSET_BYTES;
export const MAX_SCORE_BYTES=1_000_000;
const audioTypes={"audio/wav":"wav","audio/ogg":"ogg","audio/mpeg":"mp3"};
export function validateSampleAsset(asset){
 if(!asset||typeof asset!=="object"||!/^[A-Za-z0-9_-]{1,128}$/.test(asset.id||""))return "Sample needs a safe ID.";
 if(typeof asset.name!=="string"||!asset.name.trim()||asset.name.length>100)return "Sample needs a name.";
 if(!(asset.mime in audioTypes))return "Unsupported audio format.";
 if(typeof asset.path!=="string"||asset.path!=="assets/"+asset.id+"."+audioTypes[asset.mime])
  return "Sample must reference its canonical relative audio path.";
 if(asset.data!==undefined)return "Audio bytes must be separate from .premidi.";
 if(typeof asset.source!=="string"||asset.source.length>500)return "Invalid sample provenance.";
 return null;
}
export function inspectAudioBytes(bytes,mime){
 if(!(bytes instanceof Uint8Array)||bytes.length>MAX_SAMPLE_BYTES)throw Error("Audio asset exceeds 1 MB.");
 detectAudio(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),mime);
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
 const asset={id,name,mime:normalized,path:"assets/"+id+"."+audioTypes[normalized],source};
 const error=validateSampleAsset(asset);
 if(error)throw Error(error);
 putAsset(id,bytes);
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
export function sampleForNote(patch,pitch,velocity=.8){
 const zones=sampleZones(patch);
 const semitones=pitch+(patch.transpose||0);
 const closest=zones.reduce((distance,zone)=>Math.min(distance,Math.abs(zone.root-semitones)),Infinity);
 const layer=zones.filter(zone=>Math.abs(zone.root-semitones)===closest);
 // Recorded velocity layers are timbrally distinct takes, never a volume filter
 // on one recording. Select the natural take at the nearest recorded pitch.
 return layer.reduce((best,zone)=>{
  const error=Math.abs((zone.velocity??velocity)-velocity);
  return !best||error<best.error?{zone,error}:best;
 },null)?.zone??null;
}
export function validateSamplerPatch(patch){
 if(!patch||patch.type!=="sample")return ["Invalid sampler instrument."];
 const errors=[];
 if(typeof patch.presetId!=="string"||patch.presetId.length>100)errors.push("Invalid sample preset.");
 if(!Array.isArray(patch.zones)||patch.zones.length<1||patch.zones.length>64||
   patch.zones.some(zone=>typeof zone?.assetId!=="string"||!zone.assetId||
    !Number.isInteger(zone.root)||zone.root<0||zone.root>127||
    (zone.velocity!==undefined && (!Number.isFinite(zone.velocity)||zone.velocity<0||zone.velocity>1))||
    (zone.string!==undefined && (typeof zone.string!=="string"||zone.string.length>20))))errors.push("Invalid sample key mapping.");
 if(patch.oneShot!==undefined&&typeof patch.oneShot!=="boolean")errors.push("Invalid one-shot playback mode.");
 if(typeof patch.followPitch!=="boolean")errors.push("Invalid pitch-follow mode.");
 errors.push(...validateMovement(patch.movement));
 errors.push(...validateBend(patch.bend));
 const toneError=validateSampleTone(patch);if(toneError)errors.push(toneError);
 if(patch.preserveDynamics!==undefined && typeof patch.preserveDynamics!=="boolean")errors.push("Invalid recorded dynamic preservation.");
 if(patch.strumMs!==undefined && (!Number.isFinite(patch.strumMs)||patch.strumMs < -25||patch.strumMs > 25)) errors.push("Invalid strum timing.");
 for(const [field,lo,hi] of [["transpose",-24,24],["gain",0,2],["attack",0,2],["release",.01,3],["pan",-1,1]]){
  const value=patch[field];
  if(typeof value!=="number"||!Number.isFinite(value)||value<lo||value>hi)errors.push("Invalid sample "+field+".");
 }
 return errors;
}
// Decode only samples that the current beat can actually trigger.
// Multi-layer instruments can carry dozens of recordings in the portable file
// without decoding all of their long natural tails into RAM on every Play.
export function usedSampleIds(beat){
 const used=new Set();
 for(const inst of beat.instruments||[]){
  const placed=new Set(inst.timeline.filter(Boolean));
  for(const chunk of inst.chunks||[]){
   if(!placed.has(chunk.id))continue;
   for(const note of chunk.notes){
    const resolved=resolveEvent(inst,note);
    if(resolved?.voice.patch.type!=="sample")continue;
    const zone=sampleForNote(resolved.voice.patch,resolved.note.pitch,note.velocity);
    if(zone)used.add(zone.assetId);
   }
  }
 }
 return used;
}
export async function decodeSamples(context,beat,cache,only=usedSampleIds(beat)){
 const waiting=[];
 for(const asset of beat.samples||[]) {
  if(only && !only.has(asset.id))continue;
  if(cache.has(asset.id)){
   const prior=cache.get(asset.id);
   if(prior instanceof Promise)waiting.push(prior);
   continue;
  }
  const task=(async()=>{
   const bytes=getAsset(asset.id);
   if(!bytes)throw Error("Missing "+asset.path+". Open the .zip package containing the audio.");
   const buffer=await context.decodeAudioData(bytes.buffer.slice(0));
   cache.set(asset.id,buffer);
   return buffer;
  })();
  cache.set(asset.id,task);
  waiting.push(task);
 }
 await Promise.all(waiting);
}
const peakLevels=new WeakMap();
function sampleNormalization(buffer){
 if(peakLevels.has(buffer))return peakLevels.get(buffer);
 let peak=0;
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const values=buffer.getChannelData(channel);
  for(let i=0;i<values.length;i+=4)peak=Math.max(peak,Math.abs(values[i]));
 }
 // Balance quieter organic recordings with percussive transients without
 // flattening each sound or changing the portable original recording.
 const scale=Math.min(5,Math.max(.5,.65/Math.max(.08,peak)));
 peakLevels.set(buffer,scale);
 return scale;
}
export function scheduleSample(context,out,inst,event,start,duration,beat,cache) {
 const patch=inst.patch,zone=sampleForNote(patch,event.pitch,event.velocity);
 const buffer=zone&&cache.get(zone.assetId);
 if(!buffer)return; // Can only happen while freshly imported samples decode during playback.
 const playbackRate=patch.followPitch?2**((event.pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12);
 const src=context.createBufferSource(),amp=context.createGain(),pan=context.createStereoPanner();
 const recordedGain=patch.preserveDynamics?3.5:sampleNormalization(buffer);
 const gain=Math.min(2,inst.volume*patch.gain*event.velocity*.7*recordedGain);
 src.buffer=buffer;src.playbackRate.value=playbackRate;
 const motion=movement(patch);
 pan.pan.value=patch.pan;
 const length=buffer.duration/playbackRate;
 const life=patch.oneShot?length:Math.min(length,Math.max(.015,duration+patch.release));
 // The whole recording keeps pitch modulation, not only the short grid note.
 schedulePitch(context,src.detune,{...event,bend:event.bend??patch.bend},motion,start,Math.max(.02,life));
 const at=start+Math.min(patch.attack,life*.5);
 amp.gain.setValueAtTime(0,start);
 amp.gain.linearRampToValueAtTime(gain,at+0.001);
 // One-shot percussion sounds naturally tail off; keyed samples can be released early.
 const releaseStart=patch.oneShot?start+Math.max(0,life-patch.release):
  patch.followPitch?Math.min(start+duration,start+life-.01):start+life-.01;
 amp.gain.setValueAtTime(gain,Math.max(at+.001,releaseStart));
 amp.gain.linearRampToValueAtTime(0,start+life);
 const pulse=context.createGain();
 pulse.gain.setValueAtTime(1,start);
 scheduleMovementLfo(context,pulse.gain,start,life,motion.tremoloRate,motion.tremolo*.45);
 // Unedited legacy samples preserve the original signal path.
 let signal=src;const toneNodes=[];
 if(patch.filter){
  const filter=context.createBiquadFilter();filter.type=patch.filter.type;
  filter.frequency.setValueAtTime(patch.filter.cutoff,start);
  filter.Q.setValueAtTime(patch.filter.resonance,start);
  signal.connect(filter);signal=filter;toneNodes.push(filter);
 }
 if((patch.drive??0)>0){
  const shaper=context.createWaveShaper(),compensation=context.createGain();
  shaper.curve=driveCurve(patch.drive);shaper.oversample="none";
  compensation.gain.value=1/(1+patch.drive*1.1);
  signal.connect(shaper);shaper.connect(compensation);signal=compensation;
  toneNodes.push(shaper,compensation);
 }
 signal.connect(amp);amp.connect(pulse);pulse.connect(pan);pan.connect(out);
 src.start(start);src.stop(start+life+.01);
 src.onended=()=>{src.disconnect();for(const node of toneNodes)node.disconnect();amp.disconnect();pulse.disconnect();pan.disconnect();};
}
