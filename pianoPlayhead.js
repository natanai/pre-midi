// A piano-roll scrubber follows only the selected chunk when it is actually
// playing on its instrument lane. The music data and playback timing own this
// state; this module never edits the beat.
import {chunkProgress} from "./arrangement.js";
export function chunkIsPlaying(beat, instrumentId, chunkId, position) {
 return chunkProgress(beat,instrumentId,chunkId,position)!==null;
}
export function pianoScrubberX(step, gridWidth, gutterWidth = 63) {
 const progress = Math.min(16, Math.max(0, step));
 return gutterWidth + (gridWidth - gutterWidth) * progress / 16;
}
