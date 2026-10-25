# Pre-midi Implementation Plan: Adaptive Sequencer and Multi-Sound Racks

**Repository:** https://github.com/natanai/pre-midi  
**Application:** https://natanai.github.io/pre-midi/  
**Status:** Implemented in native v6. See the verification record below.  
**Primary objective:** Make pre-midi automatically present an appropriate sequencer for each sound, while allowing multiple independently editable sounds to coexist within a single instrument.

## 1. Design intent

Pre-midi currently assumes that every instrument should be edited through a piano roll. This creates a misleading interface for unpitched sounds such as drums, claps, and effects, because placing the same sound on different musical notes often makes no meaningful difference.

It also means authors must create multiple separate instruments just to assemble something as ordinary as a drum kit.

We want to remove this unnecessary complexity without reducing the synthesizer, sampler, expressive controls, or modularity of the audio engine.

**The central design principle is that the selected sound should determine the appropriate sequencer layout automatically, while remaining fully editable.**

A pitched sound should open the existing piano roll. An unpitched sound should open a sound rack consisting of named sound rows, initially containing one sound.

A rack should be able to accumulate additional sounds organically, with no dedicated drum-kit creation wizard or separate drum-machine subsystem.

## 2. Required sound-selection behavior

This is the authoritative interaction contract.

| Current editing context | Selected sound | Required action |
|---|---|---|
| Piano roll | Pitched | Replace the current pitched instrument's sound |
| Piano roll | Unpitched | Create a new instrument containing a one-row sound rack |
| Sound rack | Unpitched | Append the sound as a new row in the existing rack |
| Sound rack | Pitched | Create a new instrument with a piano roll |
| Any context, using + Add Instrument | Any | Always create a separate instrument |

These rules must apply consistently to both **Browse sounds** and **+ Sound** within a rack.

### 2.1 Browse sounds

Keep the existing Browse sounds control.

Its behavior becomes context-sensitive according to the table above.

In particular, selecting an unpitched sound while working in a rack must not replace the selected rack sound. It adds a row.

If an author intentionally wants to replace one specific rack sound, that action should remain available explicitly within the individual sound editor.

### 2.2 + Sound

Display a **+ Sound** control immediately beneath the last sound row in every rack.

Requirements:

- Visible whenever a rack is open, including a rack containing only one sound.
- Opens the existing sound library.
- Offers the existing ways to browse, record, and import sounds.
- Uses the same sound-selection rules as Browse sounds.
- Does not create a duplicate sound browser or alternate asset-loading path.
- Remains reachable on mobile, including in long racks.

Selecting an unpitched sound appends another row.

Selecting a pitched sound creates a new pitched instrument, consistent with the governing interaction contract.

### 2.3 + Add Instrument

Preserve the existing + Add Instrument action in the instrument list.

This is the explicit override to automatic grouping.

If the user enters the sound library through + Add Instrument, the chosen sound always creates a new instrument, regardless of the current selection.

A chosen unpitched sound creates a separate one-row rack. A pitched sound creates a separate piano-roll instrument.

Do not ask users to choose between rack and piano roll unnecessarily.

### 2.4 Recording and imported samples

Apply the same routing rules to newly recorded and imported sounds when those workflows are launched from Browse sounds or + Sound.

The existing microphone recorder already distinguishes recording a note from recording a hit.

Use this distinction:

- A note becomes a pitched sound.
- A hit becomes an unpitched sound.

Keep the existing guided recording duration, countdown, playback, retry, and pitch-confirmation functionality.

For imported audio whose intended behavior is unknown, offer a minimal, understandable choice between playing it as a note and triggering it as a hit. Avoid guessing solely from its filename.

Preserve the explicit "replace audio" workflow for an existing sound, which must not unexpectedly add another row.

## 3. Instrument and sound architecture

Implement sound racks as an evolution of the existing instrument model, not as an independent kind of audio engine.

The conceptual hierarchy should be:

Composition → Instruments → Sounds → Sound patches

Instruments continue owning their timeline, reusable chunks, and overall volume.

Sounds own their identities, source patches, and independently adjustable parameters.

### 3.1 Instrument definition

An instrument should support:

- Stable instrument ID
- Name
- Master volume
- Sequencer layout: pitched or rack
- One or more sound definitions
- Existing chunks
- Existing timeline references

A pitched instrument ordinarily contains one pitched sound.

A rack contains one or more sounds that are triggered through named rows.

The schema should support future expansion without unnecessarily exposing that complexity in the current interface.

### 3.2 Sound definition

Each sound should have:

- Stable sound ID
- Editable name
- Complete existing synthesis or sampling patch
- Trigger behavior
- Appropriate fixed/reference pitch where necessary
- Independent gain and other sound controls
- Audio asset references as needed

Reuse the existing native patch definitions and validators as far as possible.

Do not create reduced versions of synth or sampler patches for racks.

A rack sound must be just as editable as that sound would be as a standalone instrument.

### 3.3 Trigger behavior must be separate from pitch processing

This distinction is critical.

The current sampler supports `followPitch`, but disabling pitch-following does not necessarily make musical pitch irrelevant. Multi-zone sampled instruments can still use note pitch to select different recordings.

Therefore, do not classify sounds solely by `followPitch`.

Separate:

1. **Trigger behavior:** Does the sequencer identify a musical pitch or a named sound?
2. **Playback pitch behavior:** How does the sound respond to pitch information, transpose settings, bends, or recorded sample zones?

For a pitched instrument, musical pitch can determine oscillator frequency, sample mapping, and transposition.

For an unpitched rack sound, a row's stable identity determines the sound to trigger. The sound can still have a reference pitch and independently adjustable pitch processing.

Preserve velocity-dependent sample selection and recorded dynamic layers.

A sound whose sample changes depending on which musical note is played should not automatically be treated as unpitched simply because playback-rate transposition is disabled.

Factory sound metadata should explicitly describe the intended trigger behavior, with author-controlled overrides where appropriate.

## 4. Sequencer event model

At present, notes are primarily identified by musical pitch and their timing.

Rack events instead need to reference a specific sound.

### Pitched event

Retain musical pitch, start, duration, velocity, and optional note expression.

### Rack event

Use a stable sound ID, start, velocity, and any timing or expression information necessary for correct playback.

Do not encode a rack row as an arbitrary MIDI pitch merely to reuse the piano-roll implementation.

A named drum row is not a musical note.

Ensure rack events maintain their correct sound identity when rows are renamed, reordered, or additional rows are inserted.

Preserve the existing reusable chunk and timeline architecture. A rack should contain one shared set of chunks, with each chunk representing the events of all its rows.

Do not create a separate timeline instrument or a separate chunk system for every sound.

For one-shot sounds, one sequencer event should ordinarily represent one trigger. Keep sound tails and release behavior controlled by the patch, rather than visually pretending a hit is a sustained pitched note.

Maintain note strength, timing accuracy, and applicable per-event expression controls.

## 5. Sound rack user interface

### 5.1 Layout

Render one named row per sound.

Each row should include:

- Sound name
- Timeline cells corresponding to the current chunk
- Clearly identifiable active steps
- A way to select the row for editing
- An optional compact preview or audition affordance, if consistent with existing controls

The + Sound control sits immediately below the final sound row.

Do not display a piano keyboard or musical pitch labels alongside unpitched rack rows.

Preserve the existing 16-step, one-bar grid until the separate variable-length composition work is undertaken.

### 5.2 Selecting a row

Selecting a sound's name should focus that sound in the existing Sound inspector.

The inspector should display the full controls appropriate to that sound.

This should not change the selected instrument or timeline lane.

The sound selection should be clearly communicated without depending on color alone. Use a visible selected treatment and, where helpful, a checkmark or other structural indicator.

### 5.3 Editing steps

Keep editing consistent with existing pre-midi behavior wherever sensible.

Clicking an empty step adds a trigger.

Clicking an existing trigger removes it.

Preserve the ability to edit event strength, applicable expression, and timing.

The rack should maintain the existing live-editing behavior: editing while the music plays must not introduce unwanted extra audition sounds.

Maintain the playhead, timing grid, and scroll position when selecting or editing a row.

### 5.4 Managing sounds

Authors should be able to:

- Add a sound
- Rename a sound
- Reorder sounds
- Duplicate a sound with its settings
- Remove a sound
- Independently edit a sound
- Explicitly replace one sound's patch or audio

Reordering must not change which sound existing events play.

Removing a sound with sequenced events should give clear confirmation about the effect on those events.

Avoid replacing the entire instrument or clearing its chunks as a side effect of ordinary rack editing.

### 5.5 Rack master controls

Preserve instrument-level volume as the rack's master control.

Every sound should also have an independent, usable level control.

Use the existing patch controls for pan, envelope, transpose, movement, bends, and any applicable processing.

Avoid exposing redundant volume controls with confusing ownership.

### 5.6 Responsive interface

Preserve the existing desktop and mobile Sound inspector architecture:

- Sticky, independently scrollable Sound inspector on desktop
- Compact or expanded Sound sheet on mobile
- Notes and timeline as the main workspace
- No duplicated editor instances

Test long sound racks on narrow mobile screens. Make sure + Sound, row names, and individual editing controls remain visible and reachable without clipped content or unusable horizontal scrolling.

Use accessible labels and keyboard-operable controls.

## 6. Sound library and saved presets

Centralize the sound-selection routing in one function or module. Do not implement separate, slightly different behavior for each button.

The selection resolver should receive the current editing context, the selected sound's trigger behavior, and whether the action was explicitly initiated through Add Instrument.

It should return one unambiguous operation:

- Replace pitched sound
- Append rack sound
- Create pitched instrument
- Create rack instrument

The actual mutation should then occur through pre-midi's existing validated edit/undo infrastructure.

### Preset behavior

A rack should be reusable as a complete custom instrument.

Support saving and reopening the entire rack, including its row definitions, ordering, full sound patches, and audio references.

Preserve individual sound preset reuse.

When Save preset is used on a rack, make it clear whether the action saves the complete rack or an individual selected sound.

Do not silently save only the first sound.

Saved presets that reference authored recordings must remain usable after reload, with their companion asset bytes available through the appropriate local persistence path.

## 7. Playback and audio implementation

All audio must continue to use the canonical pre-midi engine.

Update event resolution so the scheduler determines the correct sound definition for every event.

A sound rack must work consistently with:

- Live playback
- Looping
- Preview/audition
- Playback while editing
- Offline WAV rendering
- Recorded samples
- Factory samples
- Native synthesizer sounds
- Individual movement and expressive controls

There must not be one playback implementation for racks and a different interpretation for exported audio.

For a rack containing several sounds, simultaneously triggered rows should play simultaneously.

Preserve independent settings for each sound and apply the rack's master volume coherently.

Update sample discovery and decoding logic to traverse every applicable sound patch in a rack.

The existing sample-selection code may need to resolve an unpitched sound's reference pitch and velocity layers without using the sequencer row as a fake musical note.

Avoid redundant audio decoding or unnecessary DSP allocations.

## 8. Native format, portability, and compatibility

The current score format is pre-midi v5.

Review whether a clean version increment is needed to represent the new instrument structure. A versioned schema evolution is preferable to silently introducing incompatible structural changes into v5.

### Preserve current work

Existing browser drafts and recent exported compositions must not be silently discarded.

Implement the smallest reliable migration necessary from the immediately preceding native format.

For existing pitched instruments, preserve their musical notes, chunks, sound patches, and timelines.

For existing one-shot sample instruments, migrate into the new rack representation when this can be done without changing playback or losing sequenced events.

In cases involving multiple recorded pitch zones or conflicting same-step notes, avoid lossy automatic conversion. Preserve the original musical behavior and supply an explicit conversion path if necessary.

Do not add broad compatibility systems for unused historical provisional formats.

### Asset architecture

Maintain the established separation between music instructions and audio bytes.

- `.premidi` stores the compact composition and sound definitions.
- WAV, OGG, and MP3 assets remain separate.
- Sample references use validated relative paths.
- Sampled composition export remains a portable ZIP containing the score and required assets.
- Synth-only compositions can continue exporting a standalone `.premidi`.

Multiple sounds within one rack should not cause duplicate audio files to be packaged unnecessarily.

Update asset reference collection, export validation, import validation, and orphan cleanup to account for multiple sounds per instrument.

Keep the format deterministic and compact.

Review existing capacity limits: the current 12-instrument limit should not become a 12-sound limit for racks. Establish sensible, tested bounds for rack rows and event counts without arbitrarily restricting ordinary drum kits.

## 9. Implementation sequence

Work through the following phases in order, preserving a working application and adding regression coverage along the way.

### Phase A — Establish the canonical model

1. Inspect the existing schema, sample definitions, sound editor, and scheduler.
2. Define the unified instrument/sound structure.
3. Define explicit pitched and hit trigger metadata.
4. Implement rack event references.
5. Update schema validation, factories, and any required migration.
6. Add deterministic tests for the resulting structure.

Do not begin by hardcoding a drum-grid presentation that the rest of the engine does not understand.

### Phase B — Update audio resolution

1. Resolve events to their correct sound patches.
2. Support pitched and rack event interpretation.
3. Preserve all existing sample-zone and velocity logic.
4. Update live and offline rendering consistently.
5. Update sample discovery and asset resolution.
6. Verify polyphony and simultaneous multi-row playback.

### Phase C — Implement sequencer layouts

1. Refactor the current piano-roll rendering so the instrument's sequencer layout determines the visible rows.
2. Preserve the full piano roll for pitched instruments.
3. Build named sound rows for racks.
4. Place + Sound beneath the bottom row.
5. Add row selection, reordering, duplication, and deletion.
6. Preserve note entry, undo/redo, chunk selection, and playback editing behavior.

### Phase D — Integrate the existing Sound inspector

1. Make the inspector resolve the selected sound within the selected instrument.
2. Reuse the existing synthesizer and sampler controls.
3. Preserve visualizers and live parameter preview.
4. Add rack master control presentation.
5. Support independent editing of every rack row.
6. Ensure responsive behavior remains consistent with the current studio.

### Phase E — Implement automatic library routing

1. Centralize the contextual selection rules.
2. Connect Browse sounds to the resolver.
3. Connect + Sound to that same resolver.
4. Preserve the separate Add Instrument override.
5. Apply compatible behavior to recording and sample imports.
6. Keep explicit replacement distinct from adding a new row.
7. Make every resulting edit undoable.

### Phase F — Persistence, presets, and documentation

1. Update saved sound and whole-rack presets.
2. Update native import/export.
3. Preserve external audio assets.
4. Add required schema migration.
5. Update application documentation and development-direction documentation.
6. Document the new automatic routing behavior concisely.

### Phase G — Verification

Run the full repository check suite and actual browser interaction tests.

Do not treat passing unit tests alone as proof that the interaction design works.

## 10. Required acceptance tests

### Sound browser routing

| Test | Expected result |
|---|---|
| Start on piano, Browse → piano | Current pitched instrument's patch changes; notes and timeline remain |
| Start on piano, Browse → kick | New one-row rack instrument is created |
| Start on rack, Browse → snare | Snare is appended to the current rack |
| Start on rack, Browse → piano | New pitched instrument is created |
| Rack + Sound → clap | Clap appears as a new rack row |
| Rack + Sound → guitar | New pitched instrument is created |
| + Add Instrument → kick, while on rack | Separate one-row rack is created |
| + Add Instrument → piano, while on piano | Separate piano-roll instrument is created |

### Editing and audio integrity

- Editing one rack sound's attack must not change another sound's attack.
- Independent pan, level, movement, transpose, and applicable sound controls must work.
- Selecting a rack sound must not change the active instrument timeline lane.
- Renaming or reordering a sound must not redirect its existing events.
- Different rack sounds must play simultaneously without one replacing another.
- Rack master volume must affect the entire rack.
- Existing piano-roll note editing, velocity, duration, and expression must remain intact.
- Switching between pitched instruments and racks must not reset the current composition.
- Undo/redo must correctly reverse sound additions, removals, patch changes, and automatic instrument creation.
- Recording a hit from an existing rack should append a new row.
- Recording a note from an existing rack should create a pitched instrument.
- Exported WAV output must match the intended live composition.
- Reloading a saved rack preset must restore every sound and all its settings.
- Exporting, reimporting, and playing a sampled rack must preserve all audio references and sound mappings.
- A pre-change project must remain recoverable without silent loss of notes or samples.

### Browser and layout verification

Check desktop and mobile viewports.

Test a one-row rack, a typical four-to-eight-sound drum kit, and a much longer rack.

Confirm that the + Sound affordance remains discoverable, that selection is visually clear across styling variations, and that inspector controls are not clipped.

Verify with actual audio where possible rather than relying only on DOM assertions.

## 11. Relevant existing files

The current repository includes these important implementation surfaces:

| File | Responsibility |
|---|---|
| `schema.js` | Composition, instrument, chunk, and note definitions |
| `studio.js` | UI state, instrument selection, library behavior, and sequencer rendering |
| `audio.js` | Live scheduling, audition, and WAV rendering |
| `sampler.js` | Sample selection, validation, decoding, and playback |
| `samples.js` | Factory recordings and sample presets |
| `synth.js` | Synth patches and validation |
| `samplerUI.js` | Existing sampler editor |
| `instrumentUI.js` | Existing synthesizer editor |
| `microphoneUI.js` | Guided recording interface |
| `packageIO.js` | Native project export and import |
| `storage.js` | Browser-local persistence |
| `style.css` | Sequencer and responsive UI presentation |
| `tests/` | Existing automated regression and browser checks |

Read the latest repository state before modifying these files; this is a task map, not an assumption that their implementations are frozen.

## 12. Architectural boundaries

Do not:

- Introduce a separate drum-machine audio engine.
- Require users to manually create a drum kit before adding percussion.
- Treat arbitrary MIDI pitches as permanent rack sound identifiers.
- Remove the complete synthesizer or sampler editor from rack sounds.
- Duplicate audio sources every time a sound is reused.
- Create separate composition tracks for individual rack rows.
- Break the current chunk/timeline system.
- Make a sound's library category the sole determinant of whether pitch matters.
- Automatically discard authored music when converting layouts.
- Add an unnecessary setup wizard or extra decisions to ordinary sound selection.
- Modify the pre-programmed game-engine repository as part of this feature.

Pre-midi remains the development source of truth. The existing plan to synchronize its stable music model with pre-programmed at a later parity milestone remains unchanged.

## 13. Completion criteria and delivery

This feature is complete when authors can naturally build a drum kit from one sound at a time, retain full independent control of every sound, and interact with pitched instruments exactly as before.

The expected experience is:

1. Choose a kick.
2. A one-row rack appears.
3. Compose a beat.
4. Click + Sound or Browse sounds.
5. Choose a snare.
6. The snare appears underneath the kick.
7. Edit each sound independently.
8. Choose a piano.
9. A new pitched instrument appears automatically.
10. Continue composing without restructuring the song manually.

Preserve the existing minimal visual language and avoid adding UI elements that don't serve this workflow.

Implement on an appropriate development branch, run the complete test suite, verify the behavior in real desktop and mobile browser sessions, and prepare the changes for review and deployment according to the repository's established workflow.

Report the resulting commit or PR, tests performed, any remaining limitations, and the exact steps for testing the feature on the live site once deployed.

**Success is not merely that a drum grid exists. Success is that instruments become more flexible while pre-midi becomes simpler to use.**
## Implementation verification record

- Canonical v6 instruments own `layout`, `sounds`, shared chunks, timeline, and master volume.
- Rack events address sound IDs, never row numbers or MIDI keys. Maximum: 64 rows, 2,048 events per rack chunk.
- `soundModel.js` owns contextual routing, reference resolution, and safe conversion checks.
- Explicit metadata classifies every factory sound; note pitch and sample pitch-following remain separate.
- Only v5 is migrated. Single-zone non-transposing sampled hits convert when same-step conflicts are absent. Other existing music retains a piano roll. Original timing, expression, and gated sample tails are preserved.
- Full sampler/synth editors, per-sound levels, reference notes, row management, complete rack presets, and individual sound presets are available.
- Preset audio persists independently of the source draft; rapid edits coalesce saves and do not rewrite immutable recordings.
- WAV rendering uses the same sound resolver as live playback and extends for complete one-shot tails.
- `npm run check`: canonical regression tests, migration and ZIP roundtrips.
- `tests/rack-check.html`: full routing table, real edits, undo/redo, source replacement, imports, 26-row racks, desktop/mobile bounds, and preset reload with authored WAV bytes.
- `tests/rack-audio-check.html`: simultaneous mixing, independent pan, master gain/mute, stable output after row reorder, one-shot tails, and the actual live audio graph.
- `tests/recording.browser.html`: real guided MediaRecorder capture, hit append, pitched-instrument creation, raw WAV export/import.
- `tests/layout.browser.mjs` runs the browser checks in Chrome, including existing piano-roll and sound-editor coverage.

No pre-programmed engine files are modified. Game-engine parity remains a separate milestone.
