import {SOURCE_PROCESSING_PARAMETERS} from './parameters.js';
import {sampleSourceRegion} from '../../sampleSlice.js';
const DEFAULT_SOURCE_SETTINGS=Object.freeze(Object.fromEntries(Object.entries(SOURCE_PROCESSING_PARAMETERS).map(([k,p])=>[k,p.default])));
export const sourceSettings=patch=>patch?.sourceProcessing?{...DEFAULT_SOURCE_SETTINGS,...patch.sourceProcessing}:DEFAULT_SOURCE_SETTINGS;
export function validateSourceProcessing(value){
 if(value===undefined)return [];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!SOURCE_PROCESSING_PARAMETERS[k]))return ['Invalid recorded source processing.'];
 return Object.entries(value).every(([k,v])=>{const p=SOURCE_PROCESSING_PARAMETERS[k];return p.values?p.values.includes(v):p.unit==='boolean'?typeof v==='boolean':Number.isFinite(v)&&v>=p.min&&v<=p.max;})?[]:['Invalid recorded source processing.'];
}
export const sourceRate=(patch,pitch=patch?.transpose??0)=>sourceSettings(patch).mode==='independent'?1:2**(pitch/12);
export function sourceRecipe(patch,start,duration,pitch=patch?.transpose??0){
 const errors=validateSourceProcessing(patch?.sourceProcessing);if(errors.length)throw Error(errors.join(' '));
 const p=sourceSettings(patch),semitones=p.mode==='independent'?pitch:0;
 if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0||!Number.isFinite(semitones)||Math.abs(semitones)>48)throw Error('Independent source pitch supports up to four octaves; source region must be finite.');
 return {start,duration,time:p.time,semitones,formant:p.formant,preserve:p.preserveFormants,reverse:p.reverse};
}
export const needsSourceProcessing=recipe=>recipe.time!==1||recipe.semitones!==0||recipe.formant!==0||recipe.reverse;
export const sourceKey=(id,p)=>'source:'+JSON.stringify([id,p.start,p.duration,p.time,p.semitones,p.formant,p.preserve,p.reverse]);
export function sampleSourceRequest(patch,note,zone,duration){
 const region=sampleSourceRegion(zone,duration,1),pitch=patch.transpose+(patch.followPitch?note.pitch-zone.root:0),recipe=sourceRecipe(patch,region.offset,region.sourceLength,pitch);
 return {recipe,key:sourceKey(zone.assetId,recipe),rate:sourceRate(patch,pitch),region};
}
export function vocalSourceRequest(recording,clip,duration=recording.durationSeconds){
 const start=recording.trimSeconds+(clip.trimStartSeconds??0),end=Math.min(duration,recording.durationSeconds-(clip.trimEndSeconds??0)),recipe=sourceRecipe(clip.effects??{},start,end-start);
 return {recipe,key:sourceKey(recording.id,recipe)};
}
