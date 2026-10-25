// A piano-roll scrubber follows only the selected chunk when it is actually
// playing on its instrument lane. The music data and playback timing own this
// state; this module never edits the composition.
import {chunkProgress} from "./arrangement.js";
export function chunkIsPlaying(score, instrumentId, chunkId, position) {
 return chunkProgress(score,instrumentId,chunkId,position)!==null;
}
export function pianoScrubberX(step, gridWidth, gutterWidth = 63) {
 const progress = Math.min(16, Math.max(0, step));
 return gutterWidth + (gridWidth - gutterWidth) * progress / 16;
}
