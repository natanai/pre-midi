import {POST_PROCESSOR_LIMIT} from './parameters.js';
import {DYNAMICS_KINDS,compileDynamics} from './dynamics.js';
import {MOD_EFFECT_KINDS,modEffectRecipe,modEffectTail,delayEffect,frequencyEffect} from './modulation-effects.js';
export const POST_PROCESSOR_KINDS=Object.freeze([...DYNAMICS_KINDS,...MOD_EFFECT_KINDS]);
export function compilePostProcessing(patch,unit=.125){
 const chain=patch.chain;if(!chain)return [];
 const order=chain.post??[],instances=chain.instances??[],bypass=chain.bypass??[];
 if(!Array.isArray(order)||order.length>POST_PROCESSOR_LIMIT||new Set(order).size!==order.length)throw Error('Invalid post-level processing order');
 const dynamics=new Map(compileDynamics(patch).map(p=>[p.id,p]));
 return order.flatMap(id=>{
  const node=instances.find(p=>p.id===id),mix=chain.mix?.[id]??1;
  if(!node||!POST_PROCESSOR_KINDS.includes(node.kind)||!Number.isFinite(mix)||mix<0||mix>1)throw Error('Invalid post-level processor');
  if(bypass.includes(id)||mix===0)return [];
  return [dynamics.get(id)??{id,...modEffectRecipe(node.kind,node.parameters,mix,unit)}];
 });
}
export const postTailSeconds=(patch,unit=.125)=>compilePostProcessing(patch,unit).reduce((n,p)=>n+(MOD_EFFECT_KINDS.includes(p.kind)?modEffectTail(p):0),0);
export const needsPostDelay=patch=>compilePostProcessing(patch).some(p=>delayEffect(p.kind)||frequencyEffect(p.kind));
export function songNeedsPostDelay(song){
 return [...(song.beats??[]).flatMap(b=>b.instruments??[]),...(song.tracks??[]).flatMap(t=>t.freeform?.instruments??[])].some(i=>(i.sounds??[{patch:i.patch}]).some(s=>s.patch&&needsPostDelay(s.patch)))||
  (song.tracks??[]).some(t=>t.kind==='vocal'&&t.clips?.some(c=>c.effects&&needsPostDelay(c.effects)));
}
