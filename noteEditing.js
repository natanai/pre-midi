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
