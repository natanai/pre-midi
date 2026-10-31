# pre-midi

A local-first Beat maker and Song arranger for the [pre-programmed](https://github.com/natanai/pre-programmed) game engine. Native desktop and mobile are the primary long-term deployment targets; the current browser studio remains supported without defining the ceiling for audio quality.

[Open the web studio](https://natanai.github.io/pre-midi/) · [Windows portable preview](https://github.com/natanai/pre-midi/releases) · [Native audio status](docs/native-audio.md) · [Synthesis roadmap](docs/synthesis-roadmap.json)

## Windows portable preview

During rapid prototyping, **Windows 11 x64 portable ZIP is the only preview distribution**. Extract the entire ZIP to a writable folder and run `pre-midi.exe`. Keep `data/`, `projects/` and `exports/` with that folder; close the app before moving or backing it up. To upgrade, back up the folder and replace only the executable and release files, **not** your data folders. See [desktop host and upgrade details](docs/desktop-host.md). macOS and Linux native architecture is maintained for the eventual full release, but their preview packages are deferred.

Desktop **Play** and **Hear sound** use the native C++17/miniaudio engine by default. Existing factory synth/sample presets, Song vocals, live edits, WAV export and native microphone recording are implemented, with an explicit Web Audio alternative in Settings. Bounded native multichannel PCM/float WAV and Opus importing is supported; advanced AAC/HE-AAC and extreme-rate importing remain experimental. Physical Windows 11 audio-device latency, dropouts, and recovery are not yet qualified. See [native audio scope](docs/native-audio.md) and [release notes](docs/desktop-release-notes.md).

The portable edition can check for newer releases, but updates require manual folder-preserving ZIP replacement; no automatic portable installer is used.

## Use

The **Beat** editor is the default. A Beat contains Instruments and reusable one-measure Chunks, with a maximum of 16 measures. An Instrument can be a pitched piano roll or a Rack of individually triggered Sounds. All synth parameters, note expressions, sample mappings, Chunk offsets and repetitions remain editable.

Choose **↑ Song** to arrange Beats on a longer timeline. Beat Clips can move, overlap on separate Tracks, repeat, and be trimmed without flattening their source. Selecting a Beat Clip or its lane name opens that Beat below. Use **+ Beat** to create a new Beat or add an existing `.premidi`.

Song's **● voice** opens a recording dialog. Pick the Song start bar, optionally count in one or two bars, then select **play + record**. Vocal recordings appear on Tracks *above* all Beat Tracks. They remain external audio assets, not embedded in the instruction file.

**Play** runs the Song only while the Song timeline is expanded. When collapsed, it plays the selected Beat. **Export** chooses Beat or Song, then `.premidi` (default) or WAV. The **Open .premidi** action replaces the active project; **Add .premidi** inside Song adds a Beat.

## Native project files

- **Beat:** legacy version 7 remains supported; modulation and automation use newer versioned Beat documents (v9 and v11 respectively). Older supported Beat documents migrate through the versioned parser.
- **Song:** legacy version 8 remains supported; modulation and automation use newer versioned Song documents (v10 and v12 respectively), referencing Beats, Beat Clips, Vocal Clips and Recordings by stable identities.
- **Audio:** audio bytes stay outside `.premidi`. Projects containing recordings or imported samples export as a ZIP with a `.premidi` manifest and an `assets/` directory. Reimport the ZIP to restore all audio.
- **Browser storage:** local autosave through IndexedDB, with an ordinary browser-storage fallback for smaller projects. Export projects to keep portable backups. There is no account or server-side project storage.
- **Current web constraints:** Beats have 1–16 measures; short sampler assets have their own smaller limit; Song vocal takes are currently limited to 5 minutes / 48 MB each, with a 64 MB portable ZIP limit. Standalone hosts will need streaming rather than retaining full recordings in memory.

The goal is **one native music format** for the studio and pre-programmed, including game-driven changes to Beat layers and eventually Sound parameters. **Full engine parity is not implemented yet:** pre-programmed still has an older v2 music reader. Track the migration in [pre-programmed issue #235](https://github.com/natanai/pre-programmed/issues/235).

## Development

The web editor runs directly in modern browsers via GitHub Pages, with no application runtime dependencies and no backend. The Windows portable desktop host uses Tauri and the shared musical core; native macOS/Linux packaging is deferred during rapid prototyping.

- `npm run check` — JavaScript syntax checks and Node regression tests.
- `node tests/song.browser.mjs` — desktop/mobile Song browser interaction, playback, and recording checks (requires Chrome).
- `node tests/layout.browser.mjs` — responsive layout, examples, racks, conversion and sound tests (requires Chrome).
- `node scripts/fetch-samples.mjs` — fetch exact pinned CC0 samples and verify their hashes into the ignored `samples/` directory.
- `node scripts/prepare-pages.mjs` — stage **only** the runtime dependency graph, styles, notices and required verified samples in ignored `dist/` for publishing. GitHub Pages does not publish tests, plans or scripts.

The source files have no generated bundles committed to Git. Browser audio is built on the Web Audio API and microphone recording on browser MediaRecorder.

## Contracts and credits

- [Canonical terminology](docs/terminology.json) — Sound, Rack, Instrument, Chunk, Beat, Song, Track, Clip, Recording, Asset.
- [Song rollout and integration gates](docs/song-rollout.md).
- [Machine-readable native-first synthesis roadmap](docs/synthesis-roadmap.json).
- [Sound-conversion method](docs/synth-conversion.md).
- [Sample provenance and checksums](docs/sample-sources.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
- [Studio interface rules for contributors and agents](AGENTS.md).

The design remains Beat-first, uncluttered and lowercase in the UI. Preserve external audio assets and existing file compatibility in every format change.
