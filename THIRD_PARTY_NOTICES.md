# Third-party notices

The studio uses original synthesis and processing code alongside the native and browser dependencies listed here and in `native/THIRD-PARTY-NOTICES.txt`. Windows playback runs through C++17/miniaudio; browser independent source processing includes Signalsmith's embedded-WASM build.

The optional recorded instruments downloaded for the web deployment are **CC0 1.0 Universal**:
- [Meta Open Sound](https://github.com/facebookincubator/Meta-open-sound): piano, nylon and steel guitars.
- [Stargate Sample Pack](https://github.com/stargatedaw/stargate-sample-pack): percussion.
- [Versilian Community Sample Library](https://github.com/sgossner/VCSL): recorder and whistle.

License: https://creativecommons.org/publicdomain/zero/1.0/

Exact upstream paths, pinned revisions, and blob hashes are in `samples.js` and `acousticGuitars.js`; see `docs/sample-sources.md`. The build verifies each download. These samples are staged into the site, not committed to the repository.

An author's imported audio retains its own licensing terms. Portable exports bundle only referenced audio files under `assets/` beside the native `.premidi` manifest. Audio bytes are **not** embedded in `.premidi`.

## Signalsmith Stretch 1.3.2 and Signalsmith Linear 0.6.6

Pitch/time/formant processing uses the official Signalsmith C++ library and its embedded-WASM build. Source revisions and the web-initializer adaptation are recorded in native/vendor/signalsmith-stretch/provenance.json.

MIT License

Copyright (c) 2022 Geraint Luff / Signalsmith Audio Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
MIT License

Copyright (c) 2025 Signalsmith Audio

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
