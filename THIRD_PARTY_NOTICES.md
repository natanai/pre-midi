# Third-party sample notices

The application uses built-in Web Audio and original procedural synthesis code; it does not bundle a third-party audio runtime.

The optional recorded instruments downloaded for the web deployment are **CC0 1.0 Universal**:
- [Meta Open Sound](https://github.com/facebookincubator/Meta-open-sound): piano, nylon and steel guitars.
- [Stargate Sample Pack](https://github.com/stargatedaw/stargate-sample-pack): percussion.
- [Versilian Community Sample Library](https://github.com/sgossner/VCSL): recorder and whistle.

License: https://creativecommons.org/publicdomain/zero/1.0/

Exact upstream paths, pinned revisions, and blob hashes are in `samples.js` and `acousticGuitars.js`; see `docs/sample-sources.md`. The build verifies each download. These samples are staged into the site, not committed to the repository.

An author's imported audio retains its own licensing terms. Portable exports bundle only referenced audio files under `assets/` beside the native `.premidi` manifest. Audio bytes are **not** embedded in `.premidi`.
