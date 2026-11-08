# pre-midi

A local-first Beat maker and Song arranger for the [pre-programmed](https://github.com/natanai/pre-programmed) game engine. Native desktop and phone web app are long-term deployment targets; the browser desktop studio remains supported without defining the ceiling for audio quality.

[Open the web studio](https://natanai.github.io/pre-midi/) · [Windows portable preview](https://github.com/natanai/pre-midi/releases) · [Native audio status](docs/native-audio.md) · [Synthesis roadmap](docs/synthesis-roadmap.json)

## Phone studio rebuild (experimental, not release-qualified)

The previous phone-width desktop layout was retired. A dedicated `phone/` host now implements experimental Notes, Sound and Song editing, shared preset browsing, early recording/import workflows and an opt-in offline sample cache. **These are not evidence of full iPhone Safari, microphone, Home Screen, offline or Freeform parity.** The desktop/Windows rollout remains the priority; phone improvements are deferred without deleting this prototype. See the [canonical phone architecture and acceptance ledger](docs/phone-studio.md).

## Windows portable preview

**Current Windows preview: [0.14.1-preview.29](https://github.com/natanai/pre-midi/releases/tag/v0.14.1-preview.29).** Native Stop and pending-Play cancellation are implemented. Settings → audio → audio performance includes an opt-in **test long Song streaming (experimental)** checkbox. This already uses the JS → Rust → C++ page feeder, but currently requires playback from the beginning without loop, count-in or recording; seek and live edits/undo are unsupported. Leave it off for normal editing and recording. Normal native playback retains 600-second/4,096-onset limits. See [release notes](docs/desktop-release-notes.md) and the [source-checked roadmap](docs/synthesis-roadmap.json).

**Newer source, not in preview.29:** the experimental Song stream implements prepared seek/live-edit revisions, continuous looping, count-in and synchronized capture. Software qualification is recorded in [native paging](docs/native-onset-paging.md); physical Windows and large-session performance acceptance remain open. The default transport and WAV export retain their existing limits.

During rapid prototyping, **Windows 11 x64 portable ZIP is the only preview distribution**. Extract the entire ZIP to a writable folder and run `pre-midi.exe`. Keep `data/`, `projects/` and `exports/` with that folder; close the app before moving or backing it up. To upgrade, back up the folder and replace only the executable and release files, **not** your data folders. See [desktop host and upgrade details](docs/desktop-host.md). macOS and Linux native architecture is maintained for the eventual full release, but their preview packages are deferred.

Desktop **Play** and **Hear sound** use the native C++17/miniaudio engine by default. Existing factory synth/sample presets, Song vocals, live edits, WAV export and native microphone recording are implemented, with an explicit Web Audio alternative in Settings. Bounded native multichannel PCM/float WAV and Opus importing is supported; advanced AAC/HE-AAC and extreme-rate importing remain experimental. Physical Windows 11 audio-device latency, dropouts, and recovery are not yet qualified. See [native audio scope](docs/native-audio.md) and [release notes](docs/desktop-release-notes.md).

Windows portable ZIPs remain available for manual installation without signing, an installer, or registry changes. Back up and close the studio, then replace only application files while retaining `data/`, `projects/` and `exports/`. Signed builds additionally support Settings → updates → preview/stable → check for updates, with signature verification and rollback. Unsigned builds never auto-install.

## Use

The **Beat** editor is the default. A Beat contains Instruments and reusable one-measure Chunks, with a maximum of 64 measures. An Instrument can be a pitched piano roll or a Rack of individually triggered Sounds. All synth parameters, note expressions, sample mappings, Chunk offsets and repetitions remain editable.

Choose **↑ Song** to arrange Beats on a longer timeline. Beat Clips can move, overlap on separate Tracks, repeat, and be trimmed without flattening their source. Selecting a Beat Clip or its lane name opens that Beat below. Use **+ Beat** to create a new Beat or add an existing `.premidi`.

Song's **● voice** opens a recording dialog. Pick the Song start bar, optionally count in one or two bars, then select **play + record**. Vocal recordings appear on Tracks *above* all Beat Tracks. They remain external audio assets, not embedded in the instruction file.

**Play** runs the Song only while the Song timeline is expanded. When collapsed, it plays the selected Beat. **Export** chooses Beat or Song, then `.premidi` (default) or WAV. The **Open .premidi** action replaces the active project; **Add .premidi** inside Song adds a Beat.

### QWERTY piano

In the pitched piano roll, use the small keyboard icon next to the piano-key toggle to audition the current Instrument without placing notes. The hover/focus diagram shows the physical QWERTY mapping: `Z X C V B N M , . /` play consecutive white keys from C3 through E4; the upper row supplies sharps. Numpad `+`/`-` moves the entire register by octaves. Holding **left Shift** changes only the right-hand register (N through /). Esc exits performance mode. **Change keys** in the icon's popover lets you rebind pitches to unique physical keys, with restore-defaults support. This is a local preference, not an exported `.premidi` instruction.

Browser performance mode supports simultaneous key presses and releases through the existing synth/sample voice path. The Windows native preview API currently supports timed previews, not per-note hold/release; this performance-mode limitation requires a native host enhancement and does not cause a Web Audio fallback.

## Native project files

- **Beat:** legacy version 7 remains supported; 17–64-bar extended Beats use version 17; modulation and automation use newer versioned Beat documents (v9 and v11 respectively). Long notes sustained across reusable Chunk boundaries use Beat v25; reusable note-level cutoff automation uses Beat v27. Earlier versions retain their original restrictions. Older supported Beat documents migrate through the versioned parser.
- **Song:** legacy version 8 remains supported; Songs containing extended Beats use version 18; source-phase offset clips use Song v20 and attached freeform data uses Song v22; modulation and automation use newer versioned Song documents (v10 and v12 respectively). Songs containing v25 sustained Beats use Song v26, while v27 automated Beats require Song v28; all versions reference Beats, Beat Clips, Vocal Clips and Recordings by stable identities.
- **Audio:** audio bytes stay outside `.premidi`. Projects containing recordings or imported samples export as a ZIP with a `.premidi` manifest and an `assets/` directory. Reimport the ZIP to restore all audio.
- **Browser storage:** local autosave through IndexedDB, with an ordinary browser-storage fallback for smaller projects. Export projects to keep portable backups. There is no account or server-side project storage.
- **Current web constraints:** Beats have 1–64 measures; freeform passages can create reusable Beats without changing the source, provided no notes are clipped by selection boundaries (up to 12 Instruments and 32 distinct Chunks per Instrument; Beat v25 preserves multi-bar sustains); short sampler assets have their own smaller limit; Song vocal takes are currently limited to 5 minutes / 48 MB each, with a 64 MB portable ZIP limit. Standalone hosts will need streaming rather than retaining full recordings in memory.

The goal is **one native music format** for the studio and pre-programmed, including game-driven changes to Beat layers and eventually Sound parameters. **Full engine parity is not implemented yet:** pre-programmed still has an older v2 music reader. Track the migration in [pre-programmed issue #235](https://github.com/natanai/pre-programmed/issues/235).

## Development

The web editor runs directly in modern browsers via GitHub Pages, with no application runtime dependencies and no backend. The Windows portable desktop host uses Tauri and the shared musical core; native macOS/Linux packaging is deferred during rapid prototyping.

- `npm run check` — the routine prototype check: syntax for edited JavaScript plus a small save/load and data-editing smoke suite. No browser, downloads or native build.
- `npm test` — just that small smoke suite, with concise output.
- `npm run check:all` — optional full JavaScript/Node checks. Run only when the change warrants them or full qualification is requested.
- `node tests/song.browser.mjs` / `node tests/layout.browser.mjs` / `node tests/phone.browser.mjs` — optional browser suites for the affected workspace, not routine prerequisites (require Chrome).
- `node scripts/fetch-samples.mjs` — fetch exact pinned CC0 samples and verify their hashes into the ignored `samples/` directory.
- `node scripts/prepare-pages.mjs` — stage **only** the runtime dependency graph, styles, notices and required verified samples in ignored `dist/` for publishing. GitHub Pages does not publish tests, plans or scripts.

The source files have no generated bundles committed to Git. Browser audio is built on the Web Audio API and microphone recording on browser MediaRecorder.

**Rapid prototype policy:** pull requests get one small check. Merging does not repeat it; Pages only prepares and publishes runtime assets. Documentation/test-only edits do not redeploy the studio. The full Chrome/native/audio benchmark workflow is manual. Windows builds run only for an explicit manual build or version tag; preview releases do not require the full audio matrix unless requested, while stable publication still does. Signing, package hashes and folder-local user-data handling remain part of actual Windows packaging. Prefer a targeted check and a quick user-testable change over release-level qualification for every iteration.

Brittle copy/layout/roadmap audits and the generated phone action inventory were removed. Keep behavioral tests that help diagnose real problems available on demand; do not replace the deleted bookkeeping with another mandatory ledger or checklist. See `AGENTS.md` for the default workflow future agents must follow.

## Contracts and credits

- [Canonical terminology](docs/terminology.json) — Sound, Rack, Instrument, Chunk, Beat, Song, Track, Clip, Recording, Asset.
- [Song rollout and integration gates](docs/song-rollout.md), including the [current stabilization handoff](docs/song-stabilization-handoff-2026-11-05.md).
- [Machine-readable native-first synthesis roadmap](docs/synthesis-roadmap.json).
- [Sound editing feature-completion audit and roadmap](docs/synthesis-roadmap.json): `sound_editing` contains the current capability comparison, implemented vocal parity with remaining observation gates, shared Inspector contract and ordered acceptance tasks.
- [Sound-conversion method](docs/synth-conversion.md).
- [Sample provenance and checksums](docs/sample-sources.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
- [Studio interface rules for contributors and agents](AGENTS.md).
- [Canonical phone interface architecture and parity gates](docs/phone-studio.md).

The design remains Beat-first, uncluttered and lowercase in the UI. Preserve external audio assets and existing file compatibility in every format change.

### Project-original audio sources

Five original sample WAVs are committed under [factory-samples](factory-samples/README.md) and included in the normal sound catalog and staging pipeline. These do not contain any part of the Blindside recording. Their canonical Git blob IDs and source paths are listed in the factory-samples README. The existing ZIP importer still requires companion audio bytes when an authored Song references a sample; synthesis-only .premidi Songs do not have that dependency.

### Sustained notes across Chunks

Pitched notes use one onset and one duration even when they cross a Chunk boundary. In a placed Chunk, drag an entire note **left past the keyboard** to remove its new attack and fold the audible remainder into an already-held note at the same pitch from an earlier Chunk. The right edge remains the only note-duration resize handle. The subsequent Chunk displays the held continuation, and clicking it opens the originating Chunk. The editor does not create a silent note when there is no previous held voice; keep or lengthen the earlier note first. The conversion copies a shared Chunk before editing a single placement, so repetitions elsewhere remain unchanged. Advanced offset/repeating placements are not automatically rewritten by this gesture. These notes use the existing v25+ multi-bar sustain representation and playback schedulers.
