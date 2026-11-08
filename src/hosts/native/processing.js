import {processingFlags,processorMix} from '../../dsp/processing-chain.js';
import {defaultEq,eqCoefficients} from '../../dsp/equalizer.js';
export const PROCESSING_TRAILER_BYTES=380;
export function encodeProcessing(patch,rate,u32,f64){
 u32(processingFlags(patch));for(const id of ['filter','drive','eq'])f64(processorMix(patch,id));u32(patch.filterStages??1);
 const bands=(patch.eq??defaultEq()).bands;
 for(let i=0;i<8;i++)(bands[i]?eqCoefficients(bands[i],rate):[1,0,0,0,0]).forEach(f64);
 f64(patch.stereoWidth??1);f64(patch.msBalance??0);f64(patch.delayTone??20000);u32(patch.delayPingPong?1:0);
}
