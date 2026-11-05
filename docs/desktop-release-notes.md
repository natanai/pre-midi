# pre-midi 0.14.1-preview.19 — portable Windows test candidate

This is a **Windows x64 portable prerelease candidate**, not a certified stable release. It packages a specific qualified source commit so that desktop testers can exercise the recent Sound illustration and native Song developments. The version is intentionally new: the immutable preview.18 tag predates these changes and must not be overwritten.

## What's included

- One canonical Beat/Freeform Sound Inspector. Every conventional Sound knob stays available alongside its educational direct-edit illustration.
- Two-axis interactive control for gain, pan, synthesis, modulation and other applicable parameters; live knob/illustration synchronization, one gesture/one undo step, Escape and pointer-cancellation rollback, numeric units and screen-reader descriptions.
- Physically checked 48 kHz Biquad filter teaching response and delay impulse model; explicitly schematic versus measured real PCM.
- Accurate short-note ADSR release example and keyed/no-follow/one-shot sampler tail explanations, plus truthful recorded-voice/pitch control diagrams instead of invented waveform data.
- Current native Song/page infrastructure merged through PR #189. Later pending native device-transport PRs (#191, #192) are **not** part of this candidate unless explicitly merged into its qualified source before publication.

No normal Sound knob, synthesis effect or existing `.premidi` format was removed as part of the illustration work.

## Qualifications and limitations

The release workflow must pass Node/Chrome tests, desktop build, native C++/Rust qualifications, and the Windows Server 2022 portable relocation/recovery smoke test **for the exact tagged commit**. Verify that its published portable ZIP and `SHA256SUMS.txt` match the release; never assume passing browser CI alone means the Windows ZIP exists.

**Not yet qualified on physical Windows 11:** real audio output and latency/dropouts, microphone timing, hardware device changes, long-running Song paging through the latest native path, and end-user usability. Phone Safari, game-host parity, and the future signed stable updater are separate gates. Do not promote this preview to a stable release based on automated tests alone.

## Test or upgrade without losing data

1. Download the ZIP from the [preview.19 release page](https://github.com/natanai/pre-midi/releases/tag/v0.14.1-preview.19) **only after that page contains the published ZIP and checksum file**. For a clean test, extract the ZIP to a new writable folder and launch `pre-midi.exe`.
2. Before upgrading an existing portable folder, close every instance and back up the **entire** folder. Replace only application files (`pre-midi.exe`, `portable.txt` and `README.txt`) from the new ZIP; preserve `data/`, `projects/` and `exports/` in place.
3. An unsigned ZIP supports **manual folder-preserving updates only**. It cannot silently install itself, does not need registry changes, and must not claim signed automatic updating.

The current release checklist, exact CI evidence, remaining illustration tasks and next-agent procedure are maintained in [sound-illustrations.md](sound-illustrations.md). The separate Song/native owner maintains [song-rollout.md](song-rollout.md) and [native-audio.md](native-audio.md).
