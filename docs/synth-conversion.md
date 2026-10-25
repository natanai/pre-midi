# Harmonic synthesis and recording conversion

Pre-midi owns this implementation. The v6 native sound contract extends the
existing oscillator with `wave: "harmonic"` and 32 numeric `harmonics` strengths
between zero and one. Element zero is the fundamental, element one its second
harmonic, and so on. This is an oscillator recipe, without waveform samples,
asset paths or embedded audio. Other oscillator types retain their existing
interpretation. Both oscillator slots can use harmonics independently.

`harmonics.js` defines validation, starting recipes, visual waveform evaluation
and Web Audio `PeriodicWave` creation. `audio.js` uses it in the existing voice;
transport, audition, converter previews and WAV export share that voice.
`instrumentUI.js` edits the same numeric fields through the canonical score
mutation. The first eight strengths are exposed beside each harmonic oscillator;
the other 24 are progressively disclosed. Harmonic Keys and Harmonic Reed are
ordinary editable presets.

## Conversion flow

1. Record a short sound in the existing countdown recorder, or upload a WAV.
2. Uploads accept up to 20 MB and decode at most 30 seconds. The user selects
   0.06–4 seconds, with a playable original preview. Imported audio's existing
   note/hit dialog can also open this converter.
3. For a note, detect a root where reliable and allow manual correction.
   For a hit, preserve hit intent without requiring the user to assign a note.
4. Convert to synth proposes a harmonic source, noise level, filter, amplitude
   envelope and conservative vibrato estimate. The original audio remains
   temporary recorder state. No score is mutated during analysis or preview.
5. A bounded deterministic search renders up to 33 candidates using
   `audio.renderSynthBuffer`, which schedules the actual native voice. It
   minimizes normalized, multi-frame spectral differences at two FFT sizes
   together with loudness-envelope differences. Refinement keeps the best
   candidate, including the initial proposal. No model, network request or
   alternate approximate synthesizer is involved.
6. Compare the two playable previews. Use synth instrument creates a new
   instrument through `applySoundSelection` and one undoable mutation. Names
   are generated from analyzed brightness, noise and amplitude shape; duplicate
   names get numeric suffixes. Pitched sounds use the piano roll, while hits
   create their own rack. The original composition is preserved.
7. Edit every generated parameter through the normal Sound inspector, save a
   preset, or export. A synth-only composition needs no WAV assets.

Changing the excerpt, note/hit intent or recorded root invalidates a previous
conversion. Closing the recorder aborts the search, stops microphone tracks and
previews, releases object URLs and prevents pending callbacks from updating a
new recording session. Reading an invalid file or cancelling never adds an
instrument. Repeated conversion can use the same original take.

## Deliberate approximation boundary

The present source is a static harmonic series plus shaped noise, followed by
the existing single filter, shared ADSR, movement and effects. It does not
learn an acoustic instrument, infer arbitrary signal graphs, separate chords,
or reconstruct speech. A single recording does not uniquely determine a
source recipe or its response to different held-note lengths. Basic pitch
detection is strongest on stable single notes in its existing detection range;
the recorded-note selector remains available for correction. Matching analyzes
mono audio at 22.05 kHz and the comparison preview renders at 44.1 kHz. A generated
patch is independent of the original audio and always remains native synth data.

## Verification

- Node checks recover independently generated known harmonic ratios, validate
  untrusted coefficients, verify compact `.premidi` round trips and reject
  silent/invalid/overlong input and out-of-range excerpts.
- Real Chrome checks compare the fitted output with a default synth, require
  a measurable improvement on an independent three-harmonic reference, render
  a converted native score to audible WAV, upload a WAV through the actual
  recorder, use its automatic name, edit its harmonic dials, save a preset and
  export without source audio. Both desktop and mobile sizes exercise the flow.
- The real microphone check records through Chrome's media device, converts
  that take, and creates a named native synth through the normal UI.
- Existing rack, audio, layout, recording, persistence and format checks remain
  in the same verification workflow.

## Technical references

- W3C Web Audio API, PeriodicWave and Fourier coefficients:
  https://www.w3.org/TR/webaudio-1.1/#PeriodicWave
- Masuda and Saito (ISMIR 2021), *Synthesizer Sound Matching with Differentiable
  DSP*: https://archives.ismir.net/ismir2021/paper/000053.pdf . This establishes
  the sound-matching task; our implementation uses a small numerical search,
  without their neural estimator or differentiable synthesis implementation.
