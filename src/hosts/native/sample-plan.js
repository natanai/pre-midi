import {encodeProcessing} from './processing.js';
import {effectiveDelayEffects,processingFlags,processorMix} from "../../dsp/processing-chain.js";
import {planFilterSweep} from "../../dsp/filter-sweep.js";
import {planCutoffAutomation} from "../../dsp/automation.js";
import {recordedEffects,recordingEnvelope} from "../../../recordedAudio.js";
import {MOD_TARGETS,MOD_SOURCES,nativeModulationSource,resolveModulation,DEFAULT_LFO_STEPS} from "../../dsp/modulation.js";
import {sampleForNote} from '../../../sampler.js';
import {validatePatch} from '../../../synth.js';
import {movement,planPitch} from '../../dsp/expression.js';
import {vocalEffects,vocalSourceRange} from '../../../vocalEffects.js';
import {delayTailSeconds} from '../../dsp/effect-tail.js';
import {sampleSourceRegion} from '../../../sampleSlice.js';

export function planNativeSample(instrument,note,start,duration,assets,{unit=.125}={}){
 const patch=instrument.patch,errors=validatePatch(patch);if(errors.length)throw Error(errors.join('; '));
 const zone=sampleForNote(patch,note.pitch,note.velocity),asset=zone&&assets.get(zone.assetId);
 if(!asset)throw Error('Native audio asset is not prepared: '+(zone?.assetId??'missing sample zone'));
 const rate=patch.followPitch?2**((note.pitch+patch.transpose-zone.root)/12):2**(patch.transpose/12);
 const region=sampleSourceRegion(zone,asset.duration,rate);
 const life=patch.oneShot?region.length:Math.min(region.length,Math.max(.015,duration+patch.release));
 const motion=movement(patch),fx=effectiveDelayEffects(patch,recordedEffects(patch),unit),peak=patch.audioMode==="clip"?Math.min(2,instrument.volume*patch.gain*note.velocity):Math.min(2,instrument.volume*patch.gain*note.velocity*.7*(patch.preserveDynamics?3.5:asset.normalization));
 const at=start+Math.min(patch.attack,life*.5)+.001;
 const releaseStart=patch.oneShot?start+Math.max(0,life-patch.release):patch.followPitch?Math.min(start+duration,start+life-.01):start+life-.01;
 return {contract:'pre-midi-sample-voice',version:1,kind:1,eq:patch.eq,filterStages:patch.filterStages,chain:patch.chain,asset:asset.id,start,duration:Math.max(.02,life),off:patch.audioMode==="clip"?start+life:Math.max(start,releaseStart),end:start+life+.01,graphEnd:start+life+.01,
  automation:patch.automation?planCutoffAutomation(patch.automation,{start,end:start+life+.01,step:0,unit,limitStep:life/unit}):undefined,
  delayMix:fx.delayMix,delayTime:fx.delayTime,delayFeedback:fx.delayFeedback,tail:delayTailSeconds(fx),modulation:resolveModulation(patch.modulation,unit),pitchValue:note.pitch,velocity:note.velocity,
  sweep:planFilterSweep(fx.filter,start,life,"sample"),
  playbackRate:rate,offset:region.offset,sourceLimit:region.offset+region.sourceLength,pan:patch.pan,filter:fx.filter,drive:patch.drive??0,movement:motion,
  pitch:planPitch({...note,bend:note.bend??patch.bend},motion,start,Math.max(.02,life)),
  events:patch.audioMode==="clip"?recordingEnvelope(start,life,peak,patch.attack,patch.release):[{kind:0,time:start,value:0},{kind:1,time:at,value:peak},{kind:0,time:Math.max(at,releaseStart),value:peak},{kind:1,time:start+life,value:0}].sort((a,b)=>a.time-b.time)};
}
export function planNativeVocal(event,start,unit,assets){
 if(!event?.recording||!event?.clip)throw Error('Native vocal event is missing its recording or clip');
 const {recording,clip}=event,asset=assets.get(recording.id);
 if(!asset)throw Error('Native vocal asset is not prepared: '+recording.id);
 const fx=effectiveDelayEffects(clip.effects??{},vocalEffects(clip,unit),unit),range=vocalSourceRange(recording,clip,unit,0,{sourceDuration:asset.duration});
 const offset=Math.max(0,Math.min(range.offset,asset.duration-.005));
 const duration=Math.min(range.duration,(asset.duration-offset)/range.rate);
 if(!(duration>.005))return null;
 const end=start+duration,gain=clip.gain??1;
 const events=recordingEnvelope(start,duration,gain,fx.attack,fx.release);
 // A Clip without processing plays directly at its authored gain.
 if(clip.effects===undefined)events.splice(0,events.length,
  {kind:0,time:start,value:gain},{kind:0,time:end,value:0});
 const tail=delayTailSeconds(fx);
 return {contract:'pre-midi-sample-voice',version:1,kind:2,eq:fx.eq,filterStages:fx.filterStages,chain:clip.effects?.chain,asset:asset.id,start,duration,
  off:end,end,graphEnd:end,playbackRate:range.rate,offset,sourceLimit:range.sourceEnd,pan:fx.pan,
  filter:fx.filter,drive:fx.drive,movement:movement(fx),sweep:planFilterSweep(fx.filter,start,duration,"vocal"),
  pitch:{...range.pitch,start,duration},
  delayMix:fx.delayMix,delayTime:fx.delayTime,delayFeedback:fx.delayFeedback,tail,
  automation:fx.automation?planCutoffAutomation(fx.automation,{start,end,step:0,unit,limitStep:duration/unit}):undefined,
  modulation:resolveModulation(fx.modulation,unit),pitchValue:60,velocity:1,events};
}
export function encodeNativeSample(plan,rate){
 if(plan.contract!=='pre-midi-sample-voice'||plan.version!==1)throw Error('Unknown native sample voice contract');
 const parts=[],u32=n=>{if(!Number.isInteger(n)||n<0||n>0xffffffff)throw Error('Invalid native sample integer');const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);parts.push(b);},f64=n=>{if(!Number.isFinite(n))throw Error('Invalid native sample number');const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,n,true);parts.push(b);};
 u32(0x38564d50);u32(rate);u32(1);u32(16);u32(plan.kind);u32(plan.asset);
 for(const n of [plan.start,plan.duration,plan.end,plan.graphEnd,plan.off,plan.pan,plan.playbackRate,plan.offset,plan.sourceLimit,plan.filter?.cutoff??14000,plan.filter?.resonance??.7,plan.drive,plan.movement.rate,plan.movement.depth,plan.movement.delay,plan.movement.tremolo,plan.movement.tremoloRate])f64(n);
 for(const value of [plan.delayMix??0,plan.delayTime??.24,plan.delayFeedback??.26,plan.movement.tone,plan.movement.toneRate,plan.sweep.startCutoff,plan.sweep.sweepEnd])f64(value);
 u32(['lowpass','highpass','bandpass','notch'].indexOf(plan.filter?.type??'lowpass'));u32(plan.filter?0:1);
 const curve=plan.pitch.values??[];if(curve.length>600)throw Error('Native sample pitch curve exceeds 600 points');u32(curve.length);curve.forEach(f64);
 u32(plan.events.length);for(const event of plan.events){u32(event.kind);f64(event.time);f64(Math.fround(event.value));}
 f64(plan.pitchValue??60);f64(plan.velocity??1);
 const routes=[...(plan.modulation?.routes??[])].sort((a,b)=>a.id.localeCompare(b.id));u32(routes.length);
 for(const route of routes){u32(MOD_TARGETS.findIndex(t=>t.id===route.target));u32(nativeModulationSource(route.source));u32(route.polarity==="bipolar"?1:0);
  for(const value of [route.depth,route.smoothing,route.source.rate??.5,route.source.kind==="macro"?route.source.value:route.source.kind==="lfo"?(route.source.seed??1):(route.source.root??60),route.source.span??24,...(route.source.shape==="steps"?(route.source.steps??DEFAULT_LFO_STEPS):["attack","decay","sustain","release"].map((k,i)=>route.source.envelope?.[k]??[.8,.5,.5,.5][i]))])f64(value);
 }
 const points=plan.automation?.points??[];u32(points.length);for(const point of points){f64(point.time);f64(point.value);}
 encodeProcessing(plan,rate,u32,f64);
 const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let offset=0;for(const b of parts){out.set(b,offset);offset+=b.length;}return out;
}
