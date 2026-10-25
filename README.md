# pre-midi

A local-first, standalone music studio for [pre-programmed](https://github.com/natanai/pre-programmed).

**Open the studio:** https://natanai.github.io/pre-midi/ — served by GitHub Pages, no account or backend.

## Editing
- **Instruments** own complete, editable sound patches. Their settings affect every chunk belonging to that instrument.
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

## Instruments, recordings and samples

**Add instrument** opens one combined library. It includes the 17 original
procedural synthesizer recipes *and* 11 sampled instrument choices using 14
verified CC0 recordings: piano, nylon guitar, steel guitar, recorder, whistle,
kick, snare, clap, closed/open hi-hat and bongo. Preview one, then Add; use
**Browse sounds** to replace an existing instrument's sound without changing
its notes or timeline chunks.

For synthesized instruments, the existing sound editor provides two
oscillators, noise, resonant filters, full ADSR, vibrato, stereo pan, distortion
and feedback delay. The *same instrument owner* renders sampled instruments'
volume, envelope, transpose, stereo pan, pitch-follow mode, and audio source.
Import your own WAV, OGG or MP3 (up to 1 MB per sample), or replace a sample
directly through the Sound panel.

Piano and guitars have two sampled root-note zones, with nearby pitches played
at adjusted rates. Other recordings currently use one key zone. This is a
starter recorded library, not a full multisampled orchestra or a SoundFont
player.

All recordings in the supplied library are CC0 1.0 and reproducibly fetched
into the GitHub Pages artifact with pinned Git checksums. Their specific
sources are listed in [recording credits](docs/sample-sources.md).
The native .premidi file embeds the recorded audio bytes, mapping and controls;
the finished score never relies on a remote URL. An author's own imported
samples must have suitable usage and distribution rights.

Use **Save preset** to reuse custom sounds from this browser. Personal preset
libraries are browser-local, but audio actually used in a composition travels
with the .premidi file.

## Native format and current limits

The experimental **.premidi v4** score owns two types of instruments, synth and
sampler, using canonical validation and the same playback engine. Embedded,
deduplicated sample data is stored in the composition. IndexedDB supports
larger browser-local drafts. The portable file limit is 15 MB.

**Pre-programmed still understands v2, not v4**. As agreed, we'll integrate
when pre-midi's instrument and score formats settle. No v2 or v3 file import
conversion layer is added; existing browser-local v3 synth drafts can recover
into the new draft format.

Still to come: SoundFont/SFZ import, richer multisampling and velocity layers,
deeper modulation/effect routing, automation, FLAC, General MIDI, variable
timeline lengths and advanced mixing. Current timeline limits are 4/4, 16 bars,
12 instruments and up to 32 one-bar chunks per instrument.

### Run locally and verify
Serve the folder via a static web server and open its index page. Node.js 22+ can run `npm run check`, then `node scripts/fetch-samples.mjs` to download and verify recorded library samples for local static hosting. The GitHub Pages workflow does this automatically. No npm dependencies or server backend.
