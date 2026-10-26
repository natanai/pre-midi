# Beat → Song rollout

Status: **Stage 5 initial vocal recording in progress**. Song arranging and Beat-only playback remain available.

## North star

The current 1–16-bar editor is the **Beat maker**. Its reusable one-bar patterns are **Chunks**, belonging to **Instruments**. A subtle upward `Song` control will reveal a higher-level arrangement without replacing or resetting the editor. Vocal Tracks always render above Beat Tracks; the selected Beat's editor remains below the Song timeline.

`docs/terminology.json` is the machine-readable domain glossary. The definitions apply to UI copy, variable names, APIs, file format, and game-engine integration. Historical names must be confined to explicit migrations and tests; do not introduce new `score` or `composition` aliases for Beat objects.

## Rollout stages and gates

### 1. Terminology / compatibility foundation
- Inventory all uses of `composition`, `score`, `song`, `track`, `phrase`, `chunk`, and `beat` in both repositories.
- Replace Beat-object names in live source and UI; preserve musical timing names such as `beatsPerBar`.
- Enforce the glossary with automated source/UI checks. Track legacy usages until zero in active code, and keep compatibility migrations separately.
- Golden-file tests for v5, v6, v7 imports and unchanged export semantics.
- **Gate:** existing Beat editor and imports/exports remain functional; terminology drift fails CI.

### 2. Native Song model (no new UI required)
- Define `kind: "beat"|"song"` through an explicit new-format version, retaining old-reader rejection instead of silent misinterpretation.
- A Song owns a Beat library and ordered Song Tracks; Beat Clips reference Beats by ID. Vocal Clips reference external audio Assets.
- Beat Clip `startStep` and `lengthSteps` use the Song's shared grid. Extending repeats the underlying Beat; shortening crops its playback, never modifies its notes or time-stretches it.
- Independent Beat copies get new identities; editing one linked Beat updates its Clips.
- Define Song tempo policy (initial version: Song tempo drives every embedded Beat; retain original Beat BPM metadata on import).
- **Gate:** deterministic schema/validation, no dangling references, malformed projects rejected, structured round trips and legacy migration tested.

### 3. Song arranging and Beat editor
- Small upward `Song` affordance expands a timeline *above* the existing editor; no modal conversion or flattening.
- Multiple Beat Tracks; drag to move Clips, resize right edge to repeat/crop, and click to select/edit the referenced Beat below.
- New Beat and `Open .premidi` add editable Beats; a Beat editor can be collapsed back to Beat-first view.
- Keyboard and touch operation required for moving/resizing Clips; pointer gestures need an accessible alternative.
- **Gate:** save, reload and edit multiple layered Beats, including offsets and repeated instances, on desktop and mobile.

### 4. Single transport / persistence / WAV
- One clock schedules all active Beat Clip instructions from the Song timeline; synth values are resolved natively, not through bounced Beat audio.
- Playback, seeking, resumption, stop, loop, and offline WAV export have the same schedule and respect existing tails.
- Browser autosave and external portable ZIP contain the exact same Song, Beat library and referenced assets.
- **Gate:** deterministic rendered-vs-played event tests, no clip drift or missing assets, resilient save/reopen behavior.

### 5. Minimal microphone recording
- One Record button captures the microphone while the Song transport plays; stopped takes are aligned to the Song timeline.
- Takes render as waveform Vocal Clips in Vocal Tracks **above every Beat Track**. Initially support listen, delete, record again, and basic level only.
- Add long-form asset handling without inheriting the short-sample 1 MB / four-second constraints. Never embed audio bytes inside `.premidi`; export assets with stable relative paths.
- Headphones and microphone/device permissions must fail safely; do not silently lose an unsaved take.
- **Gate:** multiple takes survive reopening and exported ZIP reimport, synchronized with Beat playback.

### 6. pre-programmed runtime and multi-platform
- Document exact format version and runtime contract with `natanai/pre-programmed`; add parity fixtures and native scheduling tests.
- Expose programmatic Beat/Track control and eventually parameter automation to the game engine.
- Keep storage, microphone, platform file pickers and large-file streaming behind environment-specific adapters; engine/domain logic remains portable.
- **Gate:** identical musical instructions interpreted across web, standalone, and game-host playback (test each supported host).

## Deferred deliberately
Vocal synth effects, pitch/formant editing, live dial/keyframe automation, advanced mixer buses, multi-tempo arrangements, and a redesigned Beat editor are outside the first Song release.

## Safety rules for agents
Do not rename serialized v7 fields without an explicit versioned migration and fixture tests. Do not blend Song Clips into Beat Chunks, introduce a second playback definition, place Vocal Tracks below or between Beat Tracks, or put WAV/OGG bytes into the native JSON. Do not add flavor text or unnecessary explanatory UI labels.

Game-engine parity tracking: [pre-programmed #235](https://github.com/natanai/pre-programmed/issues/235). Its current vendor reader is v2; do not claim native v7/v8 playback parity until tested.

## Stage log
- Stage 1: glossary, Beat naming across active engine/UI/transport, and vocabulary regression checks implemented; existing Beat file format remains v7.
- Stage 2 underway: `songModel.js` introduces pure Song, Track, and Beat Clip operations and repeat/layered event resolution, with domain tests. Independent Song import/export helpers now round-trip instruction-only .premidi and ZIPs containing shared audio Assets. The existing Beat UI has **not** yet been switched to Song-aware loading, and Song playback/recording UI is still pending.
- Stage 3 first usable arranger: compact upward Song affordance, editable Song timeline, repeated/resizable/positionable Beat Clips, multiple Beat Tracks, adding/importing Beats, selecting a Beat for editing underneath, and keyboard/touch clip interactions.
- Song playback uses the native event scheduler; WAV rendering and export use the existing native sound engine without flattening Beat instructions.
- Autosave and native Song ZIP/.premidi export are wired through the same browser draft path. Reopening a Song selects its first Beat.
- Pending: real-browser manual gesture tests, detailed input/undo smoke passes, vocal recording, and verified pre-programmed parity.
- Remaining: full identifier/API migration, cross-repo vocabulary inventory, compatibility fixture coverage.

## Song UI refinements (October 25, 2026)
- The Song ruler and Track lanes span the full viewport, share the same bar divisions, and extend automatically when the user scrolls near the visible end. Empty Song space is not a fixed length.
- The `+ Beat` control sits below Song Tracks at the left; its two explicit options are `New Beat` and `Add .premidi`. The global `Open .premidi` always replaces the current project, rather than behaving differently inside Song mode.
- Single-Beat Track labels display the Beat's authored name and open the underlying Beat editor when clicked. Multi-Beat Tracks retain their generic Track label.
- Browser smoke checks cover timeline width, Beat creation choices, selecting Beat by name, and the existing playback/save/reload path.

## Song navigation / export refinements
- The `+ Beat` row is inside the horizontally scrollable Song timeline and above its scrollbar. A compact visible-bar readout and earlier/later navigation controls explain the scroll direction; all Song lanes remain part of one timeline grid.
- The main toolbar uses a single **Export** dialog: select Beat or Song (Song available if created), then `.premidi` (default) or WAV. Beat export always uses the currently selected Beat, Song export uses the complete Song; companion audio Assets remain separately packaged as needed.
- Playback follows visibility: expanded Song runs the Song transport; collapsed Song runs the selected Beat. Expanding/collapsing stops the previous scope cleanly; Beat BPM and Song BPM controls follow the same distinction.

## Vocal milestone — first recording pass

- Song `● Record` records through the microphone while the native Song clock plays from the beginning; pressing Stop saves the take. The existing Sound-level recorder remains unchanged.
- Every take gets its own Vocal Track before all Beat Tracks. Its waveform is optional derived metadata; compressed audio stays a separate Asset referenced by the Song's `recordings` array and Vocal Clip.
- V8 Song metadata uses `recordings: [{id,name,mime,path,durationSeconds,trimSeconds,waveform?}]` and Vocal Clips `{id,recordingId,startStep,lengthSteps,gain}`. Existing v8 Songs without a `recordings` array remain readable.
- MediaRecorder captures WebM/Opus, MP4/AAC or OGG/Opus when the browser supports it. This pass limits a take to five minutes and 48 MB compressed audio because the browser ZIP exporter still has a 64 MB package cap; later native apps can use streaming and higher limits. Microphone permissions are requested only after Record.
- Recorded audio is decoded for playback and Song WAV export, with no flattening in the native .premidi file. Playback scheduling uses the Song timeline's shared audio context.
- During recording, Stop or collapsing Song finishes the take; destructive project replacement is blocked until recording finishes.
- Pending improvements: device-dependent latency calibration, streaming long recordings without decoding the entire asset into memory, and native pre-programmed compatibility. Vocal synth effects and automation remain deferred.

## Voice capture UX — October 26, 2026
- Red `● voice` control in Song mode opens a dedicated dialog rather than immediately requesting microphone access. Its primary action explicitly says `▶ ● play + record` and becomes `■ stop + save` while recording.
- Song ruler now accepts clicks and keyboard arrows to set the bar where Song playback and recording begin. The recording dialog shows an editable start bar, constrained to the existing arrangement.
- Optional none, one-bar or two-bar count-in produces light metronome clicks and a visible beat countdown before transport and microphone capture begin. Cancellation and microphone errors are reported inside the dialog.
- The native scheduler accepts `startStep`; recordings are placed at that step. Vocal playback started mid-clip resumes using the correct offset. Beat-only playback remains unchanged when Song mode is closed.
