# Beat → Song rollout

Status: **Stage 1 in progress**. This is the implementation contract, not a claim that Song mode exists.

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

## Stage log
- Stage 1: glossary, Beat naming across active engine/UI/transport, and vocabulary regression checks implemented; existing Beat file format remains v7.
- Stage 2 underway: `songModel.js` introduces pure Song, Track, and Beat Clip operations and repeat/layered event resolution, with domain tests. Song import/export, UI, and runtime scheduling are not yet wired.
- Remaining: full identifier/API migration, cross-repo vocabulary inventory, compatibility fixture coverage.
