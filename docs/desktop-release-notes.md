# pre-midi 0.14.1-preview.36 - Windows portable preview

Windows 11 x64 portable ZIP, with manual updates and folder-local data.

## Changes since preview.34

- Shared waveform source crops for samples and vocals, with per-zone selection, numerical/keyboard edits, zoom and reversible source boundaries.
- Sampler sustain loops and crossfades. Edit loop start/end and the overlap boundary in the waveform. Notes repeat through their release fade; one-shot retains full-source playback. Tail/head overlap shortens the repeat by the overlap, shown in the readout.
- Key and velocity ranges with two-axis graph boundaries and precise fields. Notes outside all mapped regions are silent; overlapping candidates retain nearest recorded-key/take selection.
- Loop points follow crop, reverse and independent time/pitch. Preview, measured scope, Beat/Song playback and WAV export use the same note/release lifetime.
- Waveform controls expose separate accessible start/end/overlap sliders and retain their zoom window while dragging. Mapping focus survives edits.
- Source inspection shares pending decodes and invalidates replaced audio by registry revision. Existing urgent native pause/resume/Stop and ownership safeguards remain in place.

Original recordings stay unchanged and external to `.premidi`. Sustain overlap is linear, limited to half the source loop or 500 ms. Native interpolation and browser preparation use the same frame boundaries; native audio callbacks allocate no loop memory. Native keyboard auditions retain the existing timed-preview policy; live native MIDI/QWERTY note-off is separate work.

Focused source/data, DSP and shared-editor checks passed locally, including native/browser PCM with pitch movement, stereo, reverse/stretch, release, seek and block continuity. The 48 kHz null-device streaming checks passed with source loops and zero callback allocations. The release workflow records the matching Windows build and portable acceptance results.

## Install and test

Extract the complete ZIP into a writable folder and open `pre-midi.exe`. Keep `portable.txt` beside it. For a manual update, close the app and replace application files only; preserve `data/`, `projects/` and `exports/`.

On a sampled Sound, open source region and select sustain loop. Enable the loop, adjust its endpoints/overlap, then place a long note and listen through release. Compare rate transpose, independent pitch/time and reverse. Select key + velocity to edit its playing range; test notes inside/outside it. Try save/reopen, undo and WAV export, then play/pause/stop during source edits. Music ZIPs include audio assets; plain `.premidi` files reference them.

## Still on the roadmap

The full roadmap is not complete. Wider automation/modulation targets and gesture recording, shared buses/sidechains/global latency compensation, monophonic correction/tuning, waveform articulation overlays, remaining noise/shaper controls and physical/newcomer/listening qualification remain open. Phone and game-host completion remain separate work.

This preview is unsigned and uses manual ZIP updates. No installer or registry changes are required.
