import {validParameterValue} from './parameters.js';
export function validateStereo(patch){
 const issues=[];
 for(const key of ['stereoWidth','msBalance','delayTone'])if(patch[key]!==undefined&&!validParameterValue(key,patch[key]))issues.push('Invalid '+key+'.');
 if(patch.delayPingPong!==undefined&&typeof patch.delayPingPong!=='boolean')issues.push('Invalid delay stereo mode.');return issues;
}
export function stereoSample(left,right,width=1,balance=0){
 if(width===1&&balance===0)return [left,right];
 const mid=(left+right)*.5*(balance>0?1-balance:1),side=(left-right)*.5*width*(balance<0?1+balance:1);return [mid+side,mid-side];
}
