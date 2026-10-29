pre-midi 0.14.1-preview.12 extends native synthesis to long held notes and pitch at the device frequency limit. Glides, bends and deep modulation retain their authored movement with an explicit Nyquist clamp. Stable sine LFO execution prevents accumulated phase drift during long, deeply modulated notes. Low-rate tone movement and fractional vibrato starts are also corrected.

This preview includes native microphone capture, synchronized count-in, WAV vocals, sample racks, recording previews and the full example library from the preceding native phases. Existing portable data and Settings update behavior are preserved.

- Windows x64 portable folder ZIP only. Close the app and replace application files plus `licenses/`; preserve `data/`, `projects/` and `exports/`.
- Automated qualification covers native preparation, independent acoustic references, block-size invariance, malformed packets, callback allocation and packaged recording workflows.
- Physical Windows WASAPI input/output, measured latency, sustained dropouts and device recovery remain unqualified. Broader imported channel/rate qualification continues.
