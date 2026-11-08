import {processingFlags,processorMix} from '../../dsp/processing-chain.js';
import {defaultEq,eqCoefficients} from '../../dsp/equalizer.js';
export const PROCESSING_TRAILER_BYTES=192;
export function encodeProcessing(patch,rate,u32,f64){
 u32(processingFlags(patch));for(const id of ['filter','drive','eq'])f64(processorMix(patch,id));u32(patch.filterStages??1);
 for(const band of (patch.eq??defaultEq()).bands)eqCoefficients(band,rate).forEach(f64);
}
