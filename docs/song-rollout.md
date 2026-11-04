# Beat → Song rollout

Status: **Stage 5 (vocal recording) implemented, reliability work ongoing**. Stage 6 (pre-programmed native parity) has not shipped.

This is the Song-specific historical rollout and integration plan; the active synthesis and native-host task register is [docs/synthesis-roadmap.json](synthesis-roadmap.json). [Terminology](terminology.json) is authoritative for data, UI and code; [pre-programmed issue #235](https://github.com/natanai/pre-programmed/issues/235) tracks the game-side migration.

## Approved attached freeform architecture (2026-11-04)

**Approved design, staged implementation.** Only the 64-bar Beat foundation is in the initial code phase; freeform editing is not yet shipped.

- Each Beat Track owns an attached child freeform lane, collapsed when empty. It is not an independently reorderable Song Track; its parent moves and reorders with it.
- A freeform lane can begin empty and contains multiple Instruments with ordinary Sound, Rack, note-expression and sample capabilities. It supports Song-position independent notes together with reusable Chunk placements.
- Move and unpack a Beat Clip into its attached lane by drag or an accessible action. Resolve source phase, repetitions, offsets, notes, instruments, expression, automation and external Assets. The original Beat remains reusable elsewhere, while the unpacked music becomes fully independent. No duplicate audio.
- Partial conversion splits a Beat Clip, preserving original source phase at the two unaffected sides. Notes crossing boundaries cannot be silently chopped. Convert to independent instructions, never a WAV bounce.
- Freeform passages can move horizontally with their contained events while remaining attached to their parent Track. Passage edges are organizing aids, not limits on where notes may be authored.
- A selected freeform range can create a new independent Beat; leave the freeform notes intact. Beat selections over 64 bars require explicit splitting.
- A single Song clock drives Song and freeform piano-roll views. Zoom and scroll are independent. Optional playback-follow yields to manual navigation. Pitched keys can illuminate when sounding.
- Editing the source Beat updates only linked Beat Clips, not already unpacked material. Every transform is undoable and round-trips through a versioned .premidi schema.

### Staged delivery gates

1. **Beat length:** accept every integer from 1 through 64, protect against destructive shortening, and version extended Beats as v17 and containing Songs as v18.
2. **Song time:** canonical musical position, clip source-phase offsets and correct split/repeat/seek/export semantics.
3. **Model:** define freeform child ownership, Instruments, notes, Chunks, passages, asset references, validation and undo/redo in the existing Song schema.
4. **Commands:** empty editing, full/partial unpack, horizontal movement, collisions, linked Chunks and create Beat from selection.
5. **Desktop UI:** linked row treatment, accessible drag/action conversion, single Song-position piano roll, multiple Instrument sublanes and piano-key playback feedback.
6. **Qualification:** native/browser event and audio equivalence, bounded long-Song scheduling, iPhone touch equivalents and pre-programmed migration.

Do not simply raise native player limits to claim complete freeform support: sessions currently have bounded event counts and duration. Retain the canonical phone requirements in docs/phone-studio.md.

## Implemented

1. **Beat-first architecture:** 1–64-bar Beat editor with Sound, Rack, Instrument and reusable one-bar Chunk definitions. Canonical Beat naming in active code. Legacy Beat schema v7 and supported older migrations; newer v9 modulation and v11 automation Beats are versioned separately.
2. **Native Song model:** legacy schema v8 (newer v10 modulation and v12 automation Songs are versioned separately) with referenced Beats, Song Tracks, Beat Clips and Recordings. Beat Clips repeat, crop and overlap without flattening Sounds or Chunks. Song and Beat BPM are separate editing contexts.
3. **Song interface:** subtle ↑ Song affordance; multiple Beat Tracks; add/import Beats; drag, resize, reorder and select Clips; vocal lanes always precede Beat lanes, with the Beat editor beneath.
4. **Transport and export:** expanded view plays Song; collapsed view plays selected Beat. Song playhead can seek from a selected bar. Export Beat or Song as native `.premidi` or WAV. Audio assets travel beside native JSON in portable ZIPs, not inside it.
5. **Voice foundation:** ● voice dialog, explicit play + record, start bar, optional count-in, visible statuses and recording permission handling. External MediaRecorder assets, waveform, basic level/delete, multiple vocal takes and local draft persistence. Web limits remain 5 minutes / 48 MB per take / 64 MB per ZIP.

### Shared recording editing (Song v16)

Vocal Clips may share a voice Track, move between voice Tracks, duplicate by reference, and trim their recorded lead-in without rewriting audio. Clicking a Song vocal Clip opens the existing lower editing workspace with sampler-style gain, pan, filter, distortion, pitch, vibrato, tremolo and envelopes, plus the shared synth delay bus. The original bytes remain in external assets; Clip-specific effects and trim metadata live in the `.premidi` Song instructions. Legacy Songs continue to load unmodified. The existing native sampler executes the same processing with a versioned sample packet for delay. Short trimmed vocal phrases (up to four seconds) can become a Beat rack instrument via explicit conversion to a separate WAV sample asset, subject to the Beat sample size limit. This is distinct from live Song vocals; the Beat sampler does not yet support delay. The manual trim offset is millisecond precision, with optional approximate sound-onset detection. Timing can be set by bar and sixteenth-note step. Later advances such as formant-preserving pitch, time stretching and automation remain separate work.

## Immediate acceptance work: Stage 5 reliability

- Verify real microphones on iOS, Android and desktop; measure and compensate capture/playback latency at selected Song positions.
- Prove repeated takes, permission denial, count-in cancellation, app/background interruptions and crash-safe recording persistence.
- Verify ZIP export/reimport, playable vocal audio after browser reload, and WAV playback parity, including mixed Beat and vocal assets.
- Add focused timing fixtures for seeking into an existing vocal recording and replay after export.
- Keep recorded bytes external and preserve old v8 Songs that omit `recordings`.

**Gate:** a multi-take Song reliably reloads and exports with the same audible timing.

## Stage 6: Native pre-programmed parity

- Inventory the existing pre-programmed **v2** reader, Media storage and legacy project imports. Never silently reinterpret older data.
- Share or parity-test the versioned legacy v7 Beat/v8 Song and newer v9/v11 Beat/v10/v12 Song validation, synthesis, sampling, note expression, offsets/repetitions and asset path semantics.
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

Native Windows capture now writes external WAV Recordings through explicit Song v14. Legacy v8/v10/v12 Songs retain their formats. Native callback count-in, calibrated capture offset, raw previews and portable ZIP/seek/WAV checks accompany this path; physical Windows microphone/latency qualification remains pending.
