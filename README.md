# pre-midi

A local-first, standalone music studio for [pre-programmed](https://github.com/natanai/pre-programmed).

**Open the studio:** https://natanai.github.io/pre-midi/ — served by GitHub Pages, no account or backend.

## Editing
- **Instruments** own their complete, editable sound patches. Sound settings Those settings affect every chunk belonging to that instrument.
- **Timeline** shows the complete composition, one lane per instrument. Click any bar to choose that instrument's chunk, leave it empty, or create and assign a new chunk immediately.
- **Chunks** are reusable one-bar groups of notes. Selecting one opens its notes; reuse the same chunk in multiple bars without making copies.
- **Notes** are placed in the piano roll. Drag the visible right-edge handle to lengthen or shorten a note in sixteenth-note steps. Alt+Left/Right on a note also changes its length. The “New note length” control only determines the default for notes you place next.
- **Play** stays active when you edit notes, choose chunks, change instrument settings, or undo/redo. The audio scheduler reads the live score.
- **Live editing is silent:** while the loop plays, clicking to add a note does not audition it separately. When stopped, note placement previews the pitch.
- **Piano-roll playhead:** a thin marker moves across the selected chunk's notes in sync with the audio clock, and appears only when that chunk is actually scheduled on its instrument lane.
- **Undo/redo**, browser autosave, native .premidi import/export, and offline WAV export are included.

## Development approach

Pre-midi is now the primary development surface for the music studio. We are refining its user experience, native synthesizer and composition model **without updating pre-programmed after every studio iteration**. The current v3 synthesizer format **is not yet compatible with pre-programmed's v2 Media importer**. We are intentionally developing the studio first and will synchronize the engine at a planned parity milestone.

The [development direction](docs/development-direction.md) records that boundary, the modular instrument/synthesizer architecture, and how we will bring pre-programmed back into full parity when the studio is mature.

## Instrument library and sound design

Choose **Add instrument** to browse 17 original, sample-free instrument recipes. Categories include Bass, Lead, Keys, Pads, Winds and Percussion. Use **Preview** to hear one before adding it. Select **Browse sounds** on an existing instrument to replace its patch without replacing its notes or timeline chunks.

Every recipe is fully editable using the single native sound editor. It currently includes:
- Two independent oscillators: wave shape, mix level, octave and fine detuning.
- Noise generation and selectable resonant filters (low/high/bandpass/notch).
- Full amplitude ADSR (attack/decay/sustain/release).
- Vibrato (rate and depth), stereo pan.
- Distortion and feedback delay with wet mix and timing.
- Instrument output volume.

**Save preset** adds your modification to a browser-local personal instrument library for reuse in new compositions. Full patch parameters are embedded in each exported .premidi file, so those compositions remain self-contained without the personal library. Browser-local saved presets are not automatically portable to another device.

The library and synthesis algorithms are original to pre-midi; no third-party soundbanks or audio samples are bundled. Live playback, audition and WAV rendering use the same Web Audio synth.

## File contract and current limits

The current experimental portable format is **.premidi v3**. Its canonical validator is in schema.js and synth.js. It preserves an instrument's entire patch, chunks, note data and timeline. No conversion adapters for old exported formats are included. A one-time recovery for locally saved browser-only v2 drafts preserves note work made before sound patches were added.

**Pre-programmed's live Media integration still supports v2, not v3.** Do not import v3 compositions into the game yet. As agreed, parity will be updated once pre-midi's musical capabilities and native schema are more settled.

Still to come: recorded samples and SoundFonts, deeper modulation/routing, parameter automation, FLAC, General MIDI, richer timeline durations and more complete mixing. Current limits: 4/4, 16 bars, 12 instruments, 32 one-bar chunks per instrument.

### Run locally and verify
Serve the folder via a static web server and open its index page. Node.js 20+ can run `npm run check`. No npm dependencies or build step.
