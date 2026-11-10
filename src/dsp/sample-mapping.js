import {parameterFor,validParameterValue} from './parameters.js';
export const SAMPLE_RANGE_FIELDS=Object.freeze(['keyLow','keyHigh','velocityLow','velocityHigh']);
export const sampleZoneRange=zone=>Object.fromEntries(SAMPLE_RANGE_FIELDS.map(k=>[k,zone?.[k]??parameterFor('zones.'+k,'sample').default]));
export function validateSampleRange(zone){
 for(const k of SAMPLE_RANGE_FIELDS)if(zone?.[k]!==undefined&&!validParameterValue('zones.'+k,zone[k],'sample'))return 'Invalid sample key or velocity range';
 const p=sampleZoneRange(zone);return p.keyLow>p.keyHigh||p.velocityLow>p.velocityHigh?'Sample range minimum cannot exceed its maximum':null;
}
export function sampleZoneContains(zone,pitch,velocity){const p=sampleZoneRange(zone);return pitch>=p.keyLow&&pitch<=p.keyHigh&&velocity>=p.velocityLow&&velocity<=p.velocityHigh;}
export function sampleZoneWithRange(zone,fields){
 if(!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(k=>!SAMPLE_RANGE_FIELDS.includes(k)))throw Error('Only sample range fields can be changed here');
 const next={...zone,...fields},error=validateSampleRange(next);if(error)throw Error(error);return next;
}
