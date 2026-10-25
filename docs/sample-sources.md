# Recorded sample sources and reproducibility

Pre-midi's first recorded instruments contain selected recordings from three libraries published as CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/).

| Collection | License | Source | Included |
|---|---|---|---|
| Meta Piano | CC0 | https://github.com/facebookincubator/Meta-open-sound | C3 and C4 piano samples |
| Meta Nylon Guitar | CC0 | https://github.com/facebookincubator/Meta-open-sound | 54 finger-plucked notes and 36 picked light/firm takes; source spans all six strings |
| Meta Steel Guitar | CC0 | https://github.com/facebookincubator/Meta-open-sound | 54 soft, medium and firm string takes, across 18 pitches |
| Stargate Sample Pack | CC0 | https://github.com/stargatedaw/stargate-sample-pack | Kick, snare, clap, closed/open hi-hat, bongo |
| Versilian Community Sample Library (VCSL) | CC0 | https://github.com/sgossner/VCSL | Alto recorder and ball whistle |

Every original path, immutable source commit, and Git blob checksum is in samples.js and acousticGuitars.js.
The GitHub Pages build runs scripts/fetch-samples.mjs to fetch and verify
the bytes, then includes them in the deployed static site. Corrupt or changed
downloads cause the deployment to fail instead of silently substituting sounds.

On selecting an instrument, the browser embeds its recordings directly inside
the .premidi composition. Game playback will eventually use this same score
contract when pre-programmed reaches the planned native parity milestone.
A complete exported score can play without access to either the Pages website
or the external sample providers.

The personally saved preset library is local to the browser; a composition's
own sounds are always embedded in its portable file. Imported user WAV/OGG/MP3
files are labeled by original filename, and users remain responsible for their
redistribution rights.

The separate Meta Oculus Audio Pack requires attribution under CC BY and is
not included. No external audio runtime libraries or sample plugin code are
included. Synth and sampler audio use built-in Web Audio APIs.

## Current limits

Piano still uses two recorded pitches. The guitars now use a curated
18-note fretboard selection from E2 through B5. Nylon Fingerstyle uses 18
fingerstyle recordings, Nylon Picked uses 36 light/firm samples, and Steel
Acoustic/Steel Strum share 54 soft/medium/firm recordings. Original legacy
C3/C4 sample IDs remain addressable in old v4 compositions. All downloaded
recordings are verified at build time. Per-note dynamics choose a different
*recorded* attack, not a filter imposed on the same sound.

This does not yet model releases, fret slides, palm muting or true physical
string choking, nor does it load complete SFZ/SF2 banks. Root notes are
spaced no further than four semitones apart, limiting normal playback to
at most two semitones of pitch shift. Selected samples are embedded in the
composition; browser playback only decodes those actually used by its notes.
