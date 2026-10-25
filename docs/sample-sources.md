# Recorded sample sources and reproducibility

Pre-midi's first recorded instruments contain selected recordings from three libraries published as CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/).

| Collection | License | Source | Included |
|---|---|---|---|
| Meta Piano | CC0 | https://github.com/facebookincubator/Meta-open-sound | C3 and C4 piano samples |
| Meta Nylon Guitar | CC0 | https://github.com/facebookincubator/Meta-open-sound | C3 and C4 finger-plucked guitar samples |
| Meta Steel Guitar | CC0 | https://github.com/facebookincubator/Meta-open-sound | C3 and C4 steel-guitar samples |
| Stargate Sample Pack | CC0 | https://github.com/stargatedaw/stargate-sample-pack | Kick, snare, clap, closed/open hi-hat, bongo |
| Versilian Community Sample Library (VCSL) | CC0 | https://github.com/sgossner/VCSL | Alto recorder and ball whistle |

Every original path, immutable source commit, and Git blob checksum is in samples.js.
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

Piano and guitars are two-zone pitched sampled instruments, not a full
multisampled SoundFont. Their recorded tones are pitch-shifted between roots;
more key zones, dynamics, velocity layers and SFZ/SF2 import can extend this
single sampler implementation in future work.
