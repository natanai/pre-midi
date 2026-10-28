# pre-midi vs professional synthesizers — source-based capability audit (2026-10-28)

**Baseline:** `10ea09ecdb871d6312f67f95a84f7273a082ef79` (source inspection, not a hands-on Windows listening test). This compares broad capability categories found in professional software instruments such as Vital, Serum, Phase Plant, Pigments, and Kontakt. It does **not** assert feature-for-feature compatibility with any particular current product version.

## Important distinction

pre-midi is both a Beat/Song arranger and an instrument editor, whereas the named reference products are primarily sound-design instruments or samplers. A missing synthesizer feature does not make the arrangement editor incomplete, and a working arrangement editor does not establish professional synth parity. Evaluate the synthesizer and the studio separately.

| Capability | pre-midi web / authored model | Windows native preview.4 | Professional benchmark gap |
| --- | --- | --- | --- |
| Oscillators | Two slots; sine, triangle, square, saw and 32-harmonic editable wave; octave/detune/level | Canonical oscillator bank supported | No general morphing wavetable positions, unison/spread, oscillator sync, FM/PM or flexible oscillator routing |
| Noise | Basic noise amount/decay | Unsupported | No rich noise library, noise shaping, keytracking or noise oscillator routing |
| Filters | One stage, low/high/band/notch, cutoff/resonance, basic sweep and modulation | Static modes and v3 cutoff automation; sweep unsupported | No multiple serial/parallel filter paths, drive/filter character, comb/formant/ladder variety or sophisticated routing |
| Envelopes | ADSR amp; independent ADSR modulation source | Supported for documented plans | No multi-stage drawable/MSEG envelopes, tempo-synced looping envelope shapes or flexible per-voice envelope assignments |
| LFO and modulation | Up to 16 routes, LFO sine, ADSR, velocity and keytrack; six target IDs | Canonical v2 routes supported; legacy movement not | Narrow source and destination palette, no drag/drop modulation graph, macros, random/step/chaos sources, LFO shape editor, audio-rate modulation |
| Pitch expression | Bend/glide and movement controls | Prepared pitch curves; legacy movement unsupported | No complete MIDI/MPE per-note expression, tuning systems, portamento mode variants or performance controller mapping |
| Effects | Waveshaper drive (4x Web Audio oversampling), delay; sample filter/drive | Drive and delay unsupported | No professional FX rack with reorder/routing; missing reverb, chorus, flanger, phaser, compressor, EQ, saturation variants, convolution |
| Sample instruments | Rack and short imported/recorded WAV/OGG/MP3 assets with external-asset project ZIP | Sample playback unsupported | No multisample key/velocity zones, round-robin, disk streaming, granular, time-stretch, transient/slice workflows |
| Polyphony | Voice allocator, note-off and lifecycle tests | 64 active plus retiring voices per lane, native callback | Need real-device stress/steal audibility, mono/legato behavior and detailed per-instrument polyphony control |
| Automation | Versioned cutoff automation and musical note expression | Prepared cutoff automation supported | No broad parameter automation lanes, clip envelopes, modulation automation or sample-accurate updates during live editing |
| Presets | Instrument presets and example library | Supported subset only | No rich searchable tagging, audition/compare A/B, snapshots, macro presets, import/export interoperability |
| Editing while playing | Browser editor supports active playback workflows | Native snapshot requires restart after edits | Immediate interactive sound design is a core expectation |
| Recording and export | Browser Web Audio and microphone workflows, WAV, declarative .premidi plus external assets | Uses Web Audio; native vocal/sampler timing not integrated | No verified native low-latency monitoring, sample-accurate recording alignment, advanced export/mastering options |
| MIDI performance | Piano roll and pointer-based authoring | No qualified MIDI/MPE live input | External keyboard, sustain, aftertouch, pitch bend, CC learn, MIDI clock and MPE |
| Sound quality | Measured browser/native offline parity, anti-aliasing and envelope tests | Null-backend callback tested | No Windows 11 physical-driver measurements, independent listening signoff, hardware underrun/latency evidence |
| Host integration | .premidi declarative formats, game integration issue #235 | Desktop plays supported plans | pre-programmed native player and game-driven parameter/arrangement control are unfinished |

## Severity and sequencing

### P0 — Make the native studio useful with real projects

1. Native sample-rack and recorded-asset playback with robust decode/streaming boundaries.
2. Native noise, delay, drive, filter sweep and legacy movement parity.
3. Live native editing without restarting playback.
4. Native Song vocal playback and recording alignment.
5. Physical Windows WASAPI latency, dropout, device switching, sleep/resume and sustained CPU testing.

### P1 — Meet baseline professional sound-design expectations

1. Expand modulation targets to most audible parameters; add macros, random/step sources and editable LFO shapes.
2. Add oscillator unison, detune/spread, wavetable morphing and at least one phase/frequency modulation route.
3. Add multiple routable filters and common professional FX: EQ, compressor, chorus, reverb and saturation.
4. Add MIDI keyboard, sustain, pitch bend, velocity, CC mapping, aftertouch and eventually MPE.
5. Add flexible per-instrument voice modes, mono/legato/glide and real-time performance controls.

### P2 — Competitive depth after core parity

1. Granular/spectral engines, multisampling zones, round-robin, streaming and high-quality time stretch.
2. Flexible audio-rate modulation, drawable MSEG envelopes, morphing filters, advanced routing.
3. Full mix buses, sidechain, send/return, oversampling quality modes, loudness/true-peak export checks.
4. Preset browsing, tagging, A/B comparisons and quality-controlled sound-library expansion.

## Acceptance rules

- No claim of “professional-grade parity” from control count alone: musical sound examples, measured DSP artifacts, CPU behavior, listening review and newcomer usability must agree.
- Do not silently render unsupported native patches with different timbres.
- Do not delete legacy schema readers or comparison reports to simplify implementation.
- Keep the interface sparse; expose deeper capability contextually rather than making every synthesis control visible at once.
- During rapid prototyping publish **Windows portable ZIP only**, retaining the cross-platform DSP abstraction and native backends for full release.
- Native .premidi playback in pre-programmed remains an explicit separate release gate.

## Evidence inspected

- `synth.js`, `src/dsp/modulation.js`, `audioEffects.js`, `sampler.js`.
- `docs/native-audio.md`, `docs/desktop-release-notes.md`, `docs/desktop-host.md`.
- `docs/synthesis-roadmap.json`, `docs/song-rollout.md`, `README.md`.
- `.github/workflows/desktop-release.yml`, current GitHub release assets and CI history.

This is a **source-based capability audit**. It does not substitute for listening to pre-midi on a physical Windows machine or comparing its output in matched blind tests against named commercial instruments.
