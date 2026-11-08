# original factory audio sources

These five WAV files were synthesized specifically for pre-midi and are not
samples of Blindside's recording or any other commercially released song.

The files are deterministic, original PCM mono WAV at 22,050 Hz and 16 bits,
and have been contributed to the pre-midi factory sound library for anyone to
use in beats, games, and exported projects.

| id | use | reference MIDI note | Git blob SHA-1 |
| --- | --- | ---: | --- |
| picked-wire-a3 | plucked string-like source | 57 (A3) | c5e634057fc4ba08c0318663c6702ae7e791c6b5 |
| muted-amp-a2 | short overdriven pluck | 45 (A2) | 58fe03e1123537e11a0a8dc31725647216653fd8 |
| room-kick-01 | synthesized low drum kick | 60 | 35c5f044d97d4c3e2365aa4f8e1830585af0abc8 |
| room-snare-01 | synthesized noise/snare hit | 60 | 5982edb42443b7728f3bef807428cd22f38c574f |
| sharp-hat-01 | synthesized hi-hat | 60 | 5a57f4dfcf35030ae0cb3e31f717433bc84a9913 |

No third-party sample or licensed recording was used in their creation.
These are shared-source audio files; native song files that use the current
sample-asset format still require their own companion bytes at import time
unless a future version adds explicit factory-asset resolution.

## Lo-fi keys and drums (original)

The following fourteen WAV sources were synthesized specifically for the studio. Each is a distinct deterministic waveform; no audio file or sample region is reused for multiple new sounds. These are original synthesized timbres, not recordings of acoustic instruments or commercial music. Regenerate them using `node scripts/generate-lofi-samples.mjs`.

| id | sonic source | reference MIDI note | Git blob SHA-1 |
| --- | --- | ---: | --- |
| felt-upright-c4 | a soft, damped acoustic-key model | 60 | 92238b146fabd94e5d3b9af883360ecb26e25627 |
| worn-reed-c4 | asymmetric electric-reed harmonics | 60 | 0ce642f2afb325a4edbf556223ef22ba04daff66 |
| thumb-tines-c4 | short falling-pitch metal-tine pluck | 60 | 6da84a1fffa0c3fd68aa4580cc3acbf6af532b62 |
| tape-celesta-c5 | fluttering inharmonic struck bell | 72 | 677441ef1ed6a9ffe655ffba461fb3976cc4901a |
| dusty-vibes-c4 | long struck bar with slow tremolo | 60 | 7fa11f185224e60843ebcd75d13a34dafc442970 |
| tape-kick-01 | saturated soft low kick | 60 | f0ff86feaf8f1c4dc19fd852defaaafc278124ed |
| cardboard-snare-01 | boxy body and low-passed snap | 60 | 5f857aa6935bde759ea0ec4c3693f78c394b8210 |
| brushed-snare-01 | soft brushed noise with low resonance | 60 | eac77284f78fed6a437161709608ab1e056bb165 |
| soft-hat-01 | short restrained metallic tick | 60 | 3cacb3e0715945d50c185f6327e5f6edc5151bcb |
| washed-hat-01 | long subdued open cymbal wash | 60 | ec565f5628258196446895bdd97a5a7cde1c2bcd |
| vinyl-rim-01 | sharp stick click with ringing overtones | 60 | c30ebde571f8df4cdb10178e5e619ddc9d998c12 |
| dusty-clap-01 | three closely spaced hand-clap bursts | 60 | fff90a9b91cc5e95cd79f4964adde1695c113c1e |
| loose-shaker-01 | irregular grainy shaker pulses | 60 | d64a9b2b5f33f20b2809ae8ea8ea5778cecba7ab |
| wood-tom-01 | falling wooden tom-like resonance | 60 | 47e4991ba787481f0224111ca86529fcea3bc97d |

Like the original five sources, these are 22,050 Hz, 16-bit mono PCM WAV files. Every asset stays under the application's 1 MB per-sample import limit.
