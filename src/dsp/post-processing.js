import {postAutomationMask,POST_AUTOMATION_FIELDS} from './processor-automation.js';
import {POST_PROCESSOR_LIMIT} from './parameters.js';
import {DYNAMICS_KINDS,compileDynamics} from './dynamics.js';
import {MOD_EFFECT_KINDS,modEffectRecipe,modEffectTail,delayEffect,frequencyEffect} from './modulation-effects.js';
export const POST_PROCESSOR_KINDS=Object.freeze([...DYNAMICS_KINDS,...MOD_EFFECT_KINDS]);
export function compilePostProcessing(patch,unit=.125,lanes=patch.automation??[]){
 const chain=patch.chain;if(!chain)return [];
 const order=chain.post??[],instances=chain.instances??[],bypass=chain.bypass??[];
 if(!Array.isArray(order)||order.length>POST_PROCESSOR_LIMIT||new Set(order).size!==order.length)throw Error('Invalid post-level processing order');
 const dynamics=new Map(compileDynamics(patch,lanes).map(p=>[p.id,p]));
 return order.flatMap(id=>{
  const node=instances.find(p=>p.id===id),mix=chain.mix?.[id]??1;
  if(!node||!POST_PROCESSOR_KINDS.includes(node.kind)||!Number.isFinite(mix)||mix<0||mix>1)throw Error('Invalid post-level processor');
  const automationMask=postAutomationMask(lanes,id);
  if(bypass.includes(id)||(mix===0&&!automationMask))return [];
  const recipe={...(dynamics.get(id)??{id,...modEffectRecipe(node.kind,node.parameters,mix,unit)}),automationMask};
  if(frequencyEffect(node.kind)&&(automationMask&(1<<POST_AUTOMATION_FIELDS.indexOf('frequency')))){
   const frequencies=[node.parameters.frequency,...lanes.filter(lane=>!lane.bypass&&lane.target==='processor.'+id+'.frequency').flatMap(lane=>lane.points.map(point=>point.value))];
   recipe.frequencyLow=Math.min(...frequencies);recipe.frequencyHigh=Math.max(...frequencies);
  }
  return [recipe];
 });
}
export function postTailSeconds(patch,unit=.125,lanes=patch.automation??[]){
 return compilePostProcessing(patch,unit,lanes).reduce((seconds,recipe)=>{
  if(!MOD_EFFECT_KINDS.includes(recipe.kind))return seconds;
  const p={...recipe};
  for(const lane of lanes)if(!lane.bypass&&lane.target.startsWith('processor.'+p.id+'.')){
   const field=lane.target.split('.')[2],values=lane.points.map(point=>point.value);
   if(field==='frequency')p.frequency=Math.min(p.frequency,...values);
   else if(['mix','depth','delay'].includes(field))p[field]=Math.max(p[field],...values);
   else if(field==='feedback')p.feedback=Math.max(Math.abs(p.feedback),...values.map(Math.abs));
  }
  return seconds+modEffectTail(p);
 },0);
}
export const needsPostDelay=patch=>compilePostProcessing(patch).some(p=>delayEffect(p.kind)||frequencyEffect(p.kind));
export function songNeedsPostDelay(song){
 return [...(song.beats??[]).flatMap(b=>b.instruments??[]),...(song.tracks??[]).flatMap(t=>t.freeform?.instruments??[])].some(i=>(i.sounds??[{patch:i.patch}]).some(s=>s.patch&&needsPostDelay(s.patch)))||
  (song.tracks??[]).some(t=>t.kind==='vocal'&&t.clips?.some(c=>c.effects&&needsPostDelay(c.effects)));
}
