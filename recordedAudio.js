import {validateCutoffAutomation,planCutoffAutomation} from "./src/dsp/automation.js";
// Canonical post-source processing for sampled Sounds and timeline recordings.
import {configureDriveShaper} from './audioEffects.js';
import {movement,scheduleMovementLfo} from './expression.js';
import {attachModulation} from './src/hosts/web/modulation.js';
import {validateModulation} from './src/dsp/modulation.js';
import {delayTailSeconds} from './src/dsp/effect-tail.js';
export const RECORDING_DEFAULTS=Object.freeze({pan:0,transpose:0,attack:.005,release:.03,drive:0,delayMix:0,delayTime:.24,delayFeedback:.26});
export function recordedEffects(patch){
 return {...RECORDING_DEFAULTS,...patch,movement:movement(patch),filter:patch.filter??null,
  bend:patch.bend??{shape:'straight',amount:2,rate:4}};
}
export function validateRecordedModulation(block,{vocal=false}={}){
 if(block===undefined)return [];
 const errors=validateModulation(block);
 if(errors.length)return errors;
 for(const route of block.routes){
  if(!['filter.cutoff','pan'].includes(route.target))errors.push('Recording routes target brightness or pan; oscillator routes require a synthesizer.');
  if(vocal&&['velocity','keytrack'].includes(route.source.kind))errors.push('Timeline recordings use time-based movement sources.');
 }
 return errors;
}
export function recordingEnvelope(start,duration,gain,attack,release){
 const rise=Math.min(attack,duration*.5),fade=Math.min(release,duration*.5),end=start+duration;
 return [{kind:0,time:start,value:0},{kind:1,time:start+rise,value:gain},
  {kind:0,time:Math.max(start+rise,end-fade),value:gain},{kind:1,time:end,value:0}];
}
export function connectRecordedAudio(context,{source,amp,gate,pan,out,patch,start,duration,owner,expression={pitch:60,velocity:1},unit=.125,elapsedSteps=0}){
 const fx=recordedEffects(patch),motion=fx.movement,add=node=>{owner.nodes.push(node);return node;};
 let signal=source,filter=null;
 if(fx.filter){
  filter=add(context.createBiquadFilter());filter.type=fx.filter.type;
  filter.frequency.setValueAtTime(fx.filter.cutoff,start);
  if(fx.automation){const plan=planCutoffAutomation(fx.automation,{start,end:start+duration,step:elapsedSteps,unit,limitStep:Math.max(elapsedSteps+duration/unit,fx.automation.points.at(-1).step)});
   for(const [i,point] of plan.points.entries())filter.frequency[i?'exponentialRampToValueAtTime':'setValueAtTime'](point.value,point.time);
  }
  filter.Q.setValueAtTime(fx.filter.resonance,start);
  if(motion.tone>0)scheduleMovementLfo(context,filter.frequency,start,duration,motion.toneRate,fx.filter.cutoff*motion.tone*.8,owner);
  signal.connect(filter);signal=filter;
 }
 if(fx.drive>0){
  const shaper=add(context.createWaveShaper()),comp=add(context.createGain());
  configureDriveShaper(shaper,fx.drive);comp.gain.value=1/(1+fx.drive*1.1);
  signal.connect(shaper);shaper.connect(comp);signal=comp;
 }
 signal.connect(amp);
 const pulse=add(context.createGain());pulse.gain.setValueAtTime(1,start);
 scheduleMovementLfo(context,pulse.gain,start,duration,motion.tremoloRate,motion.tremolo*.45,owner);
 amp.connect(pulse);pulse.connect(gate);gate.connect(pan);pan.pan.value=fx.pan;
 const targets=new Map([['pan',pan.pan]]);if(filter)targets.set('filter.cutoff',filter.detune);
 attachModulation(context,{modulation:fx.modulation,start,off:start+duration,graphEnd:start+duration,expression},targets,owner);
 const dry=add(context.createGain());dry.gain.value=1-fx.delayMix*.4;pan.connect(dry);dry.connect(out);
 return {fx,tail:delayTailSeconds(fx),connectDelay(session,voice){
  if(!(fx.delayMix>0)||!voice.admitted&&session)return;
  if(session){pan.connect(session.delay(fx,voice));return;}
  const send=add(context.createGain()),delay=add(context.createDelay(1.2)),feedback=add(context.createGain()),wet=add(context.createGain());
  send.gain.value=fx.delayMix*.55;delay.delayTime.value=fx.delayTime;feedback.gain.value=fx.delayFeedback;wet.gain.value=.8;
  pan.connect(send);send.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(out);
 }};
}
// Transfer only shared processing, never oscillators, asset mapping or timing.
export function processingFromPatch(patch){
 const synth=patch.type==='synth',fx=recordedEffects({...patch,...(synth?{drive:patch.effects.drive,attack:patch.envelope.attack,release:patch.envelope.release}:{}),...(patch.effects??{})});
 const keys=['pan','transpose','attack','release','drive','delayMix','delayTime','delayFeedback','filter','movement','bend','modulation','automation'];
 const result=Object.fromEntries(keys.filter(key=>fx[key]!==undefined).map(key=>[key,structuredClone(fx[key])]));
 if(result.modulation)result.modulation.routes=result.modulation.routes.filter(route=>['filter.cutoff','pan'].includes(route.target)&&['lfo','envelope'].includes(route.source.kind));
 if(result.filter)result.filter={type:result.filter.type,cutoff:result.filter.cutoff,resonance:result.filter.resonance};
 result.attack=Math.min(2,result.attack);result.release=Math.min(3,result.release);
 return result;
}
export function applyProcessingToPatch(patch,processing){
 const fx=structuredClone(processing);
 if(patch.type==='synth'){
  for(const key of ['pan','movement','bend','filter'])if(fx[key]!==undefined&&fx[key]!==null)patch[key]=fx[key];
  patch.envelope.attack=Math.min(3,fx.attack??patch.envelope.attack);
  patch.envelope.release=Math.max(.01,Math.min(4,fx.release??patch.envelope.release));
  for(const key of ['delayMix','delayTime','delayFeedback'])if(fx[key]!==undefined)patch.effects[key]=fx[key];
  if(fx.drive!==undefined)patch.effects.drive=fx.drive;
  if(fx.modulation){patch.modulation=fx.modulation;patch.version=2;}
 }else Object.assign(patch,fx);
 patch.presetId='custom';return patch;
}

export const validateRecordingAutomation=block=>block===undefined||block===null?[]:validateCutoffAutomation(block,null,1000000);
