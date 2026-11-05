# Song/freeform stabilization and handoff — 2026-11-05

**Purpose:** One actionable handoff for the remaining desktop Song/freeform and native Windows rollout. Read alongside [song-rollout.md](song-rollout.md), [native-onset-paging.md](native-onset-paging.md), [terminology.json](terminology.json), and [synthesis-roadmap.json](synthesis-roadmap.json). This note records verified distinctions; it does **not** supersede the approved architecture.

## Release disposition and completion

- **Overall Song/freeform engineering estimate: 93%, provisional. NOT 100%.** This percentage is a planning estimate, not an automated test score. It must not increase merely because a C++ building block compiles. Desktop Song/freeform UI, attached lanes, Beat ↔ freeform commands, shared Sound Inspector, Beat and Song export, vocals and source-linked scheduling are largely implemented and browser/native-CI qualified.
- **Stable end-user test candidate:** the separately qualified [v0.14.1-preview.19](https://github.com/natanai/pre-midi/releases/tag/v0.14.1-preview.19) Windows x64 portable release. The preview.19 illustration stabilization passed Windows portable-build/relocation/recovery and source/browser checks on its tagged commit, and its GitHub Pages deployment succeeded. Do **not** claim this portable ZIP includes post-tag native streaming commits. If the link is unavailable, check the GitHub release before communicating an artifact; never invent a downloadable path.
- **Post-preview source commits:** the native streaming pages are now supported by an opt-in C++ mixer but **not yet wired from the Song UI through the JS → Rust → C++ runtime.** Therefore the shipping Windows Song path still enforces 600 seconds per native Session, 4,096 onsets, packet size/density/voice budgets. Do not increase any constants or silently fall back to Web Audio.
- **Hardware acceptance is open.** CI's Windows Server 2022 build/relocation/recovery is not proof of physical Windows 11 output, microphone latency, seeking/editing during real hardware callbacks or audible song completeness. Do not label any new ZIP release-ready without those observations.

## Qualified C++ milestones already merged

| PR | What is actually qualified | Remaining boundary |
|---|---|---|
| [#177](https://github.com/natanai/pre-midi/pull/177) | Fixed-slot mailbox, sequence/owner/revision, ACK, backpressure, no callback allocation | Metadata is not audio |
| [#179](https://github.com/natanai/pre-midi/pull/179), [#180](https://github.com/natanai/pre-midi/pull/180) | Exact full-render source events, bounded pages and absolute native frames | Control-side planning only |
| [#183](https://github.com/natanai/pre-midi/pull/183), [#184](https://github.com/natanai/pre-midi/pull/184) | PCM equivalence through page boundaries and exact late-page packet time rebasing | Preloaded/mocked callback transport |
| [#185](https://github.com/natanai/pre-midi/pull/185) | True existing-DSP `PreparedPageLease`; source asset/recipe ownership independently from metadata ACK | Not dynamically delivered to device |
| [#187](https://github.com/natanai/pre-midi/pull/187) | ONE persistent `native/session.hpp` mixer plays dynamically supplied notes/stereo samples with multi-rate PCM parity and zero callback allocations | Opt-in C++ Session; not shipping Song UI |
| [#189](https://github.com/natanai/pre-midi/pull/189) | Positive delayed strum onsets survive later pages; shared preinstalled delay-feedback bus retains state; callback exposes release watermark | Producer must prevalidate all shared recipes and resource lifetime |
| [#191](https://github.com/natanai/pre-midi/pull/191) | `native/stream-transport.hpp` binds immutable resource leases to mailbox ACK + persistent Session; tested against canonical native PCM. Passed full CI and Windows portable-build checks | Actual miniaudio callback / Rust / JS feeder remains release-gated |

**Additional native device-host candidate:** [PR #192](https://github.com/natanai/pre-midi/pull/192) stages C ABI owner/revision/page/delay/start/stop/status and miniaudio null-backend tests, plus Rust request actions. **At the time of this initial handoff, its latest current-main rebased branch is still in CI.** Merge only the exact passing head; otherwise close and preserve the branch for later. Even if merged, without a JS feeder this is an internal opt-in path and not end-user native Song streaming. Update this line with its final disposition.

## Implementation that must NOT be duplicated

- Beat, Song, freeform, notes, reusable Chunks and vocals share existing model/schema and source-linked scheduling. Do not introduce a second music/Song format or duplicate Sound Inspector. Use `songSchedule.js`, `src/hosts/native/onset-pages.js`, `audio.js::renderEventsInWindow`, `src/hosts/native/page-plan.js`.
- Existing synth/sampler/effects, waveform assets and Voice state live in `native/session.hpp` and `native/voice.hpp`. Page preparation uses `native/prepared-page.hpp`; metadata ACK `native/page-mailbox.hpp`; payload binder `native/stream-transport.hpp`. Do **not** build a second synth or swap whole Sessions at every page.
- A page's metadata becoming retired **never means** its WaveBanks, DriveRecipes, LFO, sample PCM, active voices or shared feedback tails may be released. Keep a separate page resource lease through `keepThroughFrame` and the callback retirement watermark. Source-page notes may sound in later pages after positive timing offsets.
- Do not edit `soundIllustrations.js` or illustration control paths as part of this native pipeline; that work has separate ownership. Phone parity and pre-programmed engine migration are separate, deferred acceptance gates.

## Required order for the next agent

1. **Close PR cleanup first.** Confirm no work is left unmerged in pending PR #192. Close PRs that fail or are explicitly deferred, but preserve their branch SHAs and decisions in this file. Do not merge old phone or decoder feature branches merely to achieve zero open PRs. Do not delete their branches.
2. **Complete the actual native device transport:** validate `premidi_audio_stream_begin/delay/page/start/stop/status_get` on exact current main with `scripts/native-stream-device-check.mjs` at 44.1/48/96 kHz, five pages, active stereo sample and synth/delay tails, callback allocation count zero, explicit backpressure, stale-owner rejection and device close/reopen. Repair only on a guarded branch with CI; no partial C ABI in a portable release.
3. **Add the JS Song feeder, WITHOUT a Web Audio fallback:** in `src/hosts/native/session.js`, use `nextNativeOnsetPage`, `renderEventsInWindow`, `nativePageDescriptorCursor` with a live edit-revision reader and `rebaseNativePlansToPage`. Send bounded real prepared packets to Rust actions, preload enough page range for the callback's worst-case period, read `ackSequence` and `ackEndFrame`, reuse the same Sound/sample assets, reject a missing page as an explicit native fault, and only release source data after the safe callback watermark. The authored Song remains immutable.
4. **Transport editing and lifecycle:** a Song edit/undo/redo, BPM change, seek, loop wrap, output-device reconfigure/loss, pause/stop, microphone record start, file import and owner replacement must invalidate stale pages and either reconstruct a correct continuous Session or provide a visible supported failure (never pretend success/silent music). Delayed strums, long-release envelopes and delay tails must not duplicate at loop boundaries.
5. **Remove native preflight limits only after parity:** multi-page recordings/vocals, 600-second/4,096-onset boundary, sparse hours-long Song with very late onset, high-density bursts, same-pitch collisions, polymeter/reusable Chunks, automation, sample trim, overlapping vocals, exact PCM and cancellation/underrun memory/callback stress. Maintain bounded packet sizes, 64 Voices, 32 shared buses and controlled resource memory. Never just lift a constant.
6. **Release:** run full source/browser/native CI and the Windows portable build/relocation/recovery workflow on the **same exact commit**. Publish/version an identifiable Windows ZIP with hash and folder-local data; verify it on a physical Windows 11 PC. Confirm browser Pages deployment and representative `.premidi` + WAV round trips. Document any non-passing gate. Mobile parity, game-engine native integration, and real Windows microphone latency remain separately tracked.

## Repeatable checks

From a clean checkout with the repository's pinned dependencies:

```bash
npm run check
node scripts/native-page-mailbox-check.mjs
node scripts/native-page-plan-check.mjs
node scripts/native-prepared-page-check.mjs
node scripts/native-persistent-session-check.mjs
node scripts/fetch-miniaudio.mjs
node scripts/native-device-check.mjs
node scripts/prepare-pages.mjs
node tests/song.browser.mjs
```

If C ABI #192 is on the exact current branch, also run `node scripts/native-stream-device-check.mjs`. The full `.github/workflows/verify.yml` checks browser Song, Sound, stage, controls, native DSP/PCM and long-song budget; `.github/workflows/windows-portable.yml` is the required portable build/relocation/recovery gate. Do not call CI a physical-listening gate.

## Closing unrelated, deferred feature PRs

- [#114](https://github.com/natanai/pre-midi/pull/114): phone entities/Beat-control parity was a clean but **desktop-first out-of-scope** PR; user explicitly deferred phone implementation. Preserve `phone/entities-beat-controls-clean-20261102` and its passing source CI for a later phone phase; closing is not rejection of the approved phone plan. Reconfirm final state.
- [#62](https://github.com/natanai/pre-midi/pull/62): stale **draft** native codec/channel expansion, branch `audio/native-import-channels`; its last verification failed and it conflicts with newer main. Preserve source/fixture work and later rebase against the current decoder before any merger. Reconfirm final state.
- [#192](https://github.com/natanai/pre-midi/pull/192): keep its final merge-or-close result and exact CI evidence here, including if the branch is only a development prototype.

## Completion criterion

**100% means the user can play, edit, record and export real Songs and freeform passages in the Windows desktop app with feature/audio parity and no hidden fallback, plus source/browser/native Windows release CI AND physical Windows 11 listening/recording, validated portable storage and real exports.** A source implementation or null-backend PCM test alone never satisfies this acceptance requirement.
