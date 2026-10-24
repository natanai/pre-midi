// A piano-roll scrubber follows only the selected chunk when it is actually
// playing on its instrument lane. The music data and playback timing own this
// state; this module never edits the composition.
export function chunkIsPlaying(score, instrumentId, chunkId, position) {
 if (!position || !Number.isInteger(position.bar) || position.bar < 0 || position.bar >= score.bars) return false;
 const instrument = score.instruments.find(candidate => candidate.id === instrumentId);
 return !!instrument && instrument.timeline[position.bar] === chunkId;
}
export function pianoScrubberX(step, gridWidth, gutterWidth = 63) {
 const progress = Math.min(16, Math.max(0, step));
 return gutterWidth + (gridWidth - gutterWidth) * progress / 16;
}
