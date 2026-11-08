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
