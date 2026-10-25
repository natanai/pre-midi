# pre-midi

A local-first, standalone music studio for [pre-programmed](https://github.com/natanai/pre-programmed).

**Open the studio:** https://natanai.github.io/pre-midi/ — served by GitHub Pages, no account or backend.

## Editing
- **Instruments** own a piano-roll sound or a rack of independent sounds, plus shared chunks, a timeline lane, and master volume. Every sound keeps its complete editable synth or sampler patch.
- **Timeline** shows the complete composition, one lane per instrument. Click any bar to choose that instrument's chunk, leave it empty, or create and assign a new chunk immediately.
- **Chunks** are reusable one-bar groups of notes. Selecting one opens its notes; reuse the same chunk in multiple bars without making copies.
- **Note strength** can be Soft, Medium or Firm when placing notes; Shift-click an existing note to cycle its strength. On guitars, this chooses an actual recorded playing style, rather than only changing loudness.
- **Notes** are placed in the piano roll. Drag the visible right-edge handle to lengthen or shorten a note in sixteenth-note steps. Alt+Left/Right on a note also changes its length. The “New note length” control only determines the default for notes you place next.
- **Play** stays active when you edit notes, choose chunks, change instrument settings, or undo/redo. The audio scheduler reads the live score.
- **Live editing is silent:** while the loop plays, clicking to add a note does not audition it separately. When stopped, note placement previews the pitch.
- **Piano-roll playhead:** a thin marker moves across the selected chunk's notes in sync with the audio clock, and appears only when that chunk is actually scheduled on its instrument lane.
- **Undo/redo**, browser autosave, native .premidi import/export, and offline WAV export are included.

## Adaptive sequencer and sound racks

| Current editor | Select a note sound | Select a hit sound |
|---|---|---|
| Piano roll | Replace its sound; keep music | Create a new one-row rack |
| Sound rack | Create a new piano-roll instrument | Append a row to this rack |

**Browse sounds** and the **+ Sound** button beneath the last rack row use
these same rules. **+ Add instrument** always creates a separate instrument.
Recorded and imported audio follow the same routing; imports ask whether the
audio should play as a note or trigger as a hit.

Click a row's name to select its full Sound inspector, with independent level,
pan, synthesis/sampling, movement and reference pitch. A checkmark and border
identify the selected row. Normal step clicks add/remove hits; Shift-click
changes strength. Edit note effects also provides a touch-accessible hit-strength
control and individual bend overrides. Selecting a row keeps the current lane,
chunk and scroll position.

The inspector can rename, reorder, duplicate, or remove sounds; deleting a
sound with hits asks before removing those events from all its chunks.
**Replace this sound** changes only that row's source. **Save rack preset** saves
the complete ordered rack; **Save this sound preset** saves only the selected
row. Both retain companion recordings across reloads. Rack volume controls
all rows; Sound level controls the selected row. Rows share one chunk library
and timeline lane. See the [implementation contract and verification record](docs/adaptive-sequencer-plan.md).

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
notes immediately. Replacing a piano-roll sound also updates its instrument name. Steel Strum uses a
wider chord brush and shorter, brighter articulation; its preview now plays
a real chord, rather than an indistinguishable single pluck.

## Composer-first workspace and optional examples

The **timeline and sequencer are the principal workspace**. On wide screens,
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
existing native v6 music structures.

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
uses the same sound-selection rules as the library: hits join the current rack
or start one, and notes open a piano roll. Add instrument explicitly starts a
separate instrument.

The recording is a **mono 44.1 kHz, 16-bit PCM WAV**. Short capture windows
limit file sizes. Automatic pitch estimation is fallible, especially for
chords, noisy sounds or unusual harmonics.

## Harmonic synthesis and conversion

Choose **Harmonic Keys** or **Harmonic Reed** in the sound library, or change
either oscillator's Wave to **Harmonic**. The oscillator has 32 independent
harmonic-strength dials. Its first eight are immediately available; expand
**Harmonics 9–32** for the rest. Fundamental, All harmonics, and Odd harmonics
give editable starting shapes. Existing filters, envelopes, movement, effects,
note bends and the sound visualizer work with these oscillators.

In **Record sound**, record a note or hit, or choose **Upload WAV**. Uploads
can be up to 20 MB / 30 seconds; select an excerpt up to four seconds long.
Check the detected note, then choose **Convert to synth**. The studio analyzes
the sound and compares candidate patches rendered through its actual native
synth. Listen to the original and converted previews, then choose
**Use synth instrument**. This creates a separate, automatically named piano-roll
instrument or hit rack with its harmonic, envelope, filter, noise and movement
controls populated. The name and every parameter remain editable; saved presets,
undo, autosave, live playback and WAV export use the same patch.

Conversion produces an approximation, with isolated notes and simple tones as
the intended inputs. A short recording cannot uniquely reveal an instrument's
behavior across all pitches and note lengths. Complex acoustic sounds, chords
and speech may differ substantially. The generated patch needs no source WAV;
a composition using only synths exports as a small `.premidi`. **Use this recording**
still retains the actual audio as a separate asset. The [conversion contract](docs/synth-conversion.md)
documents its algorithm, limits and verification.

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

Pre-programmed does not yet implement the new v6 manifest; the bundle is
prepared for its future game-asset importer, not immediate compatibility.
Recordings made here stay raw WAV files. Existing open-source OGG recordings
remain OGG to avoid unnecessary conversion.
## Development approach

Pre-midi is now the primary development surface for the music studio. We are refining its user experience, native synthesizer and composition model **without updating pre-programmed after every studio iteration**. The experimental v6 instrument format **is not yet compatible with pre-programmed's v2 Media importer**. We are intentionally developing the studio first and will synchronize the engine at a planned parity milestone.

The [development direction](docs/development-direction.md) records that boundary, the modular instrument/synthesizer architecture, and how we will bring pre-programmed back into full parity when the studio is mature.

## Instruments, recordings and samples

**Add instrument** opens one combined library. It includes 25 original
procedural synthesizer recipes *and* 16 sampled instrument choices using 122
verified CC0 recordings: piano, several acoustic guitars, recorder, whistle,
kick, snare, clap, closed/open hi-hat and bongo. Preview one, then Add; use
**Browse sounds** for the contextual behavior described below.

For synthesized instruments, the existing sound editor provides two
oscillators, noise, resonant filters, full ADSR, vibrato, stereo pan, distortion
and feedback delay. The *same sound inspector* renders sampled instruments'
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

The experimental **.premidi v6** score separates instrument layout from each
sound's complete source patch. `layout: "pitched"` uses musical notes;
`layout: "rack"` uses events with stable `soundId` references. Audio remains
outside the score in validated relative asset paths. Limits are 1 MB of score
instructions, 1 MB per recording, and 64 MB per portable ZIP. There are at most
12 instruments, 64 sounds per rack, 32 chunks per instrument, and 2,048 rack
events (256 pitched notes) per chunk.

Native v5 files and browser drafts migrate on opening. Pitched music keeps its
notes, expression, chunks, patches and timeline. Safe single-zone hits become
racks; conflicting simultaneous events and multiple recorded pitch zones retain
their original piano roll. Migration preserves the previous sample-release
behavior. New hits play complete recorded tails by default; **Play full
recording** in the sampler controls can change that independently of pitch
following. A safe one-sound instrument can switch between a sound row and the
piano roll through the Sound inspector without clearing music.

**Pre-programmed still understands v2.** Integration remains a separate milestone.
No broad conversion layer for older provisional exported schemas is added.

Still to come: freehand bend-curve drawing, multi-bar held notes, SoundFont/SFZ import, additional acoustic articulations,
deeper modulation/effect routing, automation, FLAC, General MIDI, variable
timeline lengths and advanced mixing. Current timeline limits are 4/4, 16 bars,
12 instruments and up to 32 one-bar chunks per instrument.

### Run locally and verify
Serve the folder via a static web server and open its index page. Node.js 22+ can run `npm run check`, then `node scripts/fetch-samples.mjs` to download and verify recorded library samples for local static hosting. The GitHub Pages workflow does this automatically. No npm dependencies or server backend.

Run `node tests/layout.browser.mjs` with Chrome installed (`CHROME_BIN` may specify its path) for desktop/mobile interaction, microphone capture, live audio and WAV checks.
