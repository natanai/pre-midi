# pre-midi 0.14.1-preview.32 - Windows portable preview

Windows 11 x64 portable ZIP, with manual updates and folder-local data.

## Changes since preview.31

- Chorus, flanger, phaser, auto-pan, ring modulation and frequency shifting in the shared processing Inspector, with direct illustrations, ordinary controls and native/browser rendering.
- Independent pitch and time for recorded Sounds and vocals, with formant preservation/shift and reversible source playback. Choose pitch + speed or independent pitch; stretch and transpose remain editable while the original recording stays untouched.
- Source treatment follows trims, source elapsed time, note pitch-follow, Clip duration/tempo, audition, measured scope, native revisions and WAV export. Native source preparation uses C++; browser preparation uses a Worker/WASM build of the same library.
- Ring/frequency shifting use a bounded FIR with matched dry/wet delay and explicit frequency-boundary filtering. These stages add 64 frames each; arrangement-wide latency compensation remains unfinished.
- Obsolete scope previews are skipped before entering native preparation. Existing urgent native pause/resume/Stop, transport ownership and paused-seek safeguards are retained.

Focused source/data, DSP, shared Inspector, Rust control and 48 kHz null-device streaming checks passed locally, with zero callback allocations. Windows build and portable checks are recorded by this release's workflow; they do not replace testing on your audio device.

## Install and test

Extract the complete ZIP into a writable folder and open `pre-midi.exe`. Keep `portable.txt` beside it. For a manual update, close the app and replace application files only; preserve `data/`, `projects/` and `exports/`.

Try the six modulation effects on a synth and recording. On a vocal, compare pitch + speed with independent pitch, then change stretch, formants and reverse. Test trim, undo, save/reopen and WAV export. Try play/pause/stop while source processing or scope previews are preparing. Music ZIPs include external audio assets; plain `.premidi` files reference them.

## Still on the roadmap

The full roadmap is **not complete**. Wider automation/modulation targets and gesture recording, shared buses/sidechains/global latency compensation, monophonic correction/tuning, sampler waveform/loop editing, remaining noise/shaper controls and physical/newcomer/listening qualification remain open. Phone and game-host completion remain separate work.

Pitch/time ranges are .5–2× duration, up to ±48 semitones of effective independent pitch and ±12 semitones of formant shift. Spectral processing supports mono/stereo and retains existing memory/arrangement limits. Quality at extremes needs listening review.

This preview is unsigned and uses manual ZIP updates. No installer or registry changes are required.
