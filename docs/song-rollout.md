# Beat → Song rollout

Status: **Stage 5 (vocal recording) implemented, reliability work ongoing**. Stage 6 (pre-programmed native parity) has not shipped.

This is the canonical technical roadmap. [Terminology](terminology.json) is authoritative for data, UI and code; [pre-programmed issue #235](https://github.com/natanai/pre-programmed/issues/235) tracks the game-side migration.

## Implemented

1. **Beat-first architecture:** 1–16-bar Beat editor with Sound, Rack, Instrument and reusable one-bar Chunk definitions. Canonical Beat naming in active code. Native Beat schema v7 and supported older migrations.
2. **Native Song model:** schema v8 with referenced Beats, Song Tracks, Beat Clips and Recordings. Beat Clips repeat, crop and overlap without flattening Sounds or Chunks. Song and Beat BPM are separate editing contexts.
3. **Song interface:** subtle ↑ Song affordance; multiple Beat Tracks; add/import Beats; drag, resize, reorder and select Clips; vocal lanes always precede Beat lanes, with the Beat editor beneath.
4. **Transport and export:** expanded view plays Song; collapsed view plays selected Beat. Song playhead can seek from a selected bar. Export Beat or Song as native `.premidi` or WAV. Audio assets travel beside native JSON in portable ZIPs, not inside it.
5. **Voice foundation:** ● voice dialog, explicit play + record, start bar, optional count-in, visible statuses and recording permission handling. External MediaRecorder assets, waveform, basic level/delete, multiple vocal takes and local draft persistence. Web limits remain 5 minutes / 48 MB per take / 64 MB per ZIP.

## Immediate acceptance work: Stage 5 reliability

- Verify real microphones on iOS, Android and desktop; measure and compensate capture/playback latency at selected Song positions.
- Prove repeated takes, permission denial, count-in cancellation, app/background interruptions and crash-safe recording persistence.
- Verify ZIP export/reimport, playable vocal audio after browser reload, and WAV playback parity, including mixed Beat and vocal assets.
- Add focused timing fixtures for seeking into an existing vocal recording and replay after export.
- Keep recorded bytes external and preserve old v8 Songs that omit `recordings`.

**Gate:** a multi-take Song reliably reloads and exports with the same audible timing.

## Stage 6: Native pre-programmed parity

- Inventory the existing pre-programmed **v2** reader, Media storage and legacy project imports. Never silently reinterpret older data.
- Share or parity-test the versioned v7 Beat and v8 Song validation, synthesis, sampling, note expression, offsets/repetitions and asset path semantics.
- Integrate its game asset storage with the `.premidi` manifest and separately managed audio bytes.
- Add runtime control identities for Songs, Tracks, Clips, Beats and Sound parameters. Gameplay uses pre-programmed's own conditions/effects, **not** a parallel script language in `.premidi`.
- Add cross-repo reference fixtures and live/rendered-event comparisons to stop parity drift.

**Gate:** pre-programmed can natively play a studio-authored Song and game logic can affect its layers without a bounced WAV.

## Stage 7: Portable application hosts

- Share platform-independent project/schema/scheduler/audio logic; isolate permissions, recording, file pickers and asset storage in host adapters.
- Desktop and mobile builds work offline, use proper local files, support large streamed audio and can exchange the same project bundle with the web edition.
- Never compromise the browser edition or require an account/backend.

**Gate:** native project playback and round-trip work on web and each supported standalone host.

## Stage 8: Non-destructive automation and vocal shaping

- Capture dial movements as time-stamped parameter automation, interpolate on active voices and replay deterministically.
- Distinguish Beat definitions from Song Clip-specific overrides; provide editable curves and reversible overdubs.
- Reuse meaningful audio processors for voice without implying oscillator controls modify raw recordings; consider pitch/time/formant work as a later advanced stage.
- Expose the same automation semantics to pre-programmed.

**Gate:** authored and game-driven music parameter changes use one native interpretation.

## Non-negotiable constraints

- The Beat maker stays the primary interface. The Song view expands above it and may be hidden at any time.
- Vocabulary follows `terminology.json`; a Track exists within a Song, an Instrument lane exists within a Beat, a Chunk is not a Clip.
- Vocal Tracks render **above** Beat Tracks, with the selected Beat editor **below** them.
- Projects preserve editable synthesis and linked Beat identities; never flatten them simply to arrange or export.
- Audio is referenced via external Assets; binary recording bytes never enter `.premidi` JSON.
- Keep versioned import compatibility and automated tests as first-class engineering requirements.
- Preserve the minimalist UI, accessibility and cross-device interaction requirements in `AGENTS.md`.
