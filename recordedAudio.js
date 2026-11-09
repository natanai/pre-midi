import {scheduleParameterAutomation} from './src/hosts/web/automation.js';
import {connectProcessingGraph} from './src/hosts/web/processing-graph.js';
import {connectStereoImage,createStereoDelay} from './src/hosts/web/stereo.js';
import {createEq,cascadeFilter,cutoffDestination} from './src/hosts/web/equalizer.js';
import {connectProcessorMix} from './src/hosts/web/processor-mix.js';
import {processingChain,processorBypassed,effectiveDelayEffects} from "./src/dsp/processing-chain.js";
import {parameterFor,parameterDefaults,clampParameterValue,modulationTargetsFor,modulationSourcesFor} from "./src/dsp/parameters.js";
import {windowEnvelope} from "./src/dsp/envelope-window.js";
import {planFilterSweep,filterSweepRatioAt} from "./src/dsp/filter-sweep.js";
import {validateAutomation,planCutoffAutomation,cutoffLane,planParameterAutomation,automationParameters} from "./src/dsp/automation.js";
// Canonical post-source processing for sampled Sounds and timeline recordings.
import {configureDriveShaper,sampleTone} from './audioEffects.js';
import {movement,scheduleMovementLfo} from './expression.js';
import {attachModulation} from './src/hosts/web/modulation.js';
import {validateModulation,resolveModulation} from './src/dsp/modulation.js';
import {delayTailSeconds} from './src/dsp/effect-tail.js';
export const RECORDING_DEFAULTS=Object.freeze({
 ...Object.fromEntries(["pan","transpose"].map(id=>[id,parameterFor(id,"vocal").default])),
 attack:parameterFor("envelope.attack","vocal").default,release:parameterFor("envelope.release","vocal").default,
 ...parameterDefaults("effects","vocal")
});
export function recordedEffects(patch){
 return {...RECORDING_DEFAULTS,...patch,movement:movement(patch),filter:patch.filter?sampleTone(patch).filter:null,
  bend:patch.bend??parameterDefaults('bend')};
}
export function validateRecordedModulation(block,{vocal=false}={}){
 if(block===undefined)return [];
 const errors=validateModulation(block);
 if(errors.length)return errors;
 const context=vocal?'vocal':'sample',targets=modulationTargetsFor(context).map(t=>t.id),sources=modulationSourcesFor(context);
 for(const route of block.routes){
  if(!targets.includes(route.target))errors.push('Recording routes target brightness, resonance, amplitude or pan; oscillator routes require a synthesizer.');
  if(!sources.includes(route.source.kind))errors.push('Timeline recordings use time-based movement sources.');
 }
 return errors;
}
export function recordingEnvelope(start,duration,gain,attack,release,{elapsed=0,totalDuration=duration+elapsed}={}){
 const rise=Math.min(attack,totalDuration*.5),fade=Math.min(release,totalDuration*.5);
 const events=[{kind:0,time:0,value:0},{kind:1,time:rise,value:gain},
  {kind:0,time:Math.max(rise,totalDuration-fade),value:gain},{kind:1,time:totalDuration,value:0}];
 return elapsed>0?windowEnvelope(events,elapsed,start):events.map(event=>({...event,time:event.time+start}));
}
export function connectRecordedAudio(context,{source,amp,gate,pan,out,patch,start,duration,owner,expression={pitch:60,velocity:1},unit=.125,elapsedSteps=0,timeline}){
 const elapsed=Math.max(0,elapsedSteps)*unit;
 const fx=effectiveDelayEffects(patch,recordedEffects(patch),unit),motion=fx.movement,add=node=>{owner.nodes.push(node);return node;};
 let signal=source,filter=null,filterStage=null;const stages=new Map(),automationTargets=new Map();owner.automationTargets=automationTargets;
 const parameterAutomation=planParameterAutomation(fx.automation,{...patch,type:patch.type??"vocal"},{start,end:start+duration,step:elapsedSteps,unit,limitStep:elapsedSteps+duration/unit,...timeline,start,end:start+duration});
 if(fx.filter&&!processorBypassed(patch,"filter")){
  filter=add(context.createBiquadFilter());filter.type=fx.filter.type;filterStage=cascadeFilter(context,filter,patch,owner);
  filter.frequency.value=0;
  const base=context.createConstantSource(),sweep=add(context.createGain());
  owner.sources.push(base);base.offset.setValueAtTime(fx.filter.cutoff,start);
  const sweepPlan=planFilterSweep(fx.filter,start,duration+elapsed,"sample");
  sweep.gain.setValueAtTime(filterSweepRatioAt(sweepPlan,fx.filter.cutoff,elapsed),start);
  if(elapsed<sweepPlan.sweepDuration)sweep.gain.exponentialRampToValueAtTime(1,start+sweepPlan.sweepDuration-elapsed);
  base.connect(sweep);for(const node of filterStage.filters)sweep.connect(node.frequency);base.start(start);base.stop(start+duration+.04);
  automationTargets.set('filter.cutoff',base.offset);automationTargets.set('filter.resonance',filter.Q);
  filter.Q.setValueAtTime(fx.filter.resonance,start);
  if(motion.tone>0)for(const node of filterStage.filters)scheduleMovementLfo(context,node.frequency,start,duration,motion.toneRate,fx.filter.cutoff*motion.tone*.8,owner,{elapsed});
  stages.set("filter",filterStage);
 }
 if(fx.drive>0&&!processorBypassed(patch,"drive")){
  const shaper=add(context.createWaveShaper()),comp=add(context.createGain());
  configureDriveShaper(shaper,fx.drive);comp.gain.value=1/(1+fx.drive*1.1);
  shaper.connect(comp);stages.set("drive",{input:shaper,output:comp});
 }
 const eqStage=!processorBypassed(patch,"eq")&&createEq(context,patch.eq,owner);if(eqStage)stages.set("eq",eqStage);
 signal=connectProcessingGraph(context,signal,patch,stages,owner);
 signal.connect(amp);
 const pulse=add(context.createGain());pulse.gain.setValueAtTime(1,start);
 scheduleMovementLfo(context,pulse.gain,start,duration,motion.tremoloRate,motion.tremolo*.45,owner,{elapsed});
 const movementGain=add(context.createGain());movementGain.gain.value=1;automationTargets.set("amplitude",movementGain.gain);automationTargets.set("pan",pan.pan);
 amp.connect(pulse);pulse.connect(movementGain);movementGain.connect(gate);connectStereoImage(context,gate,patch,owner,source.buffer?.numberOfChannels??1,{start,end:start+duration,lanes:parameterAutomation,targets:automationTargets}).connect(pan);pan.pan.value=fx.pan;
 const targets=new Map([['pan',pan.pan],['amplitude',movementGain.gain]]);if(filter){targets.set('filter.cutoff',cutoffDestination(context,filterStage.filters,start,start+duration,owner));targets.set('filter.resonance',filter.Q);}
 scheduleParameterAutomation(context,parameterAutomation,automationTargets,owner);
 attachModulation(context,{parameterAutomation,modulation:resolveModulation(fx.modulation,unit),start,off:start+duration,graphEnd:start+duration,expression,elapsed,resonance:fx.filter?.resonance},targets,owner);
 const dry=add(context.createGain());dry.gain.value=1-fx.delayMix*.4;pan.connect(dry);dry.connect(out);
 return {fx,tail:delayTailSeconds(fx),connectDelay(session,voice){
  if(!(fx.delayMix>0)||!voice.admitted&&session)return;
  if(session){pan.connect(session.delay(fx,voice));return;}
  const graph=createStereoDelay(context,fx,out);owner.nodes.push(...graph.nodes);pan.connect(graph.input);
 }};
}
// Transfer only shared processing, never oscillators, asset mapping or timing.
export function processingFromPatch(patch){
 const synth=patch.type==='synth',fx=recordedEffects({...patch,...(synth?{drive:patch.effects.drive,attack:patch.envelope.attack,release:patch.envelope.release}:{}),...(patch.effects??{})});
 const keys=['stereoWidth','msBalance','delayTone','delayPingPong','eq','filterStages','delaySync','chain','pan','transpose','attack','release','drive','delayMix','delayTime','delayFeedback','filter','movement','bend','modulation','automation'];
 const result=Object.fromEntries(keys.filter(key=>fx[key]!==undefined).map(key=>[key,structuredClone(fx[key])]));
 result.chain=structuredClone(processingChain(patch));
 if(result.filter===null&&!result.chain.bypass.includes('filter'))result.chain.bypass.push('filter');
 if(result.automation){const allowed=automationParameters({...result,type:'vocal'}).map(p=>p.id);result.automation=result.automation.filter(lane=>allowed.includes(lane.target));if(!result.automation.length)delete result.automation;}
 if(result.modulation)result.modulation.routes=result.modulation.routes.filter(route=>modulationTargetsFor('vocal').some(target=>target.id===route.target)&&modulationSourcesFor('vocal').includes(route.source.kind));
 if(result.filter)result.filter={...sampleTone({filter:result.filter}).filter};
 result.attack=clampParameterValue('envelope.attack',result.attack,'vocal');result.release=clampParameterValue('envelope.release',result.release,'vocal');
 return result;
}
export function applyProcessingToPatch(patch,processing){
 const fx=structuredClone(processing);
 if(patch.type==='synth'){
  for(const key of ['stereoWidth','msBalance','delayTone','delayPingPong','eq','filterStages','delaySync','chain','automation','pan','movement','bend','filter'])if(fx[key]!==undefined&&fx[key]!==null)patch[key]=fx[key];
  if(fx.filter===null){const chain=processingChain(patch);patch.chain={...chain,order:[...chain.order],bypass:[...new Set([...chain.bypass,'filter'])]};}
  patch.envelope.attack=clampParameterValue('envelope.attack',fx.attack??patch.envelope.attack);
  patch.envelope.release=clampParameterValue('envelope.release',fx.release??patch.envelope.release);
  for(const key of ['delayMix','delayTime','delayFeedback'])if(fx[key]!==undefined)patch.effects[key]=fx[key];
  if(fx.drive!==undefined)patch.effects.drive=fx.drive;
  if(fx.modulation){patch.modulation=fx.modulation;patch.version=2;}
 }else Object.assign(patch,fx);
 patch.presetId='custom';return patch;
}

export const validateRecordingAutomation=(block,patch={type:"vocal"})=>block===undefined?[]:validateAutomation(block,patch,1000000);
