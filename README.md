# pre-midi

A local-first, standalone music studio for [pre-programmed](https://github.com/natanai/pre-programmed).

**Open the studio:** https://natanai.github.io/pre-midi/ — served by GitHub Pages, no account or backend.

## Editing
- **Instruments** own complete, editable sound patches. Their settings affect every chunk belonging to that instrument.
- **Timeline** shows the complete composition, one lane per instrument. Click any bar to choose that instrument's chunk, leave it empty, or create and assign a new chunk immediately.
- **Chunks** are reusable one-bar groups of notes. Selecting one opens its notes; reuse the same chunk in multiple bars without making copies.
- **Note strength** can be Soft, Medium or Firm when placing notes; Shift-click an existing note to cycle its strength. On guitars, this chooses an actual recorded playing style, rather than only changing loudness.
- **Notes** are placed in the piano roll. Drag the visible right-edge handle to lengthen or shorten a note in sixteenth-note steps. Alt+Left/Right on a note also changes its length. The “New note length” control only determines the default for notes you place next.
- **Play** stays active when you edit notes, choose chunks, change instrument settings, or undo/redo. The audio scheduler reads the live score.
- **Live editing is silent:** while the loop plays, clicking to add a note does not audition it separately. When stopped, note placement previews the pitch.
- **Piano-roll playhead:** a thin marker moves across the selected chunk's notes in sync with the audio clock, and appears only when that chunk is actually scheduled on its instrument lane.
- **Undo/redo**, browser autosave, native .premidi import/export, and offline WAV export are included.

## Singing notes, bends and wave modulation

The **Expressive** sound category adds six original sustained synthesizers
and three recorded guitar interpretations, including **Lap Steel Cry**,
**Steel Guitar Haunt**, **Nylon String Sigh**, **Midnight Theremin**,
**Feedback Cry**, **Glass Portamento**, **Broken Siren**, **Pulse Vowel**
and **Orbiting Wire**. These are editable, real instrument patches, not audio
demonstrations or additional runtime systems.

In the piano roll, **normal clicks add or remove notes**. Shift-click an
existing note to change its strength, and drag its bright right edge to resize
it. Editing a note's sound is a deliberate *mode*, not the usual way to
compose: choose **Edit note effects** to focus on individual notes. The
instrument and timeline controls visibly recede while that mode is active;
click a note to reveal its pitch contour, then choose **Done** to return to
normal note entry.

Instrument-wide **Movement** is now the default. Every instrument has editable
glide, vibrato, pulse, and an optional default bend (Straight, Scoop, Rise,
Fall, Dip, Wail or Wave). The synth also supports a moving tone filter.
Per-note mode can override the instrument's bend for any specific held note.
The rest of that instrument's notes continue to inherit its default. Bend
and movement remain first-class composition data, rendered by the same live
and WAV engine.

Instrument controls use compact keyboard/touch-accessible **dials**, with the
most important Movement controls open by default; deeper oscillator,
envelope, effect, and sample-map settings remain progressively disclosed.
A dual **Sound Shape / Pitch Movement** visualization changes as the dials
are moved, before a parameter is committed. For synthesizers its sound trace
is illustrative rather than a full oscilloscope, while sampled sounds use a
decoded recorded waveform when available. The purple pitch trace shows the
instrument-wide expressive motion.

**New compositions start without any notes**, and without a repeated
four-bar demo arrangement. The first empty editable chunk is ready for
notes immediately. **Browse sounds** now renames the active instrument to the
sound selected, rather than leaving its previous name. Steel Strum uses a
wider chord brush and shorter, brighter articulation; its preview now plays
a real chord, rather than an indistinguishable single pluck.

## Composer-first workspace and optional examples

The **timeline and piano roll are the principal workspace**. On wide screens,
Sound sits beside them as a separately scrollable, sticky inspector. Use
**Sound** in the Notes heading to hide or reopen it for more piano-roll space.
On tablets and phones, the same Sound panel opens as a compact bottom sheet.
Choose **Expand** to reveal all dials and sample controls, **Compact** to
return to its smaller form, or **×** to close. Playback, selected chunk,
timeline and piano-roll scroll position remain intact through these layout
changes. No second copy of the sound editor is introduced.

The inspector's oscillator/envelope/movement panels now size to their own
contents, avoiding the formerly large blank grid cells that pushed Notes
away from composing.

**New always starts blank.** Choose **Examples** only when you want a
playable demonstration. Five carefully assembled compositions use the normal
instruments, native chunks and effects: Neon After Hours (electronic dance),
Porchlight (acoustic folk), Floating Signals (slow ambient, 16 bars),
Broken Circuit (industrial synth), and Swaying Wire (expressive recorded
guitar). Every example is a real editable score, with reusable sections,
several instruments, and both synth and recorded CC0 samples where relevant.
Opening an example explicitly replaces the current browser draft after a
confirmation; export your current .premidi first to keep a separate copy.

Example audio files are included with that composition when loaded, so
exporting its music bundle remains portable. Examples are *not* additional
playback systems or an alternative persistence path. They demonstrate the
existing native v5 music structures.

## Record your own instruments

**Record sound** is a main toolbar action and an option in the instrument library.
Choose a duration: **1.5 seconds** by default for a short note, **0.75 seconds**
for a hit, or **3–4 seconds** for a longer ringing sound. Choose **A note**
(one guitar string, voice, whistle) or **A hit** (clap, tap, drum, noise).
Start, grant microphone access, and follow the 3–2–1 countdown. The studio
records just that short window and stops automatically.

Listen back before using the sound; retry as often as needed. For a clear
single-pitched recording the studio suggests its original note; correct the
guess if needed. A hit requires no detected note. **Use this recording**
creates an ordinary editable instrument, not a separate sample player.

The recording is a **mono 44.1 kHz, 16-bit PCM WAV**. Short capture windows
limit file sizes. Automatic pitch estimation is fallible, especially for
chords, noisy sounds or unusual harmonics.

## Separate music data and audio assets

- Synth-only compositions export one small, human-readable **.premidi**.
- Sampled compositions export a **ZIP** with the .premidi file plus an
  **assets/** folder containing ordinary WAV, OGG, or MP3 files.
- The .premidi manifest holds relative paths and editable instrument
  parameters—not Base64 audio data.
- Import the ZIP to reload both the project and its recorded sounds.
- A bare .premidi containing audio references needs its accompanying
  asset files; pre-midi will ask for the complete ZIP rather than silently
  play a missing sound.

Pre-programmed does not yet implement the new v5 manifest; the bundle is
prepared for its future game-asset importer, not immediate compatibility.
Recordings made here stay raw WAV files. Existing open-source OGG recordings
remain OGG to avoid unnecessary conversion.
## Development approach

Pre-midi is now the primary development surface for the music studio. We are refining its user experience, native synthesizer and composition model **without updating pre-programmed after every studio iteration**. The experimental v5 instrument format **is not yet compatible with pre-programmed's v2 Media importer**. We are intentionally developing the studio first and will synchronize the engine at a planned parity milestone.

The [development direction](docs/development-direction.md) records that boundary, the modular instrument/synthesizer architecture, and how we will bring pre-programmed back into full parity when the studio is mature.

## Instruments, recordings and samples

**Add instrument** opens one combined library. It includes the 17 original
procedural synthesizer recipes *and* 13 sampled instrument choices using 122
verified CC0 recordings: piano, several acoustic guitars, recorder, whistle,
kick, snare, clap, closed/open hi-hat and bongo. Preview one, then Add; use
**Browse sounds** to replace an existing instrument's sound without changing
its notes or timeline chunks.

For synthesized instruments, the existing sound editor provides two
oscillators, noise, resonant filters, full ADSR, vibrato, stereo pan, distortion
and feedback delay. The *same instrument owner* renders sampled instruments'
volume, envelope, transpose, stereo pan, pitch-follow mode, and audio source.
Import your own WAV, OGG or MP3 (up to 1 MB per sample), or replace a sample
directly through the Sound panel.

**Acoustic guitar** now uses 18 strategically recorded pitches across all six strings,
from E2 to B5, with up to three *distinct recorded dynamic takes* per pitch. Choose
Nylon Fingerstyle, Nylon Picked, Steel Acoustic or Steel Strum. Picked and steel
recordings switch actual soft/firm attacks based on each note's Strength.
The Strum control brushes chord notes from bass to treble or in reverse, and
recorded notes naturally ring out instead of stopping abruptly. More extensive
sample mapping is available under a collapsible editor.

Piano still uses two sampled root-note zones; other recordings generally use
one. The acoustic guitars are now multisampled, though they are not a full
sample-by-sample 375-take instrument or SFZ/SoundFont player.

All recordings in the supplied library are CC0 1.0 and reproducibly fetched
into the GitHub Pages artifact with pinned Git checksums. Their specific
sources are listed in [recording credits](docs/sample-sources.md).
The native .premidi manifest references separate sound assets; the portable ZIP contains the corresponding files. An author's own imported
samples must have suitable usage and distribution rights.

Use **Save preset** to reuse custom sounds from this browser. Personal preset
libraries are browser-local, but audio used in a composition travels alongside the .premidi file in the exported ZIP.

## Native format and current limits

The experimental **.premidi v5** score owns two types of instruments, synth and
sampler, using canonical validation and the same playback engine. Audio is referenced by relative asset paths, not embedded in the exported composition. IndexedDB supports
larger browser-local drafts. The portable file limit is 15 MB.

**Pre-programmed still understands v2, not v4**. As agreed, we'll integrate
when pre-midi's instrument and score formats settle. No v2 or v3 file import
conversion layer is added; existing browser-local v3 synth drafts can recover
into the new draft format.

Still to come: freehand bend-curve drawing, multi-bar held notes, SoundFont/SFZ import, additional acoustic articulations,
deeper modulation/effect routing, automation, FLAC, General MIDI, variable
timeline lengths and advanced mixing. Current timeline limits are 4/4, 16 bars,
12 instruments and up to 32 one-bar chunks per instrument.

### Run locally and verify
Serve the folder via a static web server and open its index page. Node.js 22+ can run `npm run check`, then `node scripts/fetch-samples.mjs` to download and verify recorded library samples for local static hosting. The GitHub Pages workflow does this automatically. No npm dependencies or server backend.
