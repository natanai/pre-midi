// Phone piano roll follows the same phrase-instance clock as desktop playback.
// A selected Chunk has no scanning line when it is not active in this bar.
import {chunkProgress} from "../arrangement.js";
import {KEY_WIDTH} from "./gestures/roll.js";
export function phonePlayheadX(beat,instrumentId,chunkId,position,stepWidth){
 if(!Number.isFinite(stepWidth)||stepWidth<=0)return null;
 const progress=chunkProgress(beat,instrumentId,chunkId,position);
 return progress===null?null:KEY_WIDTH+Math.max(0,Math.min(16,progress))*stepWidth;
}
