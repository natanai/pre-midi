pre-midi 0.14.1-preview.10 adds native live editing, WAV export and sound analysis to the Windows portable studio. Notes, patches, tempo and arrangement edits reach playback without restarting. Paused edits stay paused, and loops retain preceding note releases and delay history.

WAV export now renders the same native synth, sample and vocal engine at 44.1 kHz, including effect tails. Sound analysis uses native rendering too. No AudioContext is required for these paths. The full 565-case factory/asset/example matrix remains in qualification, with native callback, control ownership and binary export regression tests.

- Windows x64 portable ZIP only. Close pre-midi and replace application files plus `licenses/`. Preserve `data/`, `projects/` and `exports/`.
- Settings → Check for updates keeps the installed release version, preview channel and direct official portable ZIP link.
- Microphone capture/count-in/latency compensation and wider imported channel/rate qualification remain in progress.
- Physical Windows WASAPI hardware, driver underruns, loopback latency, disconnect and sleep/resume qualification remain pending. Null-backend CI does not qualify hardware.
