# Native Song onset paging: implementation and qualification contract

Status: **page preparation only, not pageable native playback**.

Canonical Song/freeform completion and ordering: [song-rollout.md](song-rollout.md).
Do not remove the existing native preflight errors or mark a Windows portable build qualified on the strength of these helpers.

## Implemented control-thread preparation

- `songSchedule.js → scheduledSongOnsetsInWindow(song,startStep,endStep,{maxEvents})` compiles only authored onsets in the half-open absolute Song-step range. It preserves Beat source phase, non-bar-aligned Clips, repeated freeform Chunks, direct notes, vocal onsets, original note duration and source references. It does not enumerate all earlier repetitions to fetch a late window. The maximum returned count is bounded by 4,096.
- `src/hosts/native/onset-pages.js → nextNativeOnsetPage(song,startStep,{maxSteps,maxOnsets})` chooses the longest whole-step window inside both limits, using a monotonic search of source-linked onsets. A step containing more events than its budget is rejected explicitly rather than silently partitioned, shortened or dropped.
- The unit fixtures compare every compiled window with the original full Song onset schedule, including long note releases across page edges, order/phase, large sparse Songs, high density, and non-destructive source ownership. These tests do **not** verify real-time callback page delivery.

## Existing native safety invariants (still mandatory)

`src/hosts/native/session.js` and `native/session.hpp` currently accept one immutable C++ Session for a playback cycle of at most 600 seconds and at most 4,096 note/voice onsets, subject to a 16 MiB encoded event-packet cap, per-render-block onset density, voice limits, and bounded oscillator/delay recipes. Playback over either limit must fail preflight explicitly; **never** silently route to Web Audio or increase constants as a shortcut.

Window compilation alone does not bypass the single-session limit or make long Songs playable. Every window is still an unplayed preparation artifact until the remaining steps below have shipped.

## Required native host protocol before enabling pages

1. A control worker prepares immutable absolute Song-time event pages, voice-bank recipes, external WAV/recording handles, and effect resources before publication. Page duration adapts to onset density *and* measured bank, effect, audio asset and callback work capacity. The audio callback must not parse packets, allocate memory, decode files, lock a mutex, or wait for page delivery.
2. The C++ host exposes an owner- and revision-bound **publish / acknowledge** protocol with bounded pending and active slots. Each page includes its absolute frame interval, revision, monotonic sequence number, and a complete, validated resource handle set. The real-time callback acknowledges exactly when a page becomes active and reports underrun/fault conditions without invoking host JS.
3. Preserve live oscillator phases, envelope/release state, vibrato/pitch and cutoff automation phase, active sample/recording playback positions, distortion/filter history and delay feedback across a page boundary. A note with onset in page A but release in page B is started **only in A**. Do not create a second Voice in B or truncate the first. Preserve deliberate polyphony and overlapping vocals.
4. Seek, pause/resume, stop, loop and Song edits need deterministic page invalidation and transport ownership. A seek reconstructs every still-sounding note and effect at its exact absolute source phase; a loop does not reuse stale revision pages. Changes should invalidate future pages while protecting callback-owned resources still in use. An unloaded page must lead to a clear native fault/stop, never a timing gap disguised as success.
5. Audit samples and presets using their existing `.premidi` and folder-local asset references. There is no separate sample format, alternate synth, or second Song clock. Page transport remains a native C++ playback concern; educational Sound illustration code and phone UI are outside this milestone.

## Qualification to remove the old limits

- Equivalence between full and paged source-linked onsets at 4,095/4,096/4,097 event boundaries, high-density multi-Clip overlaps, mixed pitched/Rack Sounds, irregular Chunks, independent notes, vocals, sample zones and recorded takes.
- Deterministic native-vs-browser PCM and timeline fixtures spanning multiple pages: sustain/release, oscillators, cutoff/pitch modulation, filter/distortion state, delay feedback, recording trim/offset, edit/undo/redo, seek and loop.
- A 10+ minute sparse Song, prolonged silence between pages, callback starvation, forced page rejection, stale revision/owner, memory/bank limits, device loss and clean recovery. Record callback allocations and worst-case processing time.
- Windows CI qualification, then actual Windows 11 device output, recording latency/listening, portable folder relocation and `.premidi`/WAV export acceptance. A tested portable ZIP must be built from the exact qualified commit.

**Stop condition:** If any page has unresolvable dependencies, a missing handle, a non-finite transport duration, an impossible callback budget, or a failed acknowledgment, native playback must stop with a diagnostic without losing the authored Song or changing its music.
