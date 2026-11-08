> Workflow update (2026-11-07): this is historical stabilization evidence. The lean prototype policy in `AGENTS.md` and the README supersedes its broad routine-check requirements.

> **Source reconciliation, 2026-11-08:** This handoff records earlier milestones. At `d87799e`, preview.29 is published; the JS Song feeder in step 3 below already exists in `src/hosts/native/song-stream-control.js` and is wired from `audio.js`. Do not implement another feeder. Remaining streaming work is seek/loop/live-edit/count-in/capture lifecycle and physical Windows acceptance. Native Stop/pending-Play cancellation is implemented in `5de5617`. Use the current checkpoint in [song-rollout.md](song-rollout.md) and [synthesis-roadmap.json](synthesis-roadmap.json); historical percentages are not current measurements.

# Song/freeform stabilization and handoff — 2026-11-05

**Purpose:** One actionable handoff for the remaining desktop Song/freeform and native Windows rollout. Read alongside [song-rollout.md](song-rollout.md), [native-onset-paging.md](native-onset-paging.md), [terminology.json](terminology.json), and [synthesis-roadmap.json](synthesis-roadmap.json). This note records verified distinctions; it does **not** supersede the approved architecture.

## Desktop workspace consolidation (2026-11-06)

The current desktop UI consolidation is documented in `song-rollout.md` under Shared desktop workspace. Beat/freeform share `editorWorkspace.js`, pitched/Rack row DOM, scale/key painting, history controls and Inspector visibility; the competing Freeform layout and Sound disclosure are removed. Keep the intentional local-Chunk and absolute-Song timing adapters. Existing immutable Windows ZIPs do not change, and physical Windows/native long-Song acceptance below remains open. Local Node and Chrome qualification is recorded in the canonical rollout document. GitHub publication is now explicitly authorized. Confirm the exact deployed commit through the Pages workflow before claiming that the live studio contains this workspace change.

## Preview.20 field-test candidate (2026-11-05 local)

- The next intended immutable portable ZIP is `v0.14.1-preview.20`, prepared from an exact-commit PR and required to pass Node/Chrome/native plus Windows portable packaging/recovery **before publication**. Do not claim the ZIP is available until the GitHub release contains it.
- The default Windows native player is unchanged. Under **Settings → audio → audio performance**, a new explicitly off-by-default **test long Song streaming (experimental)** checkbox opts a user into the JS → Rust → C++ streaming bridge. Turn the Song loop off and start from the first bar; playback and pause/resume are pilot features. Seek, live edit, loop and synchronized microphone recording remain blocked in this mode.
- [Preview.20 release notes](desktop-release-notes.md) contain the clean-folder backup/installation steps and specific real Windows 11 listening tests. Physical WASAPI stability and downloadable .20 artifacts remain unverified until reported.
- Do not promote the provisional 93% Song/freeform completion figure merely for exposing a test control. The ZIP is for collecting actual long-Song device evidence, and is **not** a stable release.

## Repository stability audit checkpoint (2026-11-05)

- **Preserve preview.19 unchanged.** Current main at audit baseline `068beb69c1b0b30401901fdba1fd24ff359d65aa` is nine commits ahead of immutable preview.19; the ZIP is the last published Windows candidate. Do not claim post-tag DeviceHost/Rust streaming changes ship in it.
- **Source and release CI are separate.** The latest baseline Pages deploy succeeded ([run 42097347110](https://github.com/natanai/pre-midi/actions/runs/42097347110)). Exact #192 PR source/browser/native ([run 42096053203](https://github.com/natanai/pre-midi/actions/runs/42096053203)) and Windows portable qualification ([run 42096053213](https://github.com/natanai/pre-midi/actions/runs/42096053213)) succeeded; none measures real WASAPI. Maintenance changes make main run source verification, and expand native/source Windows workflow triggers to test affected commits even without new release version.
- **Documentation reconciliation:** `README.md` and `AGENTS.md` acknowledge experimental phone Notes/Sound/Song without implying Safari parity; `docs/synthesis-roadmap.json` distinguishes current preview from native paging source. The 2026-10-28 maintenance/pro-synth audits remain historical. Issue #49 should track remaining Windows acceptance rather than obsolete DSP limitations. Continue to use this handoff for native Song acceptance instead of creating another competing roadmap.
- **Release gate remains open:** no shipping JS Song feeder, so native 600-second/4,096-onset limits remain. Full source/native/Windows CI, a new immutable versioned ZIP **and physical Windows 11 output, recording, seek/edit/loop and portable-data checks** are required before 100% or stable status. Phone/game parity and professional synthesis improvements remain separate scope.

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

**Device-host milestone now merged:** [PR #192](https://github.com/natanai/pre-midi/pull/192) passed full [source/browser/native verification](https://github.com/natanai/pre-midi/actions/runs/42096053203) and [Windows Server 2022 portable build, relocation, and recovery checks](https://github.com/natanai/pre-midi/actions/runs/42096053213) at exact head `1ca052094777d777cac3bccee223358f1606c6a1`; merged as `c028fb478402c473902215187708d4f7ccbc5e0d`. It exposes owner/revision/page/delay/start/stop/status via C ABI and Rust request actions, and tests actual miniaudio **null-device** callback streaming. **There is still no JS Song-page feeder using those actions**, so this is an internal opt-in path, not end-user long-Song streaming or hardware proof.

## Implementation that must NOT be duplicated

- Beat, Song, freeform, notes, reusable Chunks and vocals share existing model/schema and source-linked scheduling. Do not introduce a second music/Song format or duplicate Sound Inspector. Use `songSchedule.js`, `src/hosts/native/onset-pages.js`, `audio.js::renderEventsInWindow`, `src/hosts/native/page-plan.js`.
- Existing synth/sampler/effects, waveform assets and Voice state live in `native/session.hpp` and `native/voice.hpp`. Page preparation uses `native/prepared-page.hpp`; metadata ACK `native/page-mailbox.hpp`; payload binder `native/stream-transport.hpp`. Do **not** build a second synth or swap whole Sessions at every page.
- A page's metadata becoming retired **never means** its WaveBanks, DriveRecipes, LFO, sample PCM, active voices or shared feedback tails may be released. Keep a separate page resource lease through `keepThroughFrame` and the callback retirement watermark. Source-page notes may sound in later pages after positive timing offsets.
- Do not edit `soundIllustrations.js` or illustration control paths as part of this native pipeline; that work has separate ownership. Phone parity and pre-programmed engine migration are separate, deferred acceptance gates.

## Additional source milestone: JavaScript Song page preparation (not end-user streaming)

- `src/hosts/native/song-stream-page.js` implements the bounded JS packet-building and immutable backpressure-retry boundary. It uses existing Song event/materialization/plan code, rebases all note/sample/vocal times to page-local native frames, preserves `.premidi` source music, enforces native packet and resource claims and precomputes exact shared delay recipes. `tests/nativeSongStreamPage.test.js` covers late-page precision, staleness, missing assets, malformed native acknowledgment and retry identity.
- **Experimental JS-to-native bridge (not general release):** `audio.js` can invoke `src/hosts/native/song-stream-control.js` only under the explicitly set local developer flag `premidi-native-song-streaming=experimental`. It begins an owner/revision-bound stream, registers shared delays, preloads three contiguous pages, polls actual native ACK/fault/position, refills lookahead with exact retries, and handles pause/resume/stop. The normal editor path is unchanged. Full seek, live edits/undo, dynamic loop and synchronized microphone recording currently reject and stop rather than using an incorrect reconstruction. Physical Windows WASAPI and real low-level device performance remain unqualified. Do **not** raise the provisional 93% to 100%; native 600-second/4,096-onset safeguards stay intact.
- Next agent should use this reusable producer rather than duplicating Sound/Beat/Freeform scheduling. Start streaming only after enough contiguous pages are prepared; handle `accepted:false` without skipping sequence; fail visibly on missing pages. Reset ownership on stop, seek, edit, microphone start or device reconfigure; never silently switch to Web Audio.

## Required order for the next agent

1. **PR cleanup finished on 2026-11-05.** Verified **zero open PRs** using the repository's GitHub pull-request listing after #191 and #192 merged; #114/#62 were explicitly closed unmerged with their branches preserved. If new PRs appear later, reconcile them rather than assuming this snapshot is permanent.
2. **Actual native device transport implemented/CI-qualified in #192; still needs real Windows 11 output.** C ABI and Rust actions now exist on `main`. `scripts/native-stream-device-check.mjs` tests five pages, delayed notes, shared feedback, stereo sample, bounded page slots, stale-owner rejection and callback allocations against the real miniaudio null backend at 44.1/48/96 kHz. Its inclusion in CI passed alongside Windows portable build/relocation/recovery. It is NOT a physical audio-device test and cannot yet be called from the Song UI without step 3.
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

Because C ABI #192 is now on `main`, also run `node scripts/native-stream-device-check.mjs`. The optional `.github/workflows/qualify.yml` checks browser Song, Sound, stage, controls, native DSP/PCM and long-song budget; run it only when full qualification is requested. `.github/workflows/desktop-release.yml` runs only for a requested Windows build/release or version tag. Do not call CI a physical-listening gate.

## Closing unrelated, deferred feature PRs

- [#114](https://github.com/natanai/pre-midi/pull/114): **closed without merge** 2026-11-05. Phone entities/Beat-control parity is desktop-first out-of-scope; user explicitly deferred phone implementation. Preserve branch `phone/entities-beat-controls-clean-20261102` at `568cc9bd97fdb6e5a5e88faa22d3860c9b21e4c5` and its passing source CI for a later phone phase. Closing is not rejection of the approved phone plan.
- [#62](https://github.com/natanai/pre-midi/pull/62): **closed without merge** 2026-11-05. Stale draft native codec/channel expansion, branch `audio/native-import-channels` at `85efbb983f6cb08a717dc69f03df1b1c5c3cb0af`; last verification failed and it conflicts with newer main. Preserve source/fixture work and rebase against the current decoder only if revisiting the feature.
- [#192](https://github.com/natanai/pre-midi/pull/192): **merged** `c028fb478402c473902215187708d4f7ccbc5e0d` after passing exact-head verification and Windows portable build CI. Device host + Rust control actions only, not production JS Song streaming.

## Completion criterion

**100% means the user can play, edit, record and export real Songs and freeform passages in the Windows desktop app with feature/audio parity and no hidden fallback, plus source/browser/native Windows release CI AND physical Windows 11 listening/recording, validated portable storage and real exports.** A source implementation or null-backend PCM test alone never satisfies this acceptance requirement.
