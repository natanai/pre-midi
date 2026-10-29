pre-midi 0.14.1-preview.9 adds native sample-rack and recorded/vocal playback to the Windows portable studio. The existing 28 synth presets, 16 sample presets, all 122 shipped assets and all five complete example Beats now render in C++ without unsupported-feature errors or Web Audio fallback.

Samples retain velocity zones, pitch and bends, one-shot/keyed duration, overlaps, filters, 4x drive, envelopes and pan. Vocal clips retain trim, gain, overlap, seek and loop alignment. Native decoding supports the studio's WAV, MP3, Vorbis, Opus, WebM and AAC fixtures. AAC priming and the shipped recorder WAV header are handled explicitly.

- Windows x64 portable ZIP only. Close pre-midi, back up your folder, and replace application files plus `licenses/`. Preserve `data/`, `projects/` and `exports/`, then reopen manually.
- Settings → Check for updates retains the preview channel, installed release version and direct official ZIP link.
- The full 565-case acoustic/library matrix passes. Original synth PCM gates are unchanged; codec/rate conversion has separate declared gates. Native mixer, allocation, seek, looping, priority and decoder tests accompany it.
- Native capture/count-in/latency compensation, live edits and imported channel/rate edge qualification are still in progress. This phase still takes a playback snapshot at Play. WAV export and microphone capture retain their existing web path pending the next phase.
- Automated miniaudio tests use an explicitly selected null backend. Physical Windows WASAPI input/output, latency, driver underruns, disconnect and sleep/resume qualification remain pending.
