# pre-midi 0.14.1-preview.20 — Windows portable test build

**Windows 11 x64, portable ZIP, manual installation.** This is a preview for real-hardware feedback, not a stable or certified audio release. No registry changes or installer are required. The previous preview.19 remains available unchanged.

## What's new

- The merged native Song source-window transport now connects JavaScript to the existing Rust/C++17/miniaudio streaming host behind an **explicit experimental switch**. Source-linked note, sample and vocal packets retain native frame timing beyond 600 seconds; bounded ACK/backpressure handling, shared delay catalog and native errors are tested.
- **Try it:** Settings → audio → **audio performance** → check **test long Song streaming (experimental)**. Native C++ audio must be selected. For this initial field test, turn Song loop **off**, place the playhead at the beginning, and press Play on Song. This is suitable for checking a simple Song longer than 10 minutes or more than 4,096 notes. Uncheck the switch to return to the existing bounded native player.
- The experimental mode supports start-from-beginning, stop and pause/resume, and reports native stream faults. **It intentionally blocks seeking, looping, live edits/undo during playback, count-in and synchronized microphone recording.** These are not lost features: switch off experimental streaming to use the existing short-Song/Beat engine. It never silently falls back to Web Audio.
- The source includes regression tests for precise source-linked page timing, native owner/revision cancellation, page ACKs and retry identity, long sparse Songs, the zero frame clock and the normal playback guard.
- Existing Beat/Freeform editor, canonical Sound Inspector and illustrations, Song Clip arrangement, native sample racks, vocal edits and native WAV export remain available in the normal transport. No `.premidi` document format is changed.

## Focused Windows 11 test checklist

1. **Protect existing data first.** Extract preview.20 into a *separate* writable folder to test cleanly. Do not overwrite preview.19 or delete any `data/`, `projects/` or `exports/` folder. If upgrading in place, close all instances, back up the complete folder, and replace **application files only**.
2. Confirm a normal short Beat and Song work with the experimental switch **off**, including Play, Stop, pause/resume, loop, Sound edits and microphone take. These should continue using the existing native engine.
3. With native C++ selected, toggle the experimental switch on. Disable loop, set the Song playhead at the beginning, then play a simple Song. Verify correct sound from start, no surprise silence on page boundaries, and no audio after Stop. Try pause/resume.
4. Try a Song lasting more than 10 minutes. Listen across the 10-minute mark, compare timing after several minutes, check a saved project with sample/Vocal assets if available, and capture any warning or native error text.
5. Switch back **off** and confirm the normal player still rejects over-limit Songs explicitly rather than producing silent audio. Normal short-Song exports should still work.
6. Report Windows 11 version, chosen device, sample rate/buffer, whether speakers or headphones were used, audible dropouts, and the exact error text or timestamp of any stop. Physical-driver and microphone latency are **not** proven by GitHub's Windows Server 2022 tests.

## Known limitations and release policy

The **default** native Song engine still has a 600-second playback/render bound and 4,096 onsets per session. Long-Song WAV rendering, live-edit/seek reconstruction, loop wraps, audio-device replacement during streaming and synchronized vocal recording in experimental streaming are **not** finished. Use the normal native transport for microphone recording and editable short Songs. Real Windows 11 WASAPI listening, device recovery and timing remain to be qualified by human testing.

The exact release must pass Node/Chrome/audio-quality and native C++/Rust verification plus Windows Server 2022 portable packaging, dependency and upgrade/relocation/recovery checks. CI null-output and mocked JavaScript host checks **do not** certify real hardware sound.

The ZIP is **unsigned** unless a distinct verified signature is explicitly published alongside it. Unsigned previews support manual folder-preserving updates only, not signed automatic installation. Preserve `data/`, `projects/` and `exports/` when updating.

The canonical follow-up architecture and remaining release blockers are in [Song stabilization](song-stabilization-handoff-2026-11-05.md) and [native onset paging](native-onset-paging.md). Track the real-device acceptance criteria in [issue #49](https://github.com/natanai/pre-midi/issues/49).
