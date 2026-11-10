# pre-midi 0.14.1-preview.31 - Windows portable preview

Windows 11 x64 portable ZIP, with manual updates and folder-local data.

## Changes since preview.29

- Native Pause/resume bypass preparation and export queues. Owned Stop gates the audio callback immediately. Paused seeks retain their position; stale Stop requests cannot stop a new playback. Windows launch checks observe callback completion before measuring the held clock.
- Shared compressor, gate, sample-peak limiter and split-band de-esser, with precise controls and interactive illustrations. Each note or vocal Clip has an independent stereo-linked detector.
- Shared algorithmic reverb for synths, samples and vocals: pre-delay, decay, damping, size, mix and stereo width. Room and echo run in parallel; playback, loops, reconstructed seeks and WAV export preserve their tails.
- Independent filter, drive and EQ instances, four parallel tone routes and compensated branch blends.
- Eight parameter automation lanes with linear, exponential and step interpolation, portable recall and original source-phase timing.
- Experimental Song streaming now includes prepared seeks, continuous loops, live edits, paused replacements, count-in and synchronized capture. It remains opt-in; normal native playback retains its 600-second/4,096-onset limits.

Windows compilation, 14 Rust tests, dependency inspection and portable launch, update, isolation, move/copy and recovery checks passed. Focused native/browser reverb comparisons and 48 kHz streaming checks passed, with zero native callback allocations. These checks do not replace listening and microphone testing on your Windows 11 audio device.

## Install and test

Extract the complete ZIP into a writable folder and open `pre-midi.exe`. Keep `portable.txt` beside it. For a manual update, close the app and replace application files only; preserve `data/`, `projects/` and `exports/`.

Try play/pause/stop while seeking or editing. Try dynamics and reverb on a vocal and a sampled Sound, then save a preset, export/reopen a music ZIP and export a WAV. Plain `.premidi` files reference external audio; use music ZIPs to include those assets.

## Still on the roadmap

Modulation effects, independent pitch/time/formant processing, external sidechains, shared Track dynamics, gain-reduction meters, remaining automation scopes and physical device qualification remain unfinished. This is a test preview, not full roadmap completion.

This preview is unsigned and uses manual ZIP updates. No installer or registry changes are required.
