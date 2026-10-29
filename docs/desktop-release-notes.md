pre-midi 0.14.1-preview.11 adds native microphone recording, count-in and recording previews to the Windows portable studio. Both the short Sound recorder and Song vocal recorder now use the native audio device. Count-in and capture share the playback callback clock. Settings provides a calibrated recording offset; zero remains the unmeasured default.

Vocal takes save lossless external WAV assets with explicit Song v14. Older v8/v10/v12 Songs remain readable. Native capture, raw/synth previews, waveform analysis, imports and WAV export do not require browser audio. Existing portable data and update behavior are preserved.

- Windows x64 portable folder ZIP only. Close the app and replace application files plus `licenses/`; preserve `data/`, `projects/` and `exports/`.
- Automated checks cover timing, buffer-size invariance, ownership, callback allocation and packaged native recording workflows. Null-backend recordings are software tests, not real microphone evidence.
- Physical Windows WASAPI input/output, calibrated latency, sustained dropouts and device recovery remain unqualified. Broader imported channel/rate and execution-edge qualification continues.
