# Recorded sample provenance

Pre-midi fetches the following **CC0 1.0** libraries only for a verified web build. The original paths, immutable commits and Git blob SHA-1 checksums are defined in `samples.js` and `acousticGuitars.js`. `scripts/fetch-samples.mjs` rejects changed bytes. `samples/` is intentionally ignored by Git.

| Provider | Selected recordings |
| --- | --- |
| [Meta Open Sound](https://github.com/facebookincubator/Meta-open-sound) | Piano C3/C4; 18 nylon fingerstyle takes; 36 light/firm nylon picked takes; 54 steel guitar dynamic takes across 18 pitches |
| [Stargate Sample Pack](https://github.com/stargatedaw/stargate-sample-pack) | Recorded kick, wood/tape snares, hand claps, live and machine hats, rimshot, crash, low/mid/high toms, shaker, bongo, machine kick/snare and additional drum hits |
| [Versilian Community Sample Library](https://github.com/sgossner/VCSL) | Alto recorder and ball whistle |

License: https://creativecommons.org/publicdomain/zero/1.0/

The curated guitar range is approximately E2–B5. This is a sampled-instrument subset, not a complete SoundFont/SFZ bank. Pitch interpolation, dynamic sample choice and note instructions remain native to pre-midi's audio engine.

**Factory drum racks:** The Drums category contains three editable starting kits beneath individual hits: Warm Room Kit (intimate acoustic indie rock), Night Drive Kit (machine pulse plus acoustic accents), and Distant Static Kit (restrained acoustic/electronic layering). These are original combinations inspired by broad production approaches, not recordings or samples from commercial songs. Every individual recorded sample listed under Drums is used in at least one preset rack; synth hits are reusable alongside them. Rack selections reuse the same pinned assets, not duplicate embedded audio.

**Packaging:** the web Pages build stages exact checked audio into its published `samples/` directory. When a project uses sampled audio, its portable ZIP contains a `.premidi` JSON manifest plus referenced audio in `assets/`. The manifest does not embed Base64 or raw audio. Imported user recordings are the author's responsibility to license for redistribution. The [third-party notices](../THIRD_PARTY_NOTICES.md) remain part of the deployment.
