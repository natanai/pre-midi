import {sampleForNote} from '../../../sampler.js';
import {validatePatch} from '../../../synth.js';
import {movement,planPitch} from '../../dsp/expression.js';
import {vocalEffects,vocalSourceRange} from '../../../vocalEffects.js';
import {delayTailSeconds} from '../../dsp/effect-tail.js';
import {sampleSourceRegion} from '../../../sampleSlice.js';

export function planNativeSample(instrument,note,start,duration,assets){
 const patch=instrument.patch,errors=validatePatch(patch);if(errors.length)throw Error(errors.join('; '));
 const zone=sampleForNote(patch,note.pitch,note.velocity),asset=zone&&assets.get(zone.assetId);
 if(!asset)throw Error('Native audio asset is not prepared: '+(zone?.assetId??'missing sample zone'));
 const rate=patch.followPitch?2**((note.pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12);
 const region=sampleSourceRegion(zone,asset.duration,rate);
 const life=patch.oneShot?region.length:Math.min(region.length,Math.max(.015,duration+patch.release));
 const motion=movement(patch),peak=Math.min(2,instrument.volume*patch.gain*note.velocity*.7*(patch.preserveDynamics?3.5:asset.normalization));
 const at=start+Math.min(patch.attack,life*.5)+.001;
 const releaseStart=patch.oneShot?start+Math.max(0,life-patch.release):patch.followPitch?Math.min(start+duration,start+life-.01):start+life-.01;
 return {contract:'pre-midi-sample-voice',version:1,kind:1,asset:asset.id,start,duration:Math.max(.02,life),off:Math.max(start,releaseStart),end:start+life+.01,graphEnd:start+life+.01,
  playbackRate:rate,offset:region.offset,pan:patch.pan,filter:patch.filter??null,drive:patch.drive??0,movement:motion,
  pitch:planPitch({...note,bend:note.bend??patch.bend},motion,start,Math.max(.02,life)),
  events:[{kind:0,time:start,value:0},{kind:1,time:at,value:peak},{kind:0,time:Math.max(at,releaseStart),value:peak},{kind:1,time:start+life,value:0}].sort((a,b)=>a.time-b.time)};
}
export function planNativeVocal(event,start,unit,assets){
 if(!event?.recording||!event?.clip)throw Error('Native vocal event is missing its recording or clip');
 const {recording,clip}=event,asset=assets.get(recording.id);
 if(!asset)throw Error('Native vocal asset is not prepared: '+recording.id);
 const fx=vocalEffects(clip),range=vocalSourceRange(recording,clip,unit);
 const offset=Math.max(0,Math.min(range.offset,asset.duration-.005));
 const duration=Math.min(range.duration,(asset.duration-offset)/range.rate);
 if(!(duration>.005))return null;
 const end=start+duration,attack=Math.min(fx.attack,duration*.5),release=Math.min(fx.release,duration*.5);
 const gain=clip.gain??1,fadeStart=Math.max(start+attack,end-release);
 const events=[{kind:0,time:start,value:0},{kind:1,time:start+attack,value:gain},
  {kind:0,time:fadeStart,value:gain},{kind:1,time:end,value:0}];
 // An unedited legacy take retains its original gain behavior.
 if(clip.effects===undefined)events.splice(0,events.length,
  {kind:0,time:start,value:gain},{kind:0,time:end,value:0});
 const tail=delayTailSeconds(fx);
 return {contract:'pre-midi-sample-voice',version:1,kind:2,asset:asset.id,start,duration,
  off:end,end,graphEnd:end,playbackRate:range.rate,offset,pan:fx.pan,
  filter:fx.filter,drive:fx.drive,movement:movement(fx),
  pitch:planPitch({bend:fx.bend},movement(fx),start,duration),
  delayMix:fx.delayMix,delayTime:fx.delayTime,delayFeedback:fx.delayFeedback,tail,
  events};
}
export function encodeNativeSample(plan,rate){
 if(plan.contract!=='pre-midi-sample-voice'||plan.version!==1)throw Error('Unknown native sample voice contract');
 const parts=[],u32=n=>{if(!Number.isInteger(n)||n<0||n>0xffffffff)throw Error('Invalid native sample integer');const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);parts.push(b);},f64=n=>{if(!Number.isFinite(n))throw Error('Invalid native sample number');const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,n,true);parts.push(b);};
 u32(0x38564d50);u32(rate);u32(1);u32(plan.delayMix>0?10:8);u32(plan.kind);u32(plan.asset);
 for(const n of [plan.start,plan.duration,plan.end,plan.graphEnd,plan.off,plan.pan,plan.playbackRate,plan.offset,plan.filter?.cutoff??14000,plan.filter?.resonance??.7,plan.drive,plan.movement.rate,plan.movement.depth,plan.movement.delay,plan.movement.tremolo,plan.movement.tremoloRate])f64(n);
 if(plan.delayMix>0)for(const value of [plan.delayMix,plan.delayTime,plan.delayFeedback])f64(value);
 u32(['lowpass','highpass','bandpass','notch'].indexOf(plan.filter?.type??'lowpass'));u32(plan.filter?0:1);
 const curve=plan.pitch.values??[];if(curve.length>600)throw Error('Native sample pitch curve exceeds 600 points');u32(curve.length);curve.forEach(f64);
 u32(plan.events.length);for(const event of plan.events){u32(event.kind);f64(event.time);f64(Math.fround(event.value));}
 const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let offset=0;for(const b of parts){out.set(b,offset);offset+=b.length;}return out;
}
