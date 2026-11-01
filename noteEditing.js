/**
 * Piano-roll editing rules. Changes remain canonical note events on a chunk.
 * Keeping grid math outside DOM handlers makes drag, keyboard and future
 * MIDI editing share the same constraints.
 */
export function noteDurationLimit(chunk, note) {
 const next = chunk.notes
  .filter(other => other.id !== note.id && other.pitch === note.pitch && other.start > note.start)
  .reduce((start, other) => Math.min(start, other.start), 16);
 return Math.max(1, next - note.start);
}
export function resizeNote(chunk, noteId, requestedDuration) {
 const note = chunk.notes.find(item => item.id === noteId);
 if (!note) return null;
 const proposed = Number.isFinite(requestedDuration) ? Math.round(requestedDuration) : note.duration;
 note.duration = Math.max(1, Math.min(noteDurationLimit(chunk, note), proposed));
 return note.duration;
}

/**
 * Move one piano-roll event on the sixteenth-step grid. A note keeps its
 * identity, duration, velocity and expression, and may never overlap another
 * event at the same pitch. Pitch bounds are supplied by the visible editor.
 */
export function moveNote(chunk, noteId, requestedStart, requestedPitch, {minPitch=0,maxPitch=127}={}) {
 const note=chunk.notes.find(item=>item.id===noteId);
 if(!note)return null;
 if(!Number.isFinite(requestedStart)||!Number.isFinite(requestedPitch))return false;
 const start=Math.max(0,Math.min(16-note.duration,Math.round(requestedStart)));
 const pitch=Math.max(minPitch,Math.min(maxPitch,Math.round(requestedPitch)));
 if(chunk.notes.some(other=>other.id!==noteId && other.pitch===pitch &&
  start<other.start+other.duration && other.start<start+note.duration))return false;
 note.start=start;
 note.pitch=pitch;
 return true;
}
