# Beat → Song rollout

Status: **Stage 5 (vocal recording) implemented, reliability work ongoing**. Stage 6 (pre-programmed native parity) has not shipped.

This is the Song-specific historical rollout and integration plan; the active synthesis and native-host task register is [docs/synthesis-roadmap.json](synthesis-roadmap.json). [Terminology](terminology.json) is authoritative for data, UI and code; [pre-programmed issue #235](https://github.com/natanai/pre-programmed/issues/235) tracks the game-side migration.

## Approved attached freeform architecture (2026-11-04)

**Desktop and Windows native first (2026-11-04):** The user deferred phone parity to a later phase. Do not gate the desktop/native freeform milestones on an iPhone implementation or add phone-specific UI patches during these phases.

**Approved design, staged implementation.** The initial freeform slice in PR #120 includes Song v22 note/Instrument data, whole/partial unpack commands, transport/export, a parent-attached desktop lane and direct Song-time note editing. Per-note cutoff automation conversion is implemented in desktop/native PR #129, preserving source Beat phase after unpacking; direct authoring of new freeform automation and advanced automation editing remain open. Reusable Beat extraction of captured cutoff movement is implemented in a dependent v27 Beat/v28 Song proposal; native/browser qualification is still required. Long-Song performance and phone parity remain separate. Freeform → reusable Beat from a selected 1–64-bar range is implemented in PR #124; it leaves source notes intact and does not automatically place the new Beat in the Song.

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
3. **Model:** freeform child ownership, multiple Instruments, direct notes, reusable Chunks, passages and external sample references implemented in Song v22; regression and undo/redo checks remain required for each new operation.
4. **Commands:** empty freeform editing, whole/partial unpack, horizontal passage movement, and Create Beat from selection are implemented. Beat creation preserves Sounds, Rack mapping, Chunks, expression and referenced Assets, and refuses note tails crossing the selection boundaries, more than 12 contributing Instruments, more than 32 unique one-bar Chunks per Instrument, or over 64 bars. Desktop layering preview in PR #138 identifies same-Instrument pitch/Sound overlaps and linked Beat Clip ranges while preserving deliberate overlapping notes; drag and keyboard passage moves remain non-destructive. Multi-bar note conversion shipped in PR #140 (Beat v25 / Song v26), retaining one note-on and the original duration instead of splitting into repeated fragments. CI verified the shared browser/native event model; physical Windows audio and portable release observation remain separate qualification gates. Richer same-row collision editing is implemented in the desktop overlap-editor proposal: stack concurrent notes, select each voice, duplicate a note deliberately, and preserve underlying event data. Full CI and native/browser qualification are required before it is marked shipped.
5. **Desktop UI:** attached lane, drag/context unpack, Song-position piano roll, multi-Instrument access, Chunk placement and explicit freeform range → reusable Beat controls are implemented. A passage sets the range automatically; start bar/step and length can be adjusted. The created Beat is saved in Song's Beat collection but not placed automatically, avoiding doubled playback. The freeform desktop Sound editor now reuses canonical synth and sampler controls, Sound-level dials, a measured scope and native-aware preview in PR #127. Shared factory/personal Sound browsing, presets, rack selection and saving directly from freeform are implemented in PR #137. Additional full Instrument workflows and freeform cutoff movement authoring still need follow-up verification; source-phase captured cutoff curves can now be retained as v27 reusable Chunk notes in the dependent implementation. Beat-Clip cutoff automation is now captured per sounding freeform note in Song v23, to avoid altering repeated or overlapping occurrences. Pitched key illumination for sustained direct notes and repeating Chunk notes, together with opt-in Song playback-follow that yields to manual bar navigation, is implemented in PR #126.
6. **Qualification:** native/browser event and audio equivalence, bounded long-Song scheduling and Windows portable qualification. iPhone touch parity is explicitly deferred; pre-programmed migration remains a separate integration gate.

Do not simply raise native player limits to claim complete freeform support: sessions currently have bounded event counts and duration. Retain the canonical phone requirements in docs/phone-studio.md.

## Implemented

1. **Beat-first architecture:** 1–64-bar Beat editor with Sound, Rack, Instrument and reusable one-bar Chunk definitions. Canonical Beat naming in active code. Legacy Beat schema v7 and supported older migrations; newer v9 modulation and v11 automation Beats are versioned separately.
2. **Native Song model:** legacy schema v8 (newer v10 modulation and v12 automation Songs are versioned separately) with referenced Beats, Song Tracks, Beat Clips and Recordings. Beat Clips repeat, crop and overlap without flattening Sounds or Chunks. Song and Beat BPM are separate editing contexts.
3. **Song interface:** subtle ↑ Song affordance; multiple Beat Tracks; add/import Beats; drag, resize, reorder and select Clips; vocal lanes always precede Beat lanes, with the Beat editor beneath.
4. **Transport and export:** expanded view plays Song; collapsed view plays selected Beat. Song playhead can seek from a selected bar. Export Beat or Song as native `.premidi` or WAV. Audio assets travel beside native JSON in portable ZIPs, not inside it.
5. **Voice foundation:** ● voice dialog, explicit play + record, start bar, optional count-in, visible statuses and recording permission handling. External MediaRecorder assets, waveform, basic level/delete, multiple vocal takes and local draft persistence. Web limits remain 5 minutes / 48 MB per take / 64 MB per ZIP.

### Shared recording editing (Song v16)

Vocal Clips may share a voice Track, move between voice Tracks, duplicate by reference, and trim their recorded lead-in without rewriting audio. Clicking a Song vocal Clip opens the existing lower editing workspace with sampler-style gain, pan, filter, distortion, pitch, vibrato, tremolo and envelopes, plus the shared synth delay bus. The original bytes remain in external assets; Clip-specific effects and trim metadata live in the `.premidi` Song instructions. Legacy Songs continue to load unmodified. The existing native sampler executes the same processing with a versioned sample packet for delay. Short trimmed vocal phrases (up to four seconds) can become Beat rack instruments. Compatible WAV takes of at most 1 MB reuse the original immutable audio asset through Beat v23 / Song v24 source-time excerpts (including leading trim). WebM/MP4 and oversized WAV sources still convert to separate small WAV samples under the legacy Beat codec/size contract. Each linked Song ZIP includes the canonical WAV only once; legacy projects remain unchanged. This is distinct from live Song vocals; the Beat sampler does not yet support delay. The manual trim offset is millisecond precision, with optional approximate sound-onset detection. Timing can be set by bar and sixteenth-note step. Later advances such as formant-preserving pitch, time stretching and automation remain separate work.

## Vocal completion gate — browser and portable Windows 11 (2026-11-04)

**Scope:** bring Song vocal recordings to feature-complete, verified parity in the browser studio and portable native Windows 11 studio. **No iOS, Android, PWA or phone-view implementation in this pass.** Existing phone capability evidence may be regenerated when required by repository checks, but it is not evidence of phone completion. Game-engine (`pre-programmed`) integration remains a separate Stage 6 contract; this pass must preserve its eventual portability.

**Definition of 100%:** all six gates below pass on the same versioned commit, all supported `.premidi` song/asset round trips and legacy files work, browser Pages deployment succeeds, a publicly downloadable Windows portable ZIP is built from that commit, and physical Windows microphone plus physical browser recording observations confirm capture/playback timing. Passing unit or Chromium automation alone must never be labelled full qualification. Keep failed observations and accepted limitations visible here rather than changing the definition of done.

1. **One editable audio sound surface — pending.** Factor the ordinary sampler and vocal shared processors/controls/visualization into reusable components with one parameter definition and contextual applicability (no misleading oscillator, sample-zone or note-trigger settings on a timeline vocal). Match defaults, filtering bypass, gain, distortion, pan, envelope, pitch/bend, vibrato/tremolo and delay semantics. Audio automation remains a planned separate stage unless specifically implemented and verified here. A change to a shared sound processor must appear in both editors. Browser and native rendering must agree to documented numerical/audio tolerances; include audible fixtures.
2. **Precise non-destructive waveform editing — in progress.** One reusable waveform viewport with zoom and source-time trim marker: mouse drag, keyboard adjustment, numeric millisecond entry, optional onset suggestion, visible original-source region and accessible position. Dragging previews without altering source bytes; commit exactly one undoable edit on release; cancel restores the prior trim. Trims must preserve intended Song position, maintain native/web seek alignment and never cut a quiet initial consonant automatically. Test late-onset, silence, non-44.1k audio, trim at boundaries, zoom and undo/redo.
3. **Reusable, expressive Song clips — zero-copy WAV reuse implemented; qualification ongoing.** Short repeated takes default to the chosen existing vocal Track, can overlap, move between Tracks, duplicate/undo and be deleted independently; removing only the last clip prunes an otherwise empty Track without leaving unreachable references. A source recording must have one canonical ID. Use that asset as a Beat-triggerable sound without a hidden second file where the codec/length contract permits; maintain the documented 4-second playable sample bound until an explicitly qualified replacement. Split and tail-trim operations, if offered, must be fully non-destructive with validated clip duration; otherwise disclose their absence. Cross-check all effects before/after Beat conversion.
4. **Clock, capture and transport parity — shared manual alignment and tempo preservation implemented; physical qualification pending.** Song placement in bars and sixteenth-steps, onset trimming in source time, recording start compensation and tempo changes use one unambiguous time mapping. Test seek into an ongoing phrase, overlapping clips, count-in 0–2 bars, pause/resume, loop boundary, cancellation, permission denial, interrupted capture, and multiple successive takes. Verify reference WAV/render against live playback without silent source offset changes. Capture latency calibration or a measured user-adjustable correction must survive reload.
5. **Portable projects and host equivalence — pending.** External audio remains external to `.premidi` JSON; Song ZIPs export/import unique referenced assets once. Old v8/v10/v12/v14/v16/v18/v20/v22/v23 Song documents and new v24 source-reference Songs load/migrate correctly, with meaningful errors for unsupported future versions. Browser and Windows native use the same definitions and never silently fall back to Web Audio in the Windows native host. Portable Windows data stays folder-local; verify close/reopen and project relocation with repeated takes and effects.
6. **Release and observation — pending.** Expand model, UI, browser recording/WAV/ZIP and C++ mixer/native export tests to cover every requirement; complete desktop visual/focus checks at normal and narrow widths. Run `npm run check`, native parity/codec/render and Windows portable workflow; run physical Windows microphone/latency/listening checks and real desktop browser permission/recording checks. Merge only passing work, deploy Pages, publish a Windows portable artifact for the matching version, and record objective evidence and any unverified manual gates here.

**Timing milestone (2026-11-04):** The Voice dialog exposes optional manual *recording alignment* from 0–500 ms, shared with native Windows audio settings through the same folder-local/browser-profile preference. Positive values compensate for a measured late microphone capture by discarding source lead-in; browser recordings preserve untouched source bytes and store the resulting lead-in as recording metadata, while native callback capture discards equivalent front samples. The preference is snapshotted before each take; old takes are not retimed by later preference edits. Song BPM changes now recalculate vocal lengths in sixteenth-steps, retaining real-time audio duration and original start positions instead of truncating phrases. Unit and headless browser fixtures cover overlapping seeks, trims, tempo changes, setting persistence, and native capture setup. **This is user-adjusted compensation, not automatic latency measurement.** Actual microphone/interface delays, browser encoder timing, physical output and Windows recording parity still require observation.

**Work order:** unify shared controls/data contract → waveform gesture and timing model → zero-copy Beat references and clip operations → timing/capture → parity/regressions → observed browser and Windows acceptance. Each independently testable change is a reviewed PR; do not create parallel vocal roadmap files or claim the implementation is complete from a partial milestone.

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
