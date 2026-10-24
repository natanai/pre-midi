# pre-midi

A local-first, standalone music studio for [pre-programmed](https://github.com/natanai/pre-programmed).

**Open the studio:** https://natanai.github.io/pre-midi/ — served by GitHub Pages, no account or backend.

## Editing
- **Instruments** own their waveform and sound controls. Those settings affect every chunk belonging to that instrument.
- **Timeline** shows the complete composition, one lane per instrument. Click any bar to choose that instrument's chunk, leave it empty, or create and assign a new chunk immediately.
- **Chunks** are reusable one-bar groups of notes. Selecting one opens its notes; reuse the same chunk in multiple bars without making copies.
- **Notes** are placed in the piano roll. Drag the visible right-edge handle to lengthen or shorten a note in sixteenth-note steps. Alt+Left/Right on a note also changes its length. The “New note length” control only determines the default for notes you place next.
- **Play** stays active when you edit notes, choose chunks, change instrument settings, or undo/redo. The audio scheduler reads the live score.
- **Live editing is silent:** while the loop plays, clicking to add a note does not audition it separately. When stopped, note placement previews the pitch.
- **Piano-roll playhead:** a thin marker moves across the selected chunk's notes in sync with the audio clock, and appears only when that chunk is actually scheduled on its instrument lane.
- **Undo/redo**, browser autosave, native .premidi import/export, and offline WAV export are included.

## Development approach

Pre-midi is now the primary development surface for the music studio. We are refining its user experience, native synthesizer and composition model **without updating pre-programmed after every studio iteration**. The current native v2 schema still matches the game's existing Media integration, but future experimental score changes may temporarily go beyond what the game can import until a planned parity release.

The [development direction](docs/development-direction.md) records that boundary, the modular instrument/synthesizer architecture, and how we will bring pre-programmed back into full parity when the studio is mature.

## File contract
The current unreleased native file schema is **v2**, defined exclusively in `schema.js`. It encodes `instruments`, each instrument's reusable `chunks`, and its `timeline` assignments, plus canonical note identities and synthesis controls. Pre-programmed's Media playback and D1 import/export use the same format. v1 was unused and intentionally discarded: there is no dual schema or conversion path.

This remains an early synth-only studio. Notes and chunks are limited to one 4/4 bar, with up to 16 timeline bars, 12 instruments, and 32 chunks per instrument. No standard MIDI, FLAC, samples or effects yet.

### Run locally and verify
Serve the folder via a static web server and open its index page. Node.js 20+ can run `npm run check`. No npm dependencies or build step.
