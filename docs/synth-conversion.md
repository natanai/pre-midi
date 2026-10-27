# Synth conversion

The short-sound converter analyzes recorded samples to make a native editable harmonic synthesizer patch. `microphoneUI.js`, `soundAnalysis.js`, `synthMatch.js`, `harmonics.js`, and `audio.js` hold the implementation; tests cover its output and export.

The native synth has 32 harmonic strengths per oscillator plus envelopes, filters and noise. A brief excerpt cannot reconstruct chords, speech or changing acoustic resonances. Samples and generated synths remain different options. Generated synths do not require audio assets.

See `tests/soundAnalysis.test.js` and `tests/synth-check.html` for acceptance behavior.
